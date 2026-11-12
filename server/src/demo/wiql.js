// Tiny WIQL evaluator for demo mode: only the query shapes azdo.js generates.
// SELECT ... FROM WorkItems WHERE <cond> [ORDER BY ...]
// cond: [Field] (= | <> | >= | <= | > | < | IN | NOT IN | CONTAINS | UNDER) value, AND/OR, parentheses.
// Values: 'string', number, (list), @project, @me, @today [- N]. No eval: a small recursive-descent parser.

const TOKEN = /\s*(\[[^\]]+\]|'(?:[^']|'')*'|@\w+|\d+(?:\.\d+)?|<>|>=|<=|=|>|<|\(|\)|,|-|[A-Za-z_]+)/y;

function tokenize(text) {
  const out = [];
  const end = text.trimEnd().length;
  let pos = 0;
  while (pos < end) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) throw new Error(`WIQL: cannot parse near "${text.slice(pos, pos + 20)}"`);
    out.push(m[1]);
    pos = TOKEN.lastIndex;
  }
  return out;
}

export function parseWiql(query) {
  const where = /\bWHERE\b([\s\S]*?)(\bORDER\s+BY\b([\s\S]*))?$/i.exec(query);
  if (!where) return { cond: null, orderBy: [] };
  const tokens = tokenize(where[1]);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const kw = (w) => String(peek() || '').toUpperCase() === w;

  function value() {
    const t = next();
    if (t === '(') {
      const list = [];
      while (peek() !== ')') {
        list.push(value());
        if (peek() === ',') next();
      }
      next();
      return list;
    }
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (t === '@today') {
      if (peek() === '-') {
        next();
        return { today: -Number(next()) };
      }
      return { today: 0 };
    }
    if (t.startsWith('@')) return { macro: t.slice(1).toLowerCase() };
    if (/^\d/.test(t)) return Number(t);
    throw new Error(`WIQL: unexpected value ${t}`);
  }

  function cond() {
    if (peek() === '(') {
      next();
      const e = or();
      next(); // )
      return e;
    }
    const field = next().slice(1, -1);
    let op = String(next()).toUpperCase();
    if (op === 'NOT') op = `NOT ${String(next()).toUpperCase()}`;
    return { field, op, value: value() };
  }
  function and() {
    const parts = [cond()];
    while (kw('AND')) {
      next();
      parts.push(cond());
    }
    return parts.length === 1 ? parts[0] : { and: parts };
  }
  function or() {
    const parts = [and()];
    while (kw('OR')) {
      next();
      parts.push(and());
    }
    return parts.length === 1 ? parts[0] : { or: parts };
  }

  const orderBy = (where[3] || '')
    .split(',')
    .map((s) => /\[([^\]]+)\]\s*(ASC|DESC)?/i.exec(s))
    .filter(Boolean)
    .map((m) => ({ field: m[1], desc: String(m[2]).toUpperCase() === 'DESC' }));
  return { cond: or(), orderBy };
}

const lc = (v) => String(v ?? '').toLowerCase();

// A person field ("Name <email>") matches its full text, name or e-mail.
function personMatches(stored, wanted) {
  const s = lc(stored);
  const w = lc(wanted);
  const m = /^(.*?)\s*<([^>]+)>$/.exec(s);
  return s === w || (m && (m[1] === w || m[2] === w));
}

export function evaluate(node, fields, ctx) {
  if (!node) return true;
  if (node.and) return node.and.every((n) => evaluate(n, fields, ctx));
  if (node.or) return node.or.some((n) => evaluate(n, fields, ctx));
  const raw = fields[node.field];
  let want = node.value;
  if (want?.macro === 'project') want = ctx.project;
  else if (want?.macro === 'me') want = ctx.me;
  else if (want?.today !== undefined) {
    const d = new Date(ctx.now);
    d.setHours(0, 0, 0, 0);
    want = new Date(d.getTime() + want.today * 86_400_000).toISOString();
  }
  const isPerson = node.field === 'System.AssignedTo' || node.field === 'System.ChangedBy' || node.field === 'System.CreatedBy';
  const eq = (a, b) => (isPerson ? personMatches(a, b) : lc(a) === lc(b));
  switch (node.op) {
    case '=':
      return node.field === 'System.TeamProject' ? lc(want) === lc(ctx.project) : eq(raw, want);
    case '<>':
      return !eq(raw, want);
    case 'IN':
      return want.some((w) => eq(raw, w));
    case 'NOT IN':
      return !want.some((w) => eq(raw, w));
    case 'CONTAINS':
      return lc(raw).includes(lc(want));
    case 'UNDER':
      return lc(raw) === lc(want) || lc(raw).startsWith(`${lc(want)}\\`);
    case '>=':
      return raw !== undefined && String(raw) >= String(want);
    case '<=':
      return raw !== undefined && String(raw) <= String(want);
    case '>':
      return raw !== undefined && String(raw) > String(want);
    case '<':
      return raw !== undefined && String(raw) < String(want);
    default:
      throw new Error(`WIQL: unsupported operator ${node.op}`);
  }
}

export function runWiql(query, rows, ctx) {
  const { cond, orderBy } = parseWiql(query);
  const out = rows.filter((r) => evaluate(cond, r.fields, ctx));
  if (orderBy.length) {
    out.sort((a, b) => {
      for (const { field, desc } of orderBy) {
        const x = a.fields[field];
        const y = b.fields[field];
        if (x === y) continue;
        if (x === undefined) return 1;
        if (y === undefined) return -1;
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return desc ? -c : c;
      }
      return 0;
    });
  }
  return out;
}
