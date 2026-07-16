import { FILTER_TYPES } from './config.js';

/**
 * Hash leaf format (robust with spaces / browser decoding):
 *   type:"value with spaces"
 *   NOT type:"value"
 *
 * Operators (spaces as written):
 *   " AND ", " OR ", " NOT ", "(", ")"
 *
 * Serialization groups same-type leaves with OR and different types with AND:
 *   actor:"Jude Law" AND director:"Anna Boden"
 *   ( actor:"A" OR actor:"B" ) AND genre:"Action"
 *
 * Values are always double-quoted so multi-word names round-trip even when
 * the browser decodes %20 to real spaces inside the fragment.
 */

const TYPE_SET = new Set(FILTER_TYPES);

function escapeQuoted(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function encodeLeaf(leaf) {
  const body = `${leaf.type}:"${escapeQuoted(leaf.value)}"`;
  return leaf.not ? `NOT ${body}` : body;
}

/**
 * Serialize one type's leaves:
 *   positives OR'd; negated leaves AND'd; then AND the two sides.
 * e.g. ( genre:"Action" OR genre:"Comedy" ) AND NOT genre:"Horror" AND NOT genre:"Thriller"
 *      NOT year:"2010" AND NOT year:"2011"
 */
function serializeTypeGroup(group) {
  if (!group.length) return '';
  const positives = group.filter((l) => !l.not);
  const negatives = group.filter((l) => l.not);
  const chunks = [];

  if (positives.length === 1) {
    chunks.push(encodeLeaf(positives[0]));
  } else if (positives.length > 1) {
    chunks.push(`( ${positives.map(encodeLeaf).join(' OR ')} )`);
  }
  for (const n of negatives) {
    chunks.push(encodeLeaf(n));
  }
  if (!chunks.length) return '';
  if (chunks.length === 1) return chunks[0];
  return chunks.join(' AND ');
}

/**
 * Build hash string (without leading #) from leaf list.
 * Preserves first-seen type order (insertion order of Map).
 */
export function leavesToHash(leaves) {
  if (!leaves.length) return '';

  const byType = new Map();
  for (const leaf of leaves) {
    if (!byType.has(leaf.type)) byType.set(leaf.type, []);
    byType.get(leaf.type).push(leaf);
  }

  const parts = [];
  for (const [, group] of byType) {
    const serialized = serializeTypeGroup(group);
    if (serialized) parts.push(serialized);
  }

  return parts.join(' AND ');
}

/**
 * Strip leading #, then percent-decode the fragment the way browsers store it.
 *
 * Setting location.hash to:  actor:"Jude Law" AND director:"Anna Boden"
 * yields location.hash like: #actor:%22Jude%20Law%22%20AND%20director:%22Anna%20Boden%22
 *
 * Without decoding, "%20AND%20" is not whitespace and not the token AND, so
 * the second filter fails to parse and the app clears all filters.
 *
 * After decodeURIComponent we get quoted leaves with real spaces, which tokenize cleanly.
 */
function normalizeHashInput(hash) {
  let s = String(hash || '');
  if (s.startsWith('#')) s = s.slice(1);
  s = s.trim();
  if (!s) return '';

  // Decode once when percent-escapes are present (browser fragment encoding).
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {
      /* keep original; per-value decode may still help */
    }
  }
  return s.trim();
}

function decodeValue(raw) {
  const v = String(raw);
  if (!/%[0-9A-Fa-f]{2}/.test(v)) return v;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Parse hash (with or without #) into leaves. Throws on invalid.
 */
export function hashToLeaves(hash) {
  const s = normalizeHashInput(hash);
  if (!s) return [];

  const tokens = tokenize(s);
  const leaves = parseExpression(tokens);
  return leaves;
}

function tokenize(s) {
  const tokens = [];
  let i = 0;

  while (i < s.length) {
    // Real whitespace, or residual %20 if a layer of encoding remains
    if (/\s/.test(s[i])) {
      i += 1;
      continue;
    }
    if (s.startsWith('%20', i)) {
      i += 3;
      continue;
    }
    if (s.startsWith('AND', i) && boundary(s, i, 3)) {
      tokens.push({ kind: 'AND' });
      i += 3;
      continue;
    }
    if (s.startsWith('OR', i) && boundary(s, i, 2)) {
      tokens.push({ kind: 'OR' });
      i += 2;
      continue;
    }
    if (s.startsWith('NOT', i) && boundary(s, i, 3)) {
      tokens.push({ kind: 'NOT' });
      i += 3;
      continue;
    }
    if (s[i] === '(') {
      tokens.push({ kind: 'LPAREN' });
      i += 1;
      continue;
    }
    if (s[i] === ')') {
      tokens.push({ kind: 'RPAREN' });
      i += 1;
      continue;
    }

    // Leaf: type:"quoted value"  or  type:unquoted (legacy / simple tokens)
    const typeMatch = /^([a-zA-Z_]+):/.exec(s.slice(i));
    if (!typeMatch) {
      throw new Error(`Invalid token near: ${s.slice(i, i + 24)}`);
    }
    const type = typeMatch[1].toLowerCase();
    if (!TYPE_SET.has(type)) {
      throw new Error(`Unknown filter type: ${type}`);
    }
    i += typeMatch[0].length;

    let value;
    if (s[i] === '"' || s[i] === '%') {
      // Quoted: "..." or percent-encoded quote %22...%22 (browser may encode " )
      if (s.startsWith('%22', i) || s[i] === '"') {
        const encodedQuote = s.startsWith('%22', i);
        i += encodedQuote ? 3 : 1;
        let raw = '';
        while (i < s.length) {
          if (!encodedQuote && s[i] === '\\' && i + 1 < s.length) {
            raw += s[i + 1];
            i += 2;
            continue;
          }
          if (!encodedQuote && s[i] === '"') {
            i += 1;
            break;
          }
          if (encodedQuote && s.startsWith('%22', i)) {
            i += 3;
            break;
          }
          // Allow literal spaces and %20 inside encoded-quote mode
          if (encodedQuote && s.startsWith('%20', i)) {
            raw += ' ';
            i += 3;
            continue;
          }
          raw += s[i];
          i += 1;
        }
        value = decodeValue(raw);
      } else {
        // Unquoted but starts with % (e.g. %20 only in value — rare)
        const rest = s.slice(i);
        const m = /^([^\s)]+)/.exec(rest);
        if (!m) throw new Error(`Missing filter value near: ${s.slice(i, i + 24)}`);
        value = decodeValue(m[1]);
        i += m[1].length;
      }
    } else {
      // Unquoted legacy: Action, Jude%20Law — stop at whitespace or ')'
      const rest = s.slice(i);
      const m = /^([^\s)]+)/.exec(rest);
      if (!m) {
        throw new Error(`Missing filter value near: ${s.slice(i, i + 24)}`);
      }
      value = decodeValue(m[1]);
      i += m[1].length;
    }

    tokens.push({ kind: 'LEAF', type, value });
  }

  return tokens;
}

