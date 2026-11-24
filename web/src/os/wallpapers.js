/* ============================================================
   Sotos OS — fondos ilustrados (serigrafía de paisajes colombianos)
   © 2026 Sebastian Sotomontes

   Cada fondo se dibuja por código en un <canvas>, a la resolución de
   la pantalla: capas planas de tinta con un leve desfase de registro,
   tramado de puntos en el cielo y grano de papel. Sin imágenes externas.
   ============================================================ */

export const WALLS = [
  { id: "paramo",  name: "Páramo",    hint: "Amanecer entre frailejones" },
  { id: "cerros",  name: "Cerros",    hint: "La ciudad al pie de la montaña" },
  { id: "cafetal", name: "Cafetal",   hint: "Lomas verdes y palmas de cera" },
  { id: "cano",    name: "Caño",      hint: "El río de los cinco colores" },
  { id: "tatacoa", name: "Tatacoa",   hint: "Noche despejada en el desierto" },
  { id: "caribe",  name: "Caribe",    hint: "Mediodía frente al mar" },
  { id: "papel",   name: "Papel",     hint: "Liso, con la marca de Sotos" },
  { id: "tinta",   name: "Tinta",     hint: "Oscuro, para el tema nocturno" },
];
/* fondos de los temas de época (arte propio, dibujado por código) */
export const ERA_WALLS = [
  { id: "era-prado",    name: "Prado",    hint: "Colina verde y cielo de verano" },
  { id: "era-cristal",  name: "Cristal",  hint: "Cintas de luz sobre la noche" },
  { id: "era-vidrio",   name: "Vidrio",   hint: "Haces de luz turquesa" },
  { id: "era-mosaico",  name: "Mosaico",  hint: "Facetas de color" },
  { id: "era-aluminio", name: "Aluminio", hint: "Montañas al atardecer" },
  { id: "era-nucleo",   name: "Núcleo",   hint: "Núcleo verde sobre una rejilla" },
  { id: "era-circuito", name: "Circuito", hint: "Rejilla de luz y estelas" },
];

/* Fotos (licencia CC0, Wikimedia Commons), en web/public/fondos. Combinan con el tema Grafito,
   que las pasa a blanco y negro. Autor y enlace se muestran en Ajustes como crédito. */
const C = "https://commons.wikimedia.org/wiki/File:";
export const PHOTO_WALLS = [
  { id: "foto-usaquen", file: "usaquen",       name: "Bogotá",         hint: "La ciudad desde Usaquén",            author: "Alejandro Turola", link: C + "Panor%C3%A1mica_de_Usaquen,_Bogot%C3%A1_D.C.jpg" },
  { id: "foto-centro",  file: "centro-bogota", name: "Centro",         hint: "Bogotá desde el Ricaurte",           author: "Apphiron",         link: C + "Centro_de_Bogota_desde_el_Ricaurte.jpg" },
  { id: "foto-cable",   file: "cable-bogota",  name: "TransMiCable",   hint: "Ciudad Bolívar desde el cable",      author: "Mussi Katz",       link: C + "Cablecar_in_Bogot%C3%A1_(52421535060).jpg" },
  { id: "foto-cielo",   file: "cielo-bogota",  name: "Atardecer",      hint: "El cielo sobre Bogotá",              author: "Cristian Baron",   link: C + "El_cielo_del_atardecer_sobre_Bogot%C3%A1,_Colombia,_2015,_por_Cristian_Baron_(Unsplash).jpg" },
  { id: "foto-cocora",  file: "cocora",        name: "Cocora",         hint: "Palmas de cera al anochecer",        author: "Deivid Sáenz",     link: C + "Valle_Del_Cocora_silhouette_(Unsplash).jpg" },
  { id: "foto-salento", file: "salento",       name: "Salento",        hint: "Camino entre montañas del Quindío",  author: "Maifiredragon",    link: C + "Salento_tierra_quindiense.jpg" },
];
const photoOf = (id) => PHOTO_WALLS.find(p => p.id === id);
const photoSrc = (p, small) => `${import.meta.env.BASE_URL}fondos/${p.file}${small ? "-mini" : ""}.jpg`;

