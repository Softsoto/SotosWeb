/* ============================================================
   Sotos — motor de ajedrez propio (sin bibliotecas)
   Tablero 0x88, reglas completas (enroque, al paso, promoción, jaque mate, ahogado,
   repetición, 50 movimientos, material insuficiente), notación SAN en español e inglés,
   FEN, PGN y búsqueda alfa-beta con profundización iterativa, quiescencia, extensión
   de jaque, movimientos asesinos e historial. Verificado con perft.
   © 2026 Sebastian Sotomontes
   ============================================================ */
(function (root) {
  "use strict";
  var START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  var ND = [-33, -31, -18, -14, 14, 18, 31, 33], BD = [-17, -15, 15, 17], RD = [-16, -1, 1, 16], KD = BD.concat(RD);
  var VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  var ES = { k: "R", q: "D", r: "T", b: "A", n: "C" }, EN = { k: "K", q: "Q", r: "R", b: "B", n: "N" };
  var CASTLE_MASK = new Array(128).fill(15); CASTLE_MASK[116] = 12; CASTLE_MASK[4] = 3; CASTLE_MASK[119] = 14; CASTLE_MASK[112] = 13; CASTLE_MASK[7] = 11; CASTLE_MASK[0] = 7;
  var ROOK = { 118: [119, 117], 114: [112, 115], 6: [7, 5], 2: [0, 3] };
  var white = function (p) { return p < "a"; };
  var sqName = function (s) { return "abcdefgh"[s & 7] + (8 - (s >> 4)); };
  var sqOf = function (n) { return (8 - +n[1]) * 16 + "abcdefgh".indexOf(n[0]); };

  /* tablas de posición (desde las blancas, fila 0 = octava) */
  var PST = {}, d4 = function (r, f) { return Math.abs(3.5 - r) + Math.abs(3.5 - f); };
  ["p", "n", "b", "r", "q", "k", "K"].forEach(function (t) {
    PST[t] = []; for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) { var adv = 6 - r, c = d4(r, f), v = 0;
      if (t === "p") v = r === 0 || r === 7 ? 0 : adv * adv * 2.5 + ((f === 3 || f === 4) ? (adv >= 1 ? 12 : -8) : 0) + ((f === 2 || f === 5) && adv >= 1 ? 4 : 0) - ((f >= 5 || f === 0) && adv >= 1 && adv <= 2 ? 10 : 0); // sin abrir el enroque sin motivo
      else if (t === "n") v = 28 - c * 11 - (r === 7 ? 6 : 0);
      else if (t === "b") v = 12 - c * 5 - (r === 7 ? 8 : 0) + ((r === f || r + f === 7) ? 6 : 0);
      else if (t === "r") v = (r === 1 ? 18 : 0) + ((f === 3 || f === 4) && r === 7 ? 6 : 0);
      else if (t === "q") v = 6 - c * 3;
      else if (t === "k") v = r === 7 ? [12, 22, 16, -4, -2, 4, 24, 14][f] : -18 * (7 - r) - 10; // medio juego: refugio
      else v = 30 - c * 10; // final: al centro
      PST[t].push(Math.round(v)); }
  });

  function Chess(fen) { this.load(fen || START); }
  Chess.START = START;
  Chess.prototype.load = function (fen) {
    var a = String(fen).trim().split(/\s+/), b = new Array(128).fill(null), r = 0, f = 0;
    if (a.length < 2) throw new Error("FEN no válido");
    for (var i = 0; i < a[0].length; i++) { var ch = a[0][i];
      if (ch === "/") { r++; f = 0; } else if (/\d/.test(ch)) f += +ch; else { if (!/[prnbqkPRNBQK]/.test(ch) || r > 7 || f > 7) throw new Error("FEN no válido"); b[r * 16 + f] = ch; if (ch === "K") this.kw = r * 16 + f; if (ch === "k") this.kb = r * 16 + f; f++; } }
    if (this.kw == null || this.kb == null || b[this.kw] !== "K" || b[this.kb] !== "k") throw new Error("Falta un rey en la posición");
    this.b = b; this.turn = a[1] === "b" ? "b" : "w";
    this.cas = (a[2] || "").split("").reduce(function (m, c) { return m | ({ K: 1, Q: 2, k: 4, q: 8 }[c] || 0); }, 0);
    this.ep = a[3] && a[3] !== "-" ? sqOf(a[3]) : -1; this.half = +a[4] || 0; this.full = +a[5] || 1; this.hist = []; this.keys = [this.key()];
    return this;
  };
  Chess.prototype.fen = function () {
    var s = "", b = this.b; for (var r = 0; r < 8; r++) { var e = 0; for (var f = 0; f < 8; f++) { var p = b[r * 16 + f]; if (!p) e++; else { if (e) s += e; e = 0; s += p; } } if (e) s += e; if (r < 7) s += "/"; }
    var c = (this.cas & 1 ? "K" : "") + (this.cas & 2 ? "Q" : "") + (this.cas & 4 ? "k" : "") + (this.cas & 8 ? "q" : "");
    return s + " " + this.turn + " " + (c || "-") + " " + (this.ep >= 0 ? sqName(this.ep) : "-") + " " + this.half + " " + this.full;
  };
  Chess.prototype.key = function () { return this.fen().split(" ").slice(0, 4).join(" "); };
  Chess.prototype.attacked = function (sq, by) {
    var b = this.b, w = by === "w", i, s, p;
    if (w) { if (!((sq + 15) & 0x88) && b[sq + 15] === "P") return true; if (!((sq + 17) & 0x88) && b[sq + 17] === "P") return true; }
    else { if (!((sq - 15) & 0x88) && b[sq - 15] === "p") return true; if (!((sq - 17) & 0x88) && b[sq - 17] === "p") return true; }
    var N = w ? "N" : "n", K = w ? "K" : "k", B = w ? "B" : "b", R = w ? "R" : "r", Q = w ? "Q" : "q";
    for (i = 0; i < 8; i++) { s = sq + ND[i]; if (!(s & 0x88) && b[s] === N) return true; s = sq + KD[i]; if (!(s & 0x88) && b[s] === K) return true; }
    for (i = 0; i < 4; i++) { s = sq + BD[i]; while (!(s & 0x88)) { p = b[s]; if (p) { if (p === B || p === Q) return true; break; } s += BD[i]; }
      s = sq + RD[i]; while (!(s & 0x88)) { p = b[s]; if (p) { if (p === R || p === Q) return true; break; } s += RD[i]; } }
    return false;
  };
  Chess.prototype.inCheck = function (side) { side = side || this.turn; return this.attacked(side === "w" ? this.kw : this.kb, side === "w" ? "b" : "w"); };
  /* el que acaba de mover dejó su rey en jaque (movimiento ilegal) */
  Chess.prototype.illegal = function () { return this.turn === "b" ? this.attacked(this.kw, "b") : this.attacked(this.kb, "w"); };
  Chess.prototype.gen = function (caps) {
    var out = [], b = this.b, w = this.turn === "w", s, i, c, q, d;
    for (s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; } var p = b[s]; if (!p || white(p) !== w) continue; var t = p.toLowerCase();
      if (t === "p") {
        d = w ? -16 : 16; var s1 = s + d, last = (s1 >> 4) === (w ? 0 : 7);
        if ((!caps || last) && !b[s1]) { if (last) { for (i = 0; i < 4; i++) out.push({ f: s, t: s1, p: p, pr: "qrbn"[i], fl: 0 }); } else { out.push({ f: s, t: s1, p: p, fl: 0 }); if ((s >> 4) === (w ? 6 : 1) && !b[s1 + d]) out.push({ f: s, t: s1 + d, p: p, fl: 4 }); } }
        for (var k = -1; k <= 1; k += 2) { c = s1 + k; if (c & 0x88) continue; q = b[c];
          if (q && white(q) !== w) { if (last) { for (i = 0; i < 4; i++) out.push({ f: s, t: c, p: p, c: q, pr: "qrbn"[i], fl: 0 }); } else out.push({ f: s, t: c, p: p, c: q, fl: 0 }); }
          else if (c === this.ep && !q) out.push({ f: s, t: c, p: p, c: w ? "p" : "P", fl: 1 }); }
      } else if (t === "n" || t === "k") {
        var st = t === "n" ? ND : KD; for (i = 0; i < 8; i++) { c = s + st[i]; if (c & 0x88) continue; q = b[c]; if (!q) { if (!caps) out.push({ f: s, t: c, p: p, fl: 0 }); } else if (white(q) !== w) out.push({ f: s, t: c, p: p, c: q, fl: 0 }); }
        if (t === "k" && !caps) {
          if (w && s === 116) { if (this.cas & 1 && !b[117] && !b[118] && b[119] === "R" && !this.attacked(116, "b") && !this.attacked(117, "b") && !this.attacked(118, "b")) out.push({ f: 116, t: 118, p: p, fl: 2 });
            if (this.cas & 2 && !b[115] && !b[114] && !b[113] && b[112] === "R" && !this.attacked(116, "b") && !this.attacked(115, "b") && !this.attacked(114, "b")) out.push({ f: 116, t: 114, p: p, fl: 2 }); }
          if (!w && s === 4) { if (this.cas & 4 && !b[5] && !b[6] && b[7] === "r" && !this.attacked(4, "w") && !this.attacked(5, "w") && !this.attacked(6, "w")) out.push({ f: 4, t: 6, p: p, fl: 2 });
            if (this.cas & 8 && !b[3] && !b[2] && !b[1] && b[0] === "r" && !this.attacked(4, "w") && !this.attacked(3, "w") && !this.attacked(2, "w")) out.push({ f: 4, t: 2, p: p, fl: 2 }); }
        }
      } else {
        var dirs = t === "b" ? BD : t === "r" ? RD : KD;
        for (i = 0; i < dirs.length; i++) { c = s + dirs[i]; while (!(c & 0x88)) { q = b[c]; if (!q) { if (!caps) out.push({ f: s, t: c, p: p, fl: 0 }); } else { if (white(q) !== w) out.push({ f: s, t: c, p: p, c: q, fl: 0 }); break; } c += dirs[i]; } }
      }
    }
    return out;
  };
  Chess.prototype.make = function (m) {
    var b = this.b, side = this.turn, u = { m: m, cas: this.cas, ep: this.ep, half: this.half, cap: b[m.t] };
    b[m.t] = m.pr ? (side === "w" ? m.pr.toUpperCase() : m.pr) : m.p; b[m.f] = null;
    if (m.fl & 1) { u.cs = m.t + (side === "w" ? 16 : -16); u.cap = b[u.cs]; b[u.cs] = null; }
    if (m.fl & 2) { var r = ROOK[m.t]; b[r[1]] = b[r[0]]; b[r[0]] = null; }
    if (m.p === "K") this.kw = m.t; else if (m.p === "k") this.kb = m.t;
    this.cas &= CASTLE_MASK[m.f] & CASTLE_MASK[m.t];
    this.ep = m.fl & 4 ? (m.f + m.t) >> 1 : -1;
    this.half = m.p === "P" || m.p === "p" || u.cap ? 0 : this.half + 1; if (side === "b") this.full++;
    this.turn = side === "w" ? "b" : "w"; this.hist.push(u);
  };
  Chess.prototype.unmake = function () {
    var u = this.hist.pop(), m = u.m, b = this.b; this.turn = this.turn === "w" ? "b" : "w";
    b[m.f] = m.p; if (m.fl & 1) { b[m.t] = null; b[u.cs] = u.cap; } else b[m.t] = u.cap;
    if (m.fl & 2) { var r = ROOK[m.t]; b[r[0]] = b[r[1]]; b[r[1]] = null; }
    if (m.p === "K") this.kw = m.f; else if (m.p === "k") this.kb = m.f;
    this.cas = u.cas; this.ep = u.ep; this.half = u.half; if (this.turn === "b") this.full--;
  };
  Chess.prototype.legal = function () { var out = [], ms = this.gen(false); for (var i = 0; i < ms.length; i++) { this.make(ms[i]); if (!this.illegal()) out.push(ms[i]); this.unmake(); } return out; };
  Chess.prototype.perft = function (d) { if (!d) return 1; var n = 0, ms = this.gen(false); for (var i = 0; i < ms.length; i++) { this.make(ms[i]); if (!this.illegal()) n += this.perft(d - 1); this.unmake(); } return n; };
  Chess.prototype.uci = function (m) { return sqName(m.f) + sqName(m.t) + (m.pr || ""); };
  Chess.prototype.find = function (uci) { var l = this.legal(); for (var i = 0; i < l.length; i++) if (this.uci(l[i]) === uci) return l[i]; return null; };
  Chess.prototype.san = function (m, lang) {
    var L = lang === "es" ? ES : EN, t = m.p.toLowerCase(), s;
    if (m.fl & 2) s = (m.t & 7) === 6 ? "O-O" : "O-O-O";
    else if (t === "p") s = (m.c ? "abcdefgh"[m.f & 7] + "x" : "") + sqName(m.t) + (m.pr ? "=" + L[m.pr] : "");
    else {
      var amb = this.legal().filter(function (o) { return o.p === m.p && o.t === m.t && o.f !== m.f; }), dis = "";
      if (amb.length) { var sameFile = amb.some(function (o) { return (o.f & 7) === (m.f & 7); }), sameRank = amb.some(function (o) { return (o.f >> 4) === (m.f >> 4); });
        dis = !sameFile ? "abcdefgh"[m.f & 7] : !sameRank ? String(8 - (m.f >> 4)) : sqName(m.f); }
      s = L[t] + dis + (m.c ? "x" : "") + sqName(m.t);
    }
    this.make(m); if (this.inCheck()) s += this.legal().length ? "+" : "#"; this.unmake();
    return s;
  };
  /* mueve y recuerda la posición (para la repetición) */
  Chess.prototype.play = function (m) { this.make(m); this.keys.push(this.key()); };
  Chess.prototype.undo = function () { if (!this.hist.length) return false; this.unmake(); this.keys.pop(); return true; };
  Chess.prototype.status = function () {
    var l = this.legal();
    if (!l.length) return this.inCheck() ? { over: true, result: this.turn === "w" ? "0-1" : "1-0", why: "mate" } : { over: true, result: "1/2-1/2", why: "ahogado" };
    var k = this.keys[this.keys.length - 1], n = 0; for (var i = 0; i < this.keys.length; i++) if (this.keys[i] === k) n++;
    if (n >= 3) return { over: true, result: "1/2-1/2", why: "repeticion" };
    if (this.half >= 100) return { over: true, result: "1/2-1/2", why: "cincuenta" };
    var minors = 0, other = 0, bishops = []; for (var s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } var p = this.b[s]; if (!p) continue; var t = p.toLowerCase(); if (t === "k") continue; if (t === "n" || t === "b") { minors++; if (t === "b") bishops.push(((s >> 4) + (s & 7)) & 1); } else other++; }
    if (!other && (minors <= 1 || (minors === bishops.length && bishops.every(function (c) { return c === bishops[0]; })))) return { over: true, result: "1/2-1/2", why: "material" };
    return { over: false, check: this.inCheck(), moves: l };
  };
  /* evaluación desde el bando que mueve */
  Chess.prototype.evaluate = function () {
    var b = this.b, s = 0, npm = 0, bw = 0, bb = 0, sq, p;
    for (sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } p = b[sq]; if (p && p !== "P" && p !== "p" && p !== "K" && p !== "k") npm += VAL[p.toLowerCase()]; }
    var mg = Math.min(1, npm / 6400), pw = [0, 0, 0, 0, 0, 0, 0, 0], pb = [0, 0, 0, 0, 0, 0, 0, 0];
    for (sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; } p = b[sq]; if (!p) continue;
      var w = white(p), t = p.toLowerCase(), r = sq >> 4, f = sq & 7, idx = (w ? r : 7 - r) * 8 + f, v;
      if (t === "k") v = Math.round(PST.k[idx] * mg + PST.K[idx] * (1 - mg)); else v = VAL[t] + PST[t][idx];
      if (t === "b") { if (w) bw++; else bb++; } if (t === "p") { if (w) pw[f]++; else pb[f]++; }
      s += w ? v : -v;
    }
    if (bw >= 2) s += 30; if (bb >= 2) s -= 30;
    for (var f2 = 0; f2 < 8; f2++) { // peones doblados y aislados
      if (pw[f2] > 1) s -= 12 * (pw[f2] - 1); if (pb[f2] > 1) s += 12 * (pb[f2] - 1);
      if (pw[f2] && !(pw[f2 - 1] || pw[f2 + 1])) s -= 10; if (pb[f2] && !(pb[f2 - 1] || pb[f2 + 1])) s += 10; }
    return this.turn === "w" ? s : -s;
  };

  /* ---------------- búsqueda ---------------- */
  var MATE = 100000, INF = 1e9;
  function search(ch, o) {
    o = o || {}; var maxDepth = o.depth || 64, nodes = 0, stop = false, budget = o.time || 1000;
    var killers = [], hist = {}, rootMoves = ch.legal(); if (!rootMoves.length) return null;
    var now = typeof performance !== "undefined" ? function () { return performance.now(); } : Date.now;
    var t0 = now(), deadline = t0 + budget;
    var score = function (m, ply, pv) { if (pv && m.f === pv.f && m.t === pv.t && m.pr === pv.pr) return 1e7; if (m.c) return 1e6 + 10 * VAL[m.c.toLowerCase()] - VAL[m.p.toLowerCase()]; if (m.pr) return 9e5;
      var k = killers[ply]; if (k && ((k[0] && k[0].f === m.f && k[0].t === m.t) || (k[1] && k[1].f === m.f && k[1].t === m.t))) return 8e5; return hist[m.f * 128 + m.t] || 0; };
    var order = function (ms, ply, pv) { ms.forEach(function (m) { m.s = score(m, ply, pv); }); return ms.sort(function (a, b) { return b.s - a.s; }); };
    function quies(alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && now() > deadline) stop = true; if (stop) return 0;
      var stand = ch.evaluate(); if (stand >= beta) return stand; if (stand > alpha) alpha = stand; if (ply > 40) return stand;
      var ms = order(ch.gen(true), ply);
      for (var i = 0; i < ms.length; i++) { ch.make(ms[i]); if (ch.illegal()) { ch.unmake(); continue; } var sc = -quies(-beta, -alpha, ply + 1); ch.unmake(); if (stop) return 0; if (sc >= beta) return sc; if (sc > alpha) alpha = sc; }
      return alpha;
    }
    function neg(depth, alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && now() > deadline) stop = true; if (stop) return 0;
      if (ch.half >= 100) return 0;
      var chk = ch.inCheck(); if (chk && ply < 24) depth++;
      if (depth <= 0) return quies(alpha, beta, ply);
      var ms = order(ch.gen(false), ply), legal = 0, best = -INF;
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i]; ch.make(m); if (ch.illegal()) { ch.unmake(); continue; } legal++;
        var sc = -neg(depth - 1, -beta, -alpha, ply + 1); ch.unmake(); if (stop) return 0;
        if (sc > best) best = sc; if (sc > alpha) alpha = sc;
        if (alpha >= beta) { if (!m.c) { var k = killers[ply] || (killers[ply] = []); if (!k[0] || k[0].f !== m.f || k[0].t !== m.t) { k[1] = k[0]; k[0] = m; } hist[m.f * 128 + m.t] = (hist[m.f * 128 + m.t] || 0) + depth * depth; } break; }
      }
      if (!legal) return chk ? -MATE + ply : 0;
      return best;
    }
    /* cada jugada de la raíz con ventana completa (para los niveles que eligen entre varias buenas) */
    if (o.spread) {
      deadline = Infinity; var scored = rootMoves.map(function (m) { ch.make(m); var sc = -neg(o.depth - 1, -INF, INF, 1); ch.unmake(); return { m: m, sc: sc + (Math.random() - 0.5) * (o.noise || 0) }; });
      scored.sort(function (a, b) { return b.sc - a.sc; }); var top = scored.filter(function (x) { return x.sc >= scored[0].sc - o.spread; });
      var pick = top[Math.floor(Math.random() * top.length)]; return { move: pick.m, score: pick.sc, depth: o.depth, nodes: nodes };
    }
    var bestMove = rootMoves[0], bestScore = 0, done = 0;
    for (var d = 1; d <= maxDepth; d++) {
      var alpha = -INF, beta = INF, curBest = null, curScore = -INF; order(rootMoves, 0, bestMove);
      for (var i = 0; i < rootMoves.length; i++) {
        var m = rootMoves[i]; ch.make(m); var sc = -neg(d - 1, -beta, -alpha, 1) + (o.noise ? (Math.random() - 0.5) * o.noise : 0); ch.unmake();
        if (stop) break; if (sc > curScore) { curScore = sc; curBest = m; } if (sc > alpha) alpha = sc;
      }
      if (stop) { if (curBest && curBest !== bestMove && curScore > bestScore) { /* la iteración a medias (que empezó por la mejor anterior) ya encontró algo mejor */ bestMove = curBest; bestScore = curScore; } break; }
      bestMove = curBest; bestScore = curScore; done = d;
      if (Math.abs(bestScore) > MATE - 100 || now() - t0 > budget * 0.5) break; // la siguiente vuelta no alcanzaría
    }
    return { move: bestMove, score: bestScore, depth: done, nodes: nodes, mate: Math.abs(bestScore) > MATE - 100 ? Math.ceil((MATE - Math.abs(bestScore)) / 2) * Math.sign(bestScore) : 0 };
  }
  Chess.search = search; Chess.sqName = sqName; Chess.sqOf = sqOf; Chess.MATE = MATE;
  if (typeof module !== "undefined" && module.exports) module.exports = Chess; else root.Chess = Chess;
})(this);
