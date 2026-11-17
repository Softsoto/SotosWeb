/* ============================================================
   Sotos — portadas de álbum dibujadas (cuando la canción no trae)
   Afiche plano generado a partir del nombre del álbum: siempre la
   misma portada para el mismo álbum. Cuatro composiciones.
   © 2026 Sebastian Sotomontes
   ============================================================ */
const PALETTES = [
  ["#1f2a44", "#e8a54b", "#f3ede2", "#c4532f"], ["#2b1d3a", "#f06b5b", "#ffd6a5", "#6c4fa3"], ["#123b36", "#6fcf97", "#f2f2e9", "#1f7a78"],
  ["#3a1c1c", "#f2c94c", "#f8efe0", "#b8402f"], ["#16202a", "#56ccf2", "#e9f1f7", "#2f5d8a"], ["#2a2622", "#d9a066", "#f5ead8", "#8a5a3b"],
  ["#0f1b2d", "#ff8a5c", "#ffe8d6", "#5a5689"], ["#24321d", "#c9df8a", "#f4f1de", "#4f7a3a"],
];
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function paint(g, S, seed, label) {
  const r = rng(seed), [bg, a, b, c] = PALETTES[seed % PALETTES.length], kind = (seed >>> 8) % 4;
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  if (kind === 0) { // sol y franjas
    g.fillStyle = a; g.beginPath(); g.arc(S * (.3 + r() * .4), S * .42, S * .24, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? bg : c; g.fillRect(0, S * (.58 + i * .07), S, S * .035); }
  } else if (kind === 1) { // círculos concéntricos
    const cx = S * (.35 + r() * .3), cy = S * (.35 + r() * .3);
    [a, b, c, bg, a].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, S * (.62 - i * .12), 0, Math.PI * 2); g.fill(); });
  } else if (kind === 2) { // bandas diagonales
    g.save(); g.translate(S / 2, S / 2); g.rotate(-Math.PI / 4 + (r() - .5) * .6);
    [a, c, b, a].forEach((col, i) => { g.fillStyle = col; g.fillRect(-S, -S * .5 + i * S * .26, S * 2, S * .13); }); g.restore();
  } else { // montañas bajo la luna
    g.fillStyle = b; g.beginPath(); g.arc(S * .72, S * .28, S * .1, 0, Math.PI * 2); g.fill();
    [[c, .55], [a, .7]].forEach(([col, base]) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, S); let x = 0; g.lineTo(0, S * base);
      while (x < S) { x += S * (.12 + r() * .18); g.lineTo(x, S * (base - .1 - r() * .2)); x += S * (.08 + r() * .1); g.lineTo(x, S * base); } g.lineTo(S, S); g.fill(); });
  }
  // grano de impresión
  for (let i = 0; i < S * 6; i++) { g.fillStyle = r() > .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.06)"; g.fillRect(r() * S, r() * S, 2, 2); }
  // título del álbum, pequeño, abajo a la izquierda
  if (label) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, S * .82, S, S * .18); g.fillStyle = b; g.font = `700 ${Math.round(S * .075)}px sans-serif`; g.textBaseline = "middle";
    g.fillText(String(label).toUpperCase().slice(0, 18), S * .07, S * .91); }
}

const cache = new Map();
/** data URL de la portada dibujada para un álbum/título */
export function artCover(key, label = key, S = 300) {
  const k = key + "|" + label + "|" + S;
  if (!cache.has(k)) { const c = document.createElement("canvas"); c.width = c.height = S; paint(c.getContext("2d"), S, hash(key), label); cache.set(k, c.toDataURL("image/jpeg", .86)); }
  return cache.get(k);
}

/** portada de una canción: la de su etiqueta o una dibujada para su álbum */
export const coverOf = (info) => info?.cover || (info && (info.album || info.title) ? artCover(info.album || info.title, info.album || info.artist || "") : null);