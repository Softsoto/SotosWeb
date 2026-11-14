/* ============================================================
   Sotos OS — motor de fórmulas de Hojas
   © 2026 Sebastian Sotomontes

   Parser propio (sin eval/Function): números, texto, referencias
   (A1, $B$2, AA10), rangos (A1:C5), + - * / ^ & y comparaciones,
   y funciones SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, ROUND,
   ABS, SQRT, POWER, CONCAT, LEN, UPPER, LOWER, TODAY, NOW, AND, OR, NOT.
   ============================================================ */

export const colToNum = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
export const numToCol = (n) => { let s = ""; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const parseRef = (ref) => { const m = /^\$?([A-Z]{1,3})\$?(\d{1,6})$/i.exec(ref); return m ? { c: colToNum(m[1]), r: +m[2] - 1 } : null; };
export const refName = (c, r) => numToCol(c) + (r + 1);

class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
const ERR = (c) => new FErr(c);
export const isErr = (v) => v instanceof FErr;

function tokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) { const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?%?/.exec(src.slice(i)); if (!m) throw ERR("#ERR"); let v = parseFloat(m[0]); if (m[0].endsWith("%")) v /= 100; t.push({ k: "num", v }); i += m[0].length; continue; }
    if (ch === '"') { let j = i + 1, s = ""; while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; } if (j >= src.length) throw ERR("#ERR"); t.push({ k: "str", v: s }); i = j + 1; continue; }
    const id = /^\$?[A-Z]{1,3}\$?\d{1,6}(?::\$?[A-Z]{1,3}\$?\d{1,6})?|^[A-Z_][A-Z0-9_.]*/i.exec(src.slice(i));
    if (id) {
      const w = id[0];
      if (w.includes(":")) t.push({ k: "range", v: w.toUpperCase().replace(/\$/g, "") });
      else if (parseRef(w)) t.push({ k: "ref", v: w.toUpperCase().replace(/\$/g, "") });
      else if (/^(TRUE|VERDADERO)$/i.test(w)) t.push({ k: "bool", v: true });
      else if (/^(FALSE|FALSO)$/i.test(w)) t.push({ k: "bool", v: false });
      else t.push({ k: "fn", v: w.toUpperCase() });
      i += w.length; continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "<>"].includes(two)) { t.push({ k: "op", v: two }); i += 2; continue; }
    if ("+-*/^&=<>(),;".includes(ch)) { t.push({ k: ch === "(" || ch === ")" ? ch : ch === "," || ch === ";" ? "," : "op", v: ch }); i++; continue; }
    throw ERR("#ERR");
  }
  return t;
}

// gramática: cmp > concat > add > mul > pow > unary > primary
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p], eat = () => tokens[p++];
  const expect = (k) => { const x = eat(); if (!x || x.k !== k) throw ERR("#ERR"); return x; };
  const bin = (next, ops) => () => { let l = next(); while (peek() && peek().k === "op" && ops.includes(peek().v)) { const op = eat().v; l = { t: "bin", op, l, r: next() }; } return l; };
  const primary = () => {
    const x = eat(); if (!x) throw ERR("#ERR");
    if (x.k === "num" || x.k === "str" || x.k === "bool") return { t: "lit", v: x.v };
    if (x.k === "ref") return { t: "ref", v: x.v };
    if (x.k === "range") return { t: "range", v: x.v };
    if (x.k === "(") { const e = cmp(); expect(")"); return e; }
    if (x.k === "fn") { expect("("); const args = []; if (peek() && peek().k !== ")") { args.push(cmp()); while (peek() && peek().k === ",") { eat(); args.push(cmp()); } } expect(")"); return { t: "call", fn: x.v, args }; }
    throw ERR("#ERR");
  };
  const unary = () => { if (peek() && peek().k === "op" && (peek().v === "-" || peek().v === "+")) { const op = eat().v; const e = unary(); return op === "-" ? { t: "neg", e } : e; } return primary(); };
  const pow = bin(unary, ["^"]);
  const mul = bin(pow, ["*", "/"]);
  const add = bin(mul, ["+", "-"]);
  const concat = bin(add, ["&"]);
  const cmp = bin(concat, ["=", "<", ">", "<=", ">=", "<>"]);
  const e = cmp(); if (p < tokens.length) throw ERR("#ERR"); return e;
}

const toNum = (v) => { if (isErr(v)) throw v; if (typeof v === "number") return v; if (typeof v === "boolean") return v ? 1 : 0; if (v === "" || v == null) return 0; const n = Number(String(v).replace(",", ".")); if (isNaN(n)) throw ERR("#VALOR!"); return n; };
const toStr = (v) => { if (isErr(v)) throw v; if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO"; return v == null ? "" : String(v); };
const flat = (args) => args.flat(Infinity);
const nums = (args) => flat(args).filter(v => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)))).map(Number);