function boundary(s, i, len) {
  const before = i === 0 || /\s|\(/.test(s[i - 1]);
  const after = i + len >= s.length || /\s|\)/.test(s[i + len]);
  return before && after;
}

/**
 * Flatten parse tree to leaves (structure re-derived on serialize by type).
 * Grammar: andExpr := orExpr ( AND orExpr )*
 *          orExpr  := notExpr ( OR notExpr )*
 *          notExpr := NOT* primary
 *          primary := LEAF | ( andExpr )
 */
function parseExpression(tokens) {
  const ctx = { tokens, i: 0 };
  const leaves = parseAnd(ctx);
  if (ctx.i !== tokens.length) {
    throw new Error('Unexpected trailing tokens');
  }
  return leaves;
}

function parseAnd(ctx) {
  let left = parseOr(ctx);
  while (peek(ctx)?.kind === 'AND') {
    ctx.i += 1;
    const right = parseOr(ctx);
    left = left.concat(right);
  }
  return left;
}

function parseOr(ctx) {
  let left = parseNot(ctx);
  while (peek(ctx)?.kind === 'OR') {
    ctx.i += 1;
    const right = parseNot(ctx);
    left = left.concat(right);
  }
  return left;
}

function parseNot(ctx) {
  let negated = false;
  while (peek(ctx)?.kind === 'NOT') {
    ctx.i += 1;
    negated = !negated;
  }
  const leaves = parsePrimary(ctx);
  if (negated) {
    return leaves.map((l) => ({ ...l, not: !l.not }));
  }
  return leaves;
}

function parsePrimary(ctx) {
  const t = peek(ctx);
  if (!t) throw new Error('Unexpected end of hash');
  if (t.kind === 'LPAREN') {
    ctx.i += 1;
    const inner = parseAnd(ctx);
    if (peek(ctx)?.kind !== 'RPAREN') throw new Error('Missing )');
    ctx.i += 1;
    return inner;
  }
  if (t.kind === 'LEAF') {
    ctx.i += 1;
    return [{ type: t.type, value: t.value, not: false }];
  }
  throw new Error(`Unexpected token ${t.kind}`);
}

function peek(ctx) {
  return ctx.tokens[ctx.i];
}

function hashesEquivalent(a, b) {
  const na = normalizeHashInput(a);
  const nb = normalizeHashInput(b);
  if (na === nb) return true;
  // Compare parsed leaves when both parse
  try {
    const la = hashToLeaves(a);
    const lb = hashToLeaves(b);
    if (la.length !== lb.length) return false;
    const key = (l) => `${l.not ? 1 : 0}|${l.type}|${String(l.value).toLowerCase()}`;
    const sa = la.map(key).sort().join('\0');
    const sb = lb.map(key).sort().join('\0');
    return sa === sb;
  } catch {
    return false;
  }
}

export function writeHash(leaves) {
  const encoded = leavesToHash(leaves);
  const next = encoded ? `#${encoded}` : '';
  const current = location.hash || '';

  if (!encoded) {
    if (current && current !== '#') {
      history.pushState(null, '', location.pathname + location.search);
    }
    return;
  }

  if (hashesEquivalent(current, next)) {
    return;
  }

  // Assign without leading #; browser adds it. Prefer replaceState-style when
  // only encoding differs — still push for real filter changes via assignment.
  location.hash = encoded;
}

export function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}
