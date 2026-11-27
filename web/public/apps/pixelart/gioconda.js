/* Sotos — Pixel art: ejemplo «La Gioconda» (Leonardo da Vinci, 1503–1519, dominio público),
   reinterpretada en 48 × 64 píxeles. Se pinta a 4× con degradados y se reduce a una paleta
   renacentista de 24 colores, píxel a píxel. © 2026 Sebastian Sotomontes */
window.gioconda = function () {
  const W = 48, H = 64, S = 4, c = document.createElement("canvas"); c.width = W * S; c.height = H * S;
  const g = c.getContext("2d"); g.scale(S, S);
  const lin = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };
  const rad = (x, y, r0, r1, stops) => { const gr = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };
  const ell = (x, y, rx, ry, fill, rot = 0) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); };
  const poly = (pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
  // cielo brumoso y paisaje lejano (verde azulado, como el sfumato del original)
  g.fillStyle = lin(0, 0, 0, 40, [[0, "#8e9c7e"], [.45, "#7b927d"], [1, "#56705f"]]); g.fillRect(0, 0, W, H);
  poly([[0, 22], [6, 14], [12, 17], [16, 12], [19, 16], [19, 40], [0, 40]], "#5f7d74");
  poly([[29, 40], [29, 15], [33, 11], [38, 15], [43, 10], [48, 14], [48, 40]], "#5b796f");
  poly([[0, 30], [8, 24], [15, 27], [19, 25], [19, 42], [0, 42]], "#4d665b");
  poly([[29, 42], [29, 26], [36, 22], [42, 26], [48, 23], [48, 42]], "#4a6459");
  g.strokeStyle = "#c2a56d"; g.lineWidth = 1.1; g.beginPath(); g.moveTo(2, 40); g.bezierCurveTo(8, 36, 4, 33, 12, 31); g.bezierCurveTo(15, 30, 13, 28, 17, 27); g.stroke(); // camino serpenteante
  g.strokeStyle = "#9db1a8"; g.lineWidth = .8; g.beginPath(); g.moveTo(31, 34); g.bezierCurveTo(36, 32, 40, 35, 46, 32); g.stroke(); // río a la derecha
  g.fillStyle = "#8a6f44"; g.fillRect(40, 33, 5, 1.2); g.fillRect(41, 34.2, 1, 2); g.fillRect(43.5, 34.2, 1, 2); // puente
  // baranda de la logia
  g.fillStyle = lin(0, 42, 0, 47, [[0, "#6b5a3a"], [1, "#3f3322"]]); g.fillRect(0, 42, W, 5);
  // cuerpo: vestido oscuro, de tres cuartos
  poly([[9, 64], [10, 44], [13, 33], [18, 28.5], [30, 28.5], [35, 33], [38, 44], [40, 64]], lin(0, 30, 0, 64, [[0, "#2e2a1d"], [1, "#1a1812"]]));
  // mangas doradas
  poly([[9, 64], [10, 48], [13, 40], [17, 44], [17, 56], [22, 58], [22, 64]], lin(8, 40, 22, 64, [[0, "#8a6a2e"], [1, "#5e4620"]]));
  poly([[40, 64], [38, 48], [35, 40], [31, 45], [31, 55], [27, 58], [27, 64]], lin(40, 40, 26, 64, [[0, "#7a5c28"], [1, "#4e3a1a"]]));
  g.strokeStyle = "rgba(40,30,15,.6)"; g.lineWidth = .5; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(12 + i * 1.2, 46 + i * 2); g.lineTo(16 + i * .8, 50 + i * 2); g.stroke(); } // pliegues
  // pecho y escote
  poly([[16.5, 28.5], [31.5, 28.5], [30, 32.5], [24, 34.5], [18, 32.5]], lin(0, 28, 0, 35, [[0, "#d7a873"], [1, "#b98a58"]]));
  g.strokeStyle = "#8a6a3a"; g.lineWidth = .5; g.beginPath(); g.moveTo(17, 30.8); g.quadraticCurveTo(24, 35.5, 31, 30.8); g.stroke(); // bordado del escote
  // cuello
  poly([[21.2, 22], [26.8, 22], [27.6, 28.5], [20.4, 28.5]], lin(20, 0, 28, 0, [[0, "#c79a65"], [.6, "#d7aa74"], [1, "#a47a4a"]]));
  // cabello y velo (oscuros, cayendo a los lados)
  poly([[15.5, 29], [16, 14], [18.5, 7.5], [24, 5.5], [29.5, 7.5], [32, 14], [32.5, 29], [29, 29], [28.8, 18], [24, 12.5], [19.2, 18], [19, 29]], lin(0, 6, 0, 31, [[0, "#3a2b1a"], [1, "#22180f"]]));
  g.strokeStyle = "rgba(120,95,60,.55)"; g.lineWidth = .45; [[17, 12, 16.5, 28], [31, 12, 31.5, 28], [18.5, 10, 18, 26]].forEach(([a, b, c2, d]) => { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(a - .8, (b + d) / 2, c2, d); g.stroke(); }); // mechones
  // rostro: luz desde la izquierda (del espectador)
  ell(24, 16, 5.8, 7.6, rad(22, 14.5, 1, 8.5, [[0, "#ebc08c"], [.6, "#d6a46d"], [1, "#a8784a"]]));
  ell(28.2, 17.5, 1.6, 5, "rgba(120,80,45,.35)"); // sombra de la mejilla derecha
  g.fillStyle = "rgba(35,22,12,.95)"; g.fillRect(20.6, 14.5, 2, 1.2); g.fillRect(25.4, 14.5, 2, 1.2); // ojos
  g.fillStyle = "rgba(90,60,35,.5)"; g.fillRect(20.6, 14, 2.2, .5); g.fillRect(25.2, 14, 2.2, .5); // párpados
  g.fillStyle = "rgba(140,95,55,.35)"; g.fillRect(24.5, 16.5, .5, 2); g.fillStyle = "rgba(120,75,45,.6)"; g.fillRect(23.5, 18.6, 1.8, .5); // nariz
  g.strokeStyle = "rgba(110,60,40,.85)"; g.lineWidth = .55; g.beginPath(); g.moveTo(21.8, 20.6); g.quadraticCurveTo(24, 21.7, 26.4, 20.3); g.stroke(); // la sonrisa
  g.fillStyle = "rgba(255,235,205,.35)"; g.fillRect(21.5, 11, 3, 1.2); // luz en la frente
  // manos cruzadas: la derecha sobre la izquierda
  ell(21, 53.5, 5.2, 2.6, lin(16, 51, 26, 56, [[0, "#d9ab74"], [1, "#b88855"]]), -.12);
  ell(27, 55.5, 5.6, 2.7, lin(22, 53, 33, 58, [[0, "#e2b67e"], [1, "#bd8c58"]]), .1);
  g.strokeStyle = "rgba(120,80,45,.6)"; g.lineWidth = .4; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(26 + i * 1.3, 54.2); g.lineTo(27 + i * 1.3, 57.3); g.stroke(); } // dedos
  // marco oscuro alrededor, como el barniz envejecido
  g.fillStyle = rad(W / 2, H / 2, 18, 44, [[0, "rgba(0,0,0,0)"], [1, "rgba(30,24,12,.55)"]]); g.fillRect(0, 0, W, H);
  // reducir a píxeles: promedio de cada bloque 4×4 y el color más cercano de la paleta
  const PAL = ["#1a1812", "#22180f", "#2e2a1d", "#3a2b1a", "#3f3322", "#4e3a1a", "#5e4620", "#6b5a3a", "#8a6a2e", "#a47a4a", "#b98a58", "#d29e66",
    "#e2b67e", "#ebc590", "#8a6f44", "#c2a56d", "#4d665b", "#5b796f", "#5f7d74", "#7b927d", "#8e9c7e", "#9db1a8", "#4a6459", "#6e4a32"];
  const rgb = PAL.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
  const d = g.getImageData(0, 0, W * S, H * S).data, out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, gg = 0, b = 0; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const k = ((y * S + j) * W * S + x * S + i) * 4; r += d[k]; gg += d[k + 1]; b += d[k + 2]; }
    r /= S * S; gg /= S * S; b /= S * S; let best = 0, bd = Infinity;
    rgb.forEach(([pr, pg, pb], k) => { const dd = (pr - r) ** 2 * .3 + (pg - gg) ** 2 * .59 + (pb - b) ** 2 * .11; if (dd < bd) { bd = dd; best = k; } });
    out[y * W + x] = best + 1;
  }
  return { w: W, h: H, pal: [null, ...PAL], frames: [out], fps: 8 };
};