const FN = {
  SUM: a => nums(a).reduce((s, x) => s + x, 0), SUMA: a => FN.SUM(a),
  AVERAGE: a => { const n = nums(a); if (!n.length) throw ERR("#DIV/0!"); return FN.SUM(a) / n.length; }, PROMEDIO: a => FN.AVERAGE(a),
  MIN: a => { const n = nums(a); return n.length ? Math.min(...n) : 0; }, MAX: a => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
  COUNT: a => nums(a).length, CONTAR: a => FN.COUNT(a),
  COUNTA: a => flat(a).filter(v => v !== "" && v != null).length, CONTARA: a => FN.COUNTA(a),
  ROUND: a => { const d = a[1] == null ? 0 : toNum(a[1]); const f = 10 ** d; return Math.round(toNum(a[0]) * f) / f; }, REDONDEAR: a => FN.ROUND(a),
  ABS: a => Math.abs(toNum(a[0])), SQRT: a => { const n = toNum(a[0]); if (n < 0) throw ERR("#NUM!"); return Math.sqrt(n); }, RAIZ: a => FN.SQRT(a),
  POWER: a => toNum(a[0]) ** toNum(a[1]), POTENCIA: a => FN.POWER(a),
  CONCAT: a => flat(a).map(toStr).join(""), CONCATENAR: a => FN.CONCAT(a),
  LEN: a => toStr(a[0]).length, LARGO: a => FN.LEN(a),
  UPPER: a => toStr(a[0]).toUpperCase(), MAYUSC: a => FN.UPPER(a),
  LOWER: a => toStr(a[0]).toLowerCase(), MINUSC: a => FN.LOWER(a),
  AND: a => flat(a).every(v => !!toNum(v)), Y: a => FN.AND(a),
  OR: a => flat(a).some(v => !!toNum(v)), O: a => FN.OR(a),
  NOT: a => !toNum(a[0]), NO: a => FN.NOT(a),
  TODAY: () => new Date().toLocaleDateString("es-ES"), HOY: () => FN.TODAY(),
  NOW: () => new Date().toLocaleString("es-ES"), AHORA: () => FN.NOW(),
};

/**
 * Crea un evaluador para un mapa de celdas { A1: "raw", ... }.
 * Devuelve value(ref) con memo y detección de ciclos.
 */
export function makeEvaluator(cells) {
  const memo = new Map(), busy = new Set();
  const astCache = new Map();
  const value = (ref) => {
    if (memo.has(ref)) return memo.get(ref);
    const raw = cells[ref];
    let v;
    if (raw == null || raw === "") v = "";
    else if (typeof raw === "string" && raw[0] === "=" && raw.length > 1) {
      if (busy.has(ref)) return ERR("#CICLO!");
      busy.add(ref);
      try {
        let ast = astCache.get(raw); if (!ast) { ast = parse(tokenize(raw.slice(1))); astCache.set(raw, ast); }
        v = ev(ast);
        if (Array.isArray(v)) v = v.flat(Infinity)[0] ?? "";
        if (typeof v === "number" && !isFinite(v)) v = ERR("#DIV/0!");
      } catch (e) { v = isErr(e) ? e : ERR("#ERR"); }
      busy.delete(ref);
    } else {
      const s = String(raw).trim();
      v = s !== "" && !isNaN(Number(s)) ? Number(s) : raw;
    }
    memo.set(ref, v); return v;
  };
  const range = (r) => {
    const [a, b] = r.split(":").map(parseRef); if (!a || !b) throw ERR("#REF!");
    const out = [];
    for (let rr = Math.min(a.r, b.r); rr <= Math.max(a.r, b.r); rr++) {
      const row = []; for (let cc = Math.min(a.c, b.c); cc <= Math.max(a.c, b.c); cc++) { const v = value(refName(cc, rr)); if (isErr(v)) throw v; row.push(v); }
      out.push(row);
    }
    if (out.length * (out[0]?.length || 0) > 200000) throw ERR("#REF!");
    return out;
  };
  const ev = (n) => {
    switch (n.t) {
      case "lit": return n.v;
      case "ref": { const v = value(n.v); if (isErr(v)) throw v; return v; }
      case "range": return range(n.v);
      case "neg": return -toNum(ev(n.e));
      case "call": {
        if (n.fn === "IF" || n.fn === "SI") { const c = ev(n.args[0]); return toNum(c) ? (n.args[1] ? ev(n.args[1]) : true) : (n.args[2] ? ev(n.args[2]) : false); }
        const f = Object.prototype.hasOwnProperty.call(FN, n.fn) ? FN[n.fn] : null; if (!f) throw ERR("#NOMBRE?");
        return f(n.args.map(ev));
      }
      case "bin": {
        const l = ev(n.l), r = ev(n.r);
        switch (n.op) {
          case "+": return toNum(l) + toNum(r);
          case "-": return toNum(l) - toNum(r);
          case "*": return toNum(l) * toNum(r);
          case "/": { const d = toNum(r); if (d === 0) throw ERR("#DIV/0!"); return toNum(l) / d; }
          case "^": return toNum(l) ** toNum(r);
          case "&": return toStr(l) + toStr(r);
          default: {
            const both = typeof l === "number" && typeof r === "number";
            const a = both ? l : toStr(l).toLowerCase(), b = both ? r : toStr(r).toLowerCase();
            return n.op === "=" ? a === b : n.op === "<>" ? a !== b : n.op === "<" ? a < b : n.op === ">" ? a > b : n.op === "<=" ? a <= b : a >= b;
          }
        }
      }
    }
    throw ERR("#ERR");
  };
  return { value };
}

export function display(v) {
  if (isErr(v)) return v.code;
  if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  return v == null ? "" : String(v);
}