/* ---------------- utilidades de dibujo ---------------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)))); return "#" + c.map(v => v.toString(16).padStart(2, "0")).join(""); };

function makeKit(g, W, H, rand) {
  const u = Math.min(W, H) / 1000; // unidad relativa
  const kit = {
    u, W, H, rand,
    // capa con desfase de registro: primero una copia más oscura corrida, luego el color
    print(pathFn, color, off = 1) {
      g.save(); g.translate(3 * u * off, 2 * u * off); g.fillStyle = shade(color, -0.28); g.globalAlpha = 0.55; pathFn(); g.fill(); g.restore();
      g.fillStyle = color; pathFn(); g.fill();
    },
    ridge(baseY, amp, waves, rough, color, off) {
      const pts = []; const ph = rand() * 10, ph2 = rand() * 10;
      for (let x = -20; x <= W + 20; x += Math.max(6, 10 * u)) {
        const t = x / W;
        const y = baseY - amp * (0.55 * Math.sin(t * waves * Math.PI + ph) + 0.3 * Math.sin(t * waves * 2.3 * Math.PI + ph2) + 0.15 * Math.sin(t * waves * 5.1 * Math.PI)) - (rand() - 0.5) * rough;
        pts.push([x, y]);
      }
      kit.print(() => { g.beginPath(); g.moveTo(-20, H + 20); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(W + 20, H + 20); g.closePath(); }, color, off);
      return (x) => { const i = Math.max(0, Math.min(pts.length - 1, Math.round((x + 20) / Math.max(6, 10 * u)))); return pts[i][1]; };
    },
    // cielo plano + tramado de puntos que crece hacia el horizonte
    halftone(top, bottom, dot, from = 0, to = 0.7) {
      g.fillStyle = top; g.fillRect(0, 0, W, H);
      const lg = g.createLinearGradient(0, H * from, 0, H * to); lg.addColorStop(0, top); lg.addColorStop(1, bottom);
      g.fillStyle = lg; g.fillRect(0, H * from, W, H);
      const s = 14 * u; g.fillStyle = dot;
      g.save(); g.translate(W / 2, H / 2); g.rotate(0.26); g.translate(-W, -H);
      for (let y = 0; y < H * 2; y += s) for (let x = 0; x < W * 2; x += s) {
        // posición real en pantalla para graduar el tamaño
        const sy = (y - H) * Math.cos(0.26) + (x - W) * Math.sin(0.26) + H / 2;
        const k = Math.max(0, Math.min(1, (sy / H - from) / (to - from)));
        const r = s * 0.42 * k * k; if (r < 0.4) continue;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    },
    sun(x, y, r, color, rings) {
      kit.print(() => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }, color);
      if (rings) { g.strokeStyle = shade(color, -0.12); g.lineWidth = 3 * u; for (let k = 1; k <= rings; k++) { g.beginPath(); g.arc(x, y, r * (1 - k * 0.18), 0, Math.PI * 2); g.stroke(); } }
    },
    stars(n, color, maxY) { g.fillStyle = color; for (let i = 0; i < n; i++) { const r = rand() < 0.08 ? 2.4 * u : 1.2 * u; g.globalAlpha = 0.4 + rand() * 0.6; g.beginPath(); g.arc(rand() * W, rand() * H * maxY, r, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; },
    // frailejón: tallo grueso y roseta de hojas
    // frailejón: tronco grueso y lanudo (hojas secas pegadas) + roseta de hojas en punta hacia arriba
    frailejon(x, groundY, h, stem, leaf) {
      const w = h * 0.2, top = groundY - h * 0.78;
      kit.print(() => {
        g.beginPath(); g.moveTo(x - w * 0.55, groundY);
        for (let y = groundY; y > top; y -= h * 0.05) g.lineTo(x - w * (0.5 + 0.12 * Math.sin(y * 0.9)) - (rand() * w * 0.12), y);
        g.lineTo(x - w * 0.62, top); g.lineTo(x + w * 0.62, top);
        for (let y = top; y < groundY; y += h * 0.05) g.lineTo(x + w * (0.5 + 0.12 * Math.cos(y * 0.8)) + (rand() * w * 0.12), y);
        g.lineTo(x + w * 0.55, groundY); g.closePath();
      }, stem);
      // vetas del tronco
      g.strokeStyle = shade(stem, -0.35); g.lineWidth = Math.max(1, h * 0.008);
      for (let y = groundY - h * 0.06; y > top + h * 0.04; y -= h * 0.06) { g.beginPath(); g.moveTo(x - w * 0.4, y); g.quadraticCurveTo(x, y + h * 0.03, x + w * 0.4, y); g.stroke(); }
      const cx = x, cy = top + h * 0.02, R = h * 0.3;
      const rosette = () => {
        g.beginPath();
        for (let i = 0; i < 26; i++) {
          const a = Math.PI * (1.05 + (i / 25) * 0.9) + (rand() - 0.5) * 0.12; // abanico hacia arriba
          const L = R * (0.7 + rand() * 0.45), wd = R * 0.09;
          const tx = cx + Math.cos(a) * L, ty = cy + Math.sin(a) * L * 0.95;
          const nx = -Math.sin(a) * wd, ny = Math.cos(a) * wd;
          g.moveTo(cx + nx, cy + ny); g.quadraticCurveTo((cx + tx) / 2 + nx * 1.6, (cy + ty) / 2 + ny * 1.6, tx, ty);
          g.quadraticCurveTo((cx + tx) / 2 - nx * 1.6, (cy + ty) / 2 - ny * 1.6, cx - nx, cy - ny); g.closePath();
        }
        g.ellipse(cx, cy, R * 0.32, R * 0.16, 0, 0, Math.PI * 2);
      };
      kit.print(rosette, leaf);
      // flores amarillas en algunos
      if (rand() < 0.45) { g.strokeStyle = shade(leaf, -0.3); g.lineWidth = Math.max(1, h * 0.01); for (let i = 0; i < 3; i++) { const fx = cx + (i - 1) * R * 0.35, fy = cy - R * (1.05 + rand() * 0.25); g.beginPath(); g.moveTo(cx + (i - 1) * R * 0.1, cy - R * 0.2); g.lineTo(fx, fy); g.stroke(); g.fillStyle = "#e9b93a"; g.beginPath(); g.arc(fx, fy, R * 0.07, 0, Math.PI * 2); g.fill(); } }
    },
    // palma de cera: tronco muy alto y corona
    palm(x, groundY, h, trunk, fronds) {
      const w = h * 0.018;
      kit.print(() => { g.beginPath(); g.moveTo(x - w, groundY); g.lineTo(x - w * 0.7, groundY - h); g.lineTo(x + w * 0.7, groundY - h); g.lineTo(x + w, groundY); g.closePath(); }, trunk);
      const cy = groundY - h;
      g.strokeStyle = fronds; g.lineCap = "round"; g.lineWidth = Math.max(2, h * 0.012);
      for (let i = 0; i < 11; i++) { const a = -Math.PI + (i / 10) * Math.PI; const L = h * (0.16 + 0.06 * Math.sin(i * 1.7)); g.beginPath(); g.moveTo(x, cy); g.quadraticCurveTo(x + Math.cos(a) * L * 0.7, cy + Math.sin(a) * L * 0.7 - L * 0.1, x + Math.cos(a) * L, cy + Math.sin(a) * L * 0.4 + L * 0.35); g.stroke(); }
    },
    cactus(x, groundY, h, color) {
      const w = h * 0.16;
      kit.print(() => {
        g.beginPath(); g.roundRect(x - w / 2, groundY - h, w, h, w / 2);
        g.roundRect(x - w * 1.7, groundY - h * 0.62, w * 0.75, h * 0.32, w * 0.37); g.rect(x - w * 1.7, groundY - h * 0.42, w * 1.3, w * 0.6);
        g.roundRect(x + w * 0.95, groundY - h * 0.78, w * 0.75, h * 0.36, w * 0.37); g.rect(x + w * 0.3, groundY - h * 0.5, w * 1.3, w * 0.6);
      }, color);
    },
    // grano de papel encima de todo
    grain(alpha = 0.09) {
      const t = document.createElement("canvas"); t.width = t.height = 220; const tg = t.getContext("2d"); const id = tg.createImageData(220, 220);
      for (let i = 0; i < id.data.length; i += 4) { const v = rand() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      tg.putImageData(id, 0, 0);
      g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = "overlay"; g.fillStyle = g.createPattern(t, "repeat"); g.fillRect(0, 0, W, H); g.restore();
      // fibras sueltas
      g.save(); g.globalAlpha = alpha * 0.6; g.strokeStyle = "#ffffff"; g.lineWidth = 0.6 * u;
      for (let i = 0; i < 120; i++) { const x = rand() * W, y = rand() * H, l = (6 + rand() * 18) * u, a = rand() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      g.restore();
    },
  };
  return kit;
}

/* ---------------- escenas ---------------- */
const SCENES = {
  paramo(g, k) {
    const { W, H, u, rand } = k;
    k.halftone("#f2c27b", "#e88f62", "#f7d9a4", 0.05, 0.62);
    k.sun(W * 0.72, H * 0.36, 90 * u, "#fbe6b3", 2);
    k.ridge(H * 0.5, 70 * u, 3, 10 * u, "#7d6fa3", 0.6);
    k.ridge(H * 0.58, 60 * u, 4, 12 * u, "#5a5689", 0.8);
    // banda de niebla
    // niebla ondulada en dos pasadas
    [[0.6, 0.45, 26], [0.635, 0.3, 18]].forEach(([y0, a, th]) => { g.fillStyle = `rgba(251,236,214,${a})`; g.beginPath(); g.moveTo(-20, H * y0); for (let x = -20; x <= W + 20; x += 30 * u) g.lineTo(x, H * y0 + Math.sin(x / (120 * u)) * 6 * u); for (let x = W + 20; x >= -20; x -= 30 * u) g.lineTo(x, H * y0 + th * u + Math.sin(x / (90 * u) + 1) * 7 * u); g.closePath(); g.fill(); });
    const near = k.ridge(H * 0.72, 40 * u, 2.5, 8 * u, "#6f7b46");
    k.ridge(H * 0.86, 25 * u, 3, 6 * u, "#4f5a31");
    // fila lejana sobre la loma y fila cercana, más grande, abajo
    for (let i = 0; i < 12; i++) { const x = W * (0.03 + i * 0.085 + (rand() - 0.5) * 0.03); k.frailejon(x, near(x) + 10 * u, 95 * u * (0.75 + rand() * 0.5), "#6a5642", "#a3ad78"); }
    for (let i = 0; i < 6; i++) { const x = W * (0.06 + i * 0.18 + (rand() - 0.5) * 0.05); k.frailejon(x, H * 0.99, 260 * u * (0.8 + rand() * 0.35), "#4a3a2b", "#bcc596"); }
  },
  cerros(g, k) {
    const { W, H, u, rand } = k;
    k.halftone("#2f4f7a", "#d9714a", "#e79a6c", 0.0, 0.7);
    k.sun(W * 0.24, H * 0.5, 70 * u, "#f5c26b", 0);
    const top = k.ridge(H * 0.48, 110 * u, 1.6, 6 * u, "#3a3756", 0.8);
    // capilla en la cima
    const cx = W * 0.58, cy = top(cx);
    k.print(() => { g.beginPath(); g.rect(cx - 22 * u, cy - 34 * u, 44 * u, 36 * u); g.moveTo(cx - 26 * u, cy - 34 * u); g.lineTo(cx, cy - 58 * u); g.lineTo(cx + 26 * u, cy - 34 * u); g.rect(cx - 5 * u, cy - 76 * u, 10 * u, 20 * u); }, "#2a2840");
    k.ridge(H * 0.64, 40 * u, 3, 8 * u, "#2c2a44");
    // ciudad
    const base = H * 0.78;
    for (let x = 0; x < W; x += (28 + rand() * 40) * u) {
      const w = (24 + rand() * 36) * u, h = (40 + rand() * 170) * u;
      k.print(() => { g.beginPath(); g.rect(x, base - h, w, h + H); }, rand() < 0.5 ? "#1f1d33" : "#26243c", 0.4);
      g.fillStyle = "#f2c477"; for (let wy = base - h + 10 * u; wy < base - 6 * u; wy += 14 * u) for (let wx = x + 5 * u; wx < x + w - 6 * u; wx += 10 * u) if (rand() < 0.32) g.fillRect(wx, wy, 4 * u, 6 * u);
    }
    k.print(() => { g.beginPath(); g.rect(0, base, W, H); }, "#1a1829");
  },
  cafetal(g, k) {
    const { W, H, u, rand } = k;
    k.halftone("#cfe3e0", "#f3e3b8", "#ffffff", 0.0, 0.5);
    k.ridge(H * 0.42, 50 * u, 2.2, 6 * u, "#9fb9a8", 0.5);
    const mid = k.ridge(H * 0.55, 60 * u, 2.8, 8 * u, "#6d9a5a", 0.7);
    const front = k.ridge(H * 0.72, 55 * u, 2, 8 * u, "#4f7a3a");
    // surcos de café
    g.strokeStyle = "#3d6430"; g.lineWidth = 5 * u; g.setLineDash([9 * u, 7 * u]);
    for (let r = 0; r < 9; r++) { g.beginPath(); for (let x = 0; x <= W; x += 20 * u) { const y = front(x) + 30 * u + r * 34 * u + Math.sin(x / W * 6 + r) * 8 * u; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.setLineDash([]);
    k.palm(W * 0.18, mid(W * 0.18) + 30 * u, 380 * u, "#7a6a55", "#46703a");
    k.palm(W * 0.26, mid(W * 0.26) + 40 * u, 300 * u, "#7a6a55", "#46703a");
    k.palm(W * 0.83, front(W * 0.83) + 20 * u, 470 * u, "#5f5240", "#2f5a2c");
    // casa campesina
    const hx = W * 0.6, hy = mid(W * 0.6) + 8 * u;
    k.print(() => { g.beginPath(); g.rect(hx, hy - 38 * u, 70 * u, 40 * u); }, "#f4efe4", 0.5);
    k.print(() => { g.beginPath(); g.moveTo(hx - 8 * u, hy - 36 * u); g.lineTo(hx + 35 * u, hy - 62 * u); g.lineTo(hx + 78 * u, hy - 36 * u); g.closePath(); }, "#c4532f", 0.5);
  },
  cano(g, k) {
    const { W, H, u, rand } = k;
    k.halftone("#bfe1e6", "#e9f1d6", "#ffffff", 0, 0.4);
    k.ridge(H * 0.3, 40 * u, 3, 8 * u, "#2f6b4a", 0.6);
    k.ridge(H * 0.36, 30 * u, 5, 10 * u, "#24563b", 0.6);
    // río serpenteante en bandas
    const bands = ["#d8362f", "#f07a3a", "#f2c443", "#2e7d6b", "#1f3f6e", "#c22a5a"];
    for (let i = 0; i < 26; i++) {
      const y = H * 0.38 + i * (H * 0.64 / 26);
      const col = bands[(i + (rand() < 0.3 ? 1 : 0)) % bands.length];
      k.print(() => { g.beginPath(); g.moveTo(-20, y); for (let x = -20; x <= W + 20; x += 24 * u) g.lineTo(x, y + Math.sin(x / W * 7 + i * 0.6) * 14 * u + (rand() - 0.5) * 6 * u); g.lineTo(W + 20, y + 40 * u); g.lineTo(-20, y + 40 * u); g.closePath(); }, col, 0.4);
    }
    // piedras
    for (let i = 0; i < 14; i++) { const x = rand() * W, y = H * (0.45 + rand() * 0.5), r = (18 + rand() * 40) * u; k.print(() => { g.beginPath(); g.ellipse(x, y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2); }, rand() < 0.5 ? "#c9b48a" : "#a8936a"); }
  },
  tatacoa(g, k) {
    const { W, H, u, rand } = k;
    k.halftone("#0f1a3a", "#3b3a72", "#1b2a55", 0, 0.75);
    k.stars(520, "#f5ecd6", 0.7);
    k.sun(W * 0.8, H * 0.2, 46 * u, "#f3e6c4", 0);
    g.fillStyle = "#0f1a3a"; g.beginPath(); g.arc(W * 0.8 + 18 * u, H * 0.2 - 8 * u, 40 * u, 0, Math.PI * 2); g.fill();
    k.ridge(H * 0.66, 50 * u, 6, 26 * u, "#8a3f2c", 0.8);
    k.ridge(H * 0.74, 40 * u, 9, 30 * u, "#a8502f", 0.8);
    const ground = k.ridge(H * 0.86, 18 * u, 3, 10 * u, "#6e2f22");
    [0.12, 0.3, 0.55, 0.7, 0.9].forEach((p, i) => k.cactus(W * p, ground(W * p) + 30 * u, (i % 2 ? 150 : 230) * u, "#2c3b2a"));
  },
  caribe(g, k) {
    const { W, H, u, rand } = k;
    k.halftone("#7cc4d8", "#f6e2a8", "#ffffff", 0.05, 0.55);
    k.sun(W * 0.5, H * 0.46, 150 * u, "#f6b84a", 3);
    // mar en bandas
    ["#1f6f8b", "#2a86a0", "#3aa0b0", "#63b8b9"].forEach((c, i) => {
      const y = H * (0.55 + i * 0.07);
      k.print(() => { g.beginPath(); g.moveTo(-20, y); for (let x = -20; x <= W + 20; x += 18 * u) g.lineTo(x, y + Math.sin(x / (40 * u) + i) * 5 * u); g.lineTo(W + 20, H); g.lineTo(-20, H); g.closePath(); }, c, 0.5);
    });
    k.print(() => { g.beginPath(); g.moveTo(-20, H * 0.86); g.quadraticCurveTo(W * 0.5, H * 0.8, W + 20, H * 0.9); g.lineTo(W + 20, H + 20); g.lineTo(-20, H + 20); g.closePath(); }, "#ecd39a");
    // palmeras inclinadas
    const lean = (x, h, dir) => { g.save(); g.translate(x, H * 0.92); g.rotate(dir * 0.22); k.palm(0, 0, h, "#7a5a3a", "#2f6b3a"); g.restore(); };
    lean(W * 0.08, 420 * u, 1); lean(W * 0.92, 360 * u, -1);
  },
  papel(g, k) {
    const { W, H, u } = k;
    g.fillStyle = "#efe7d8"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(31,29,26,.06)"; g.lineWidth = 1;
    for (let x = 0; x < W; x += 40 * u) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 40 * u) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    k.sun(W * 0.82, H * 0.74, 210 * u, "#c4532f", 0);
    k.sun(W * 0.82, H * 0.74, 140 * u, "#d9a441", 0);
  },
  /* ---------- épocas ---------- */
  "era-prado"(g, k) {
    const { W, H, u } = k; const lin = (y0, y1, stops) => { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    g.fillStyle = lin(0, H * 0.7, [[0, "#1d5fd0"], [0.55, "#5d9be8"], [1, "#b9dcf6"]]); g.fillRect(0, 0, W, H);
    // nubes: grupos de círculos suaves
    g.save(); g.filter = `blur(${6 * u}px)`; g.fillStyle = "rgba(255,255,255,.86)";
    const cloud = (x, y, s) => { for (const [dx, dy, r] of [[0, 0, 60], [55, -18, 50], [105, 2, 58], [160, -6, 44], [-50, 8, 40], [60, 22, 52]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); } };
    cloud(W * 0.18, H * 0.2, 1.4 * u); cloud(W * 0.66, H * 0.12, 1.1 * u); cloud(W * 0.86, H * 0.32, 0.8 * u); cloud(W * 0.42, H * 0.36, 0.7 * u); g.restore();
    // colina del fondo
    g.fillStyle = lin(H * 0.55, H, [[0, "#5e9b3a"], [1, "#3f7a25"]]);
    g.beginPath(); g.moveTo(-10, H * 0.72); g.bezierCurveTo(W * 0.3, H * 0.58, W * 0.55, H * 0.62, W + 10, H * 0.7); g.lineTo(W + 10, H); g.lineTo(-10, H); g.fill();
    // colina principal, más clara arriba a la izquierda
    const gr = g.createRadialGradient(W * 0.32, H * 0.62, 20 * u, W * 0.4, H * 0.9, W * 0.7); gr.addColorStop(0, "#9fd25a"); gr.addColorStop(0.45, "#5fa52c"); gr.addColorStop(1, "#2f6a17");
    g.fillStyle = gr; g.beginPath(); g.moveTo(-10, H * 0.82); g.bezierCurveTo(W * 0.18, H * 0.6, W * 0.62, H * 0.6, W + 10, H * 0.86); g.lineTo(W + 10, H + 10); g.lineTo(-10, H + 10); g.fill();
    // brillo de pasto
    g.strokeStyle = "rgba(220,245,160,.10)"; g.lineWidth = 1.2 * u;
    for (let i = 0; i < 900; i++) { const x = k.rand() * W, y = H * 0.7 + k.rand() * H * 0.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (k.rand() - 0.5) * 6 * u, y - 10 * u * k.rand()); g.stroke(); }
  },
  "era-cristal"(g, k) {
    const { W, H, u } = k; const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#04121a"); bg.addColorStop(0.6, "#082833"); bg.addColorStop(1, "#04161b"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.save(); g.globalCompositeOperation = "lighter";
    const ribbon = (y, amp, col, width, phase) => { for (let s = 0; s < 26; s++) { g.strokeStyle = col.replace("A", (0.035 * (1 - s / 26)).toFixed(3)); g.lineWidth = width * (1 - s / 30) * u; g.beginPath();
      for (let x = -50; x <= W + 50; x += 20 * u) { const yy = y + Math.sin(x / W * Math.PI * 2 + phase + s * 0.05) * amp + Math.sin(x / W * 7 + phase) * amp * 0.25 + s * 3 * u; x === -50 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); } };
    ribbon(H * 0.46, 110 * u, "rgba(90,230,190,A)", 9, 0.4); ribbon(H * 0.58, 80 * u, "rgba(60,190,230,A)", 7, 1.9); ribbon(H * 0.36, 60 * u, "rgba(170,240,140,A)", 5, 3.1);
    g.fillStyle = "rgba(200,255,240,.5)"; for (let i = 0; i < 160; i++) { g.beginPath(); g.arc(k.rand() * W, H * 0.25 + k.rand() * H * 0.55, k.rand() * 1.6 * u, 0, Math.PI * 2); g.fill(); }
    g.restore();
  },
  "era-vidrio"(g, k) {
    const { W, H, u } = k; const bg = g.createRadialGradient(W * 0.5, H * 0.62, 10, W * 0.5, H * 0.62, Math.max(W, H) * 0.8); bg.addColorStop(0, "#7fe3f2"); bg.addColorStop(0.35, "#1f9bc2"); bg.addColorStop(1, "#06425f"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.save(); g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (i - 6.5) * 0.17 + (k.rand() - 0.5) * 0.06, w = 0.025 + k.rand() * 0.04, L = Math.max(W, H) * 1.2;
      g.fillStyle = `rgba(255,255,255,${(0.025 + k.rand() * 0.04).toFixed(3)})`; g.beginPath(); g.moveTo(W * 0.5, H * 0.66); g.lineTo(W * 0.5 + Math.cos(a - w) * L, H * 0.66 + Math.sin(a - w) * L); g.lineTo(W * 0.5 + Math.cos(a + w) * L, H * 0.66 + Math.sin(a + w) * L); g.fill(); }
    for (let i = 0; i < 40; i++) { const r = (8 + k.rand() * 50) * u, x = k.rand() * W, y = k.rand() * H; const b = g.createRadialGradient(x, y, 0, x, y, r); b.addColorStop(0, "rgba(255,255,255,.10)"); b.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.restore();
  },
  "era-mosaico"(g, k) {
    const { W, H, u } = k; g.fillStyle = "#1f5f4b"; g.fillRect(0, 0, W, H);
    const cols = ["#246c55", "#1b5443", "#2b7a60", "#174a3b", "#2f8468", "#20614d"];
    const pts = []; for (let i = 0; i < 14; i++) for (let j = 0; j < 9; j++) pts.push([W * 0.38 + i * W * 0.05 + (k.rand() - 0.5) * W * 0.03, j * H * 0.13 + (k.rand() - 0.5) * H * 0.05]);
    for (let i = 0; i < 13; i++) for (let j = 0; j < 8; j++) { const p = (a, b) => pts[a * 9 + b]; const A = p(i, j), B = p(i + 1, j), C = p(i, j + 1), D = p(i + 1, j + 1);
      for (const tri of [[A, B, C], [B, D, C]]) { g.fillStyle = cols[Math.floor(k.rand() * cols.length)]; g.globalAlpha = Math.min(1, 0.25 + (i / 13) * 0.9); g.beginPath(); g.moveTo(...tri[0]); g.lineTo(...tri[1]); g.lineTo(...tri[2]); g.fill(); } }
    g.globalAlpha = 1;
  },
  /* suelo de rejilla en perspectiva (Núcleo y Circuito) */
  "era-nucleo"(g, k) {
    const { W, H, u } = k, hz = H * 0.62, cx = W * 0.5, cy = H * 0.34, R = Math.min(W, H) * 0.17;
    g.fillStyle = "#020402"; g.fillRect(0, 0, W, H);
    // estrellas
    for (let i = 0; i < 420; i++) { g.fillStyle = `rgba(220,255,200,${(0.1 + k.rand() * 0.6).toFixed(2)})`; g.fillRect(k.rand() * W, k.rand() * hz, k.rand() < 0.1 ? 2 * u : 1, k.rand() < 0.1 ? 2 * u : 1); }
    g.save(); g.globalCompositeOperation = "lighter";
    // gran resplandor verde detrás del núcleo y sobre el horizonte
    const glow = g.createRadialGradient(cx, cy, R * 0.3, cx, cy, Math.max(W, H) * 0.7); glow.addColorStop(0, "rgba(150,240,40,.55)"); glow.addColorStop(0.25, "rgba(70,160,13,.32)"); glow.addColorStop(1, "rgba(20,60,5,0)"); g.fillStyle = glow; g.fillRect(0, 0, W, H);
    const hzGlow = g.createLinearGradient(0, hz - 90 * u, 0, hz + 40 * u); hzGlow.addColorStop(0, "rgba(120,220,30,0)"); hzGlow.addColorStop(0.7, "rgba(160,250,60,.45)"); hzGlow.addColorStop(1, "rgba(120,220,30,0)"); g.fillStyle = hzGlow; g.fillRect(0, hz - 90 * u, W, 130 * u);
    // suelo de rejilla en perspectiva
    g.strokeStyle = "rgba(150,240,60,.55)"; g.lineWidth = 1.4 * u;
    for (let i = -24; i <= 24; i++) { g.beginPath(); g.moveTo(cx + i * 6 * u, hz); g.lineTo(cx + i * W * 0.14, H); g.stroke(); }
    for (let j = 1; j < 22; j++) { const y = hz + (H - hz) * Math.pow(j / 21, 2.2); g.globalAlpha = 0.25 + j / 30; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.globalAlpha = 1;
    // el núcleo: esfera de gel con anillo metálico
    g.restore();
    const ring = g.createLinearGradient(cx, cy - R * 1.3, cx, cy + R * 1.3); ring.addColorStop(0, "#e8e6ea"); ring.addColorStop(0.45, "#6f6e72"); ring.addColorStop(0.55, "#2a2a2a"); ring.addColorStop(1, "#9a999a");
    g.fillStyle = ring; g.beginPath(); g.arc(cx, cy, R * 1.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0b0b0b"; g.beginPath(); g.arc(cx, cy, R * 1.08, 0, Math.PI * 2); g.fill();
    const core = g.createRadialGradient(cx, cy + R * 0.45, R * 0.05, cx, cy, R); core.addColorStop(0, "#f3f0bd"); core.addColorStop(0.3, "#d1fd59"); core.addColorStop(0.65, "#47a10d"); core.addColorStop(1, "#163f03");
    g.fillStyle = core; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(cx, cy - R * 0.55, R * 0.6, R * 0.28, 0, 0, Math.PI * 2); g.fill();
  },
  "era-circuito"(g, k) {
    const { W, H, u } = k, hz = H * 0.5, cx = W * 0.5;
    const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, "#000000"); sky.addColorStop(1, "#04121a"); g.fillStyle = sky; g.fillRect(0, 0, W, hz);
    g.fillStyle = "#010406"; g.fillRect(0, hz, W, H - hz);
    // montañas en contorno sobre el horizonte
    g.strokeStyle = "rgba(25,211,255,.35)"; g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(0, hz); let y = hz;
    for (let x = 0; x <= W; x += 30 * u) { y = hz - Math.abs(Math.sin(x * 0.006) * 70 * u + Math.sin(x * 0.017) * 30 * u) - k.rand() * 10 * u; g.lineTo(x, y); } g.lineTo(W, hz); g.stroke();
    g.save(); g.globalCompositeOperation = "lighter";
    const line = g.createLinearGradient(0, hz - 40 * u, 0, hz + 40 * u); line.addColorStop(0, "rgba(25,211,255,0)"); line.addColorStop(0.5, "rgba(95,230,255,.7)"); line.addColorStop(1, "rgba(25,211,255,0)"); g.fillStyle = line; g.fillRect(0, hz - 40 * u, W, 80 * u);
    // rejilla del suelo
    g.strokeStyle = "rgba(25,211,255,.5)"; g.lineWidth = 1.2 * u;
    for (let i = -30; i <= 30; i++) { g.beginPath(); g.moveTo(cx + i * 4 * u, hz); g.lineTo(cx + i * W * 0.12, H); g.stroke(); }
    for (let j = 1; j < 26; j++) { const yy = hz + (H - hz) * Math.pow(j / 25, 2.4); g.globalAlpha = 0.2 + j / 32; g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
    g.globalAlpha = 1;
    // estelas de luz que giran en ángulo recto (cian y naranja)
    const trail = (pts, col) => { for (const [w, a] of [[10, 0.08], [5, 0.18], [2, 0.9]]) { g.strokeStyle = col.replace("A", a); g.lineWidth = w * u; g.lineJoin = "miter"; g.beginPath(); pts.forEach(([x, yy], i) => i ? g.lineTo(x * W, yy * H) : g.moveTo(x * W, yy * H)); g.stroke(); } };
    trail([[0, 0.82], [0.3, 0.82], [0.3, 0.66], [0.58, 0.66], [0.58, 0.74], [0.8, 0.74]], "rgba(95,230,255,A)");
    trail([[1, 0.9], [0.72, 0.9], [0.72, 0.6], [0.46, 0.6], [0.46, 0.56]], "rgba(255,150,40,A)");
    g.restore();
  },  "era-aluminio"(g, k) {
    const { W, H, u } = k; const sky = g.createLinearGradient(0, 0, 0, H * 0.75); sky.addColorStop(0, "#14263f"); sky.addColorStop(0.45, "#3e5a78"); sky.addColorStop(0.8, "#d98a5c"); sky.addColorStop(1, "#f2c48d"); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const ridge = (base, amp, col, seed) => { g.fillStyle = col; g.beginPath(); g.moveTo(-10, H); let y = base;
      for (let x = -10; x <= W + 20; x += 18 * u) { y += (Math.sin(x * 0.004 + seed) + Math.sin(x * 0.011 + seed * 2)) * amp * 0.06 + (k.rand() - 0.5) * amp * 0.08; y = Math.max(base - amp, Math.min(base + amp * 0.4, y)); g.lineTo(x, y); } g.lineTo(W + 20, H); g.fill(); };
    ridge(H * 0.62, 150 * u, "#5d6f86", 1); ridge(H * 0.7, 120 * u, "#3f5068", 4); ridge(H * 0.8, 90 * u, "#29374b", 7); ridge(H * 0.9, 60 * u, "#1a2433", 9);
    g.fillStyle = "rgba(255,226,180,.08)"; g.fillRect(0, H * 0.55, W, H * 0.2);
  },
  tinta(g, k) {
    const { W, H, u } = k;
    g.fillStyle = "#1c1b19"; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(241,235,224,.05)";
    for (let y = 0; y < H; y += 22 * u) for (let x = (y / (22 * u)) % 2 ? 11 * u : 0; x < W; x += 22 * u) { g.beginPath(); g.arc(x, y, 1.6 * u, 0, Math.PI * 2); g.fill(); }
    k.sun(W * 0.18, H * 0.28, 160 * u, "#2a2825", 0);
    k.sun(W * 0.18, H * 0.28, 100 * u, "#c4532f", 0);
  },
};

/* ---------------- render + caché ---------------- */
const cache = new Map();
export function renderWall(id, w, h) {
  const scene = SCENES[id] || SCENES.paramo;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  const rand = rng([...id].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7));
  const k = makeKit(g, w, h, rand);
  scene(g, k);
  if (!id.startsWith("era-")) k.grain(id === "tinta" ? 0.06 : 0.1); // las épocas sin grano de papel
  return c;
}
/** URL (blob) del fondo a la resolución de la pantalla, cacheada */
export async function wallUrl(id, w = Math.min(2560, Math.round(screen.width * (window.devicePixelRatio || 1))), h = Math.round(w * screen.height / screen.width)) {
  const ph = photoOf(id); if (ph) return photoSrc(ph, w <= 600);
  const key = `${id}@${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const p = new Promise(res => { const c = renderWall(id, w, h); c.toBlob(b => res(URL.createObjectURL(b)), "image/jpeg", 0.9); });
  cache.set(key, p); return p;
}
export const isWall = (id) => WALLS.some(w => w.id === id) || ERA_WALLS.some(w => w.id === id) || !!photoOf(id);
