/* ============================================================
   Sotos OS — contenido inicial (archivos reales de ejemplo)
   © 2026 Sebastian Sotomontes
   Se ejecuta una sola vez, en el primer arranque.
   ============================================================ */
import { htmlToDocx, bookToXlsx, slidesToPptx, textPdf } from "./office.js";

const AUDIO = (i) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${i}.mp3`;
const VID = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/";

const WELCOME = `Bienvenido a Sotos OS
=====================

Sotos es un ordenador completo que vive en tu navegador.
Todo lo que guardas aquí se queda en este navegador (IndexedDB)
y, cuando inicies sesión, se sincronizará con tu cuenta.

Algunas cosas que puedes probar:

  • Arrastra archivos desde tu PC a la ventana de Archivos o al escritorio.
  • Abre "Presupuesto marketing.xlsx": las fórmulas se recalculan solas.
  • Edita "Plan de negocio.docx" y descárgalo: es un Word de verdad.
  • En la Terminal escribe:  help
  • Ctrl+C / Ctrl+X / Ctrl+V, Supr y F2 funcionan en Archivos.
  • Clic derecho sobre una imagen → "Usar como fondo".

Sotos OS · © 2026 Sebastian Sotomontes
`;

const ROADMAP = `# Roadmap de Sotos OS

- [x] Escritorio, ventanas, dock y widgets
- [x] Sistema de archivos real (IndexedDB)
- [x] Word, Excel y PowerPoint reales
- [x] Navegador con proxy propio
- [ ] Cuentas y sincronización en la nube
- [ ] Compartir con enlaces
- [ ] Mensajes en tiempo real
`;

const INDEX_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Mi web en Sotos</title>
  <link rel="stylesheet" href="estilos.css">
</head>
<body>
  <main>
    <h1>Hola desde Sotos 👋</h1>
    <p>Edita este archivo con Notas y pulsa <b>Vista previa</b>.</p>
    <button id="btn">Contar clics</button> <span id="n">0</span>
  </main>
  <script>
    let n = 0;
    document.getElementById("btn").onclick = () => document.getElementById("n").textContent = ++n;
  </script>
</body>
</html>
`;
const CSS = `body { font-family: system-ui, sans-serif; background: #f4f5f7; color: #1b1f24; }
main { max-width: 560px; margin: 60px auto; background: #fff; padding: 32px; border-radius: 12px; }
h1 { margin-top: 0; }
button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #ccd; cursor: pointer; }
`;

const PLAN = `<h1>Plan de negocio</h1>
<p><i>Borrador · ${new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</i></p>
<h2>1. Resumen</h2>
<p>Sotos ofrece un escritorio completo en el navegador: archivos, documentos, hojas de cálculo, presentaciones y comunicación en un solo lugar, sin instalar nada.</p>
<h2>2. Problema</h2>
<ul><li>Las herramientas de trabajo están dispersas en decenas de pestañas.</li><li>Los equipos pierden tiempo buscando archivos.</li><li>Los equipos compartidos o antiguos no pueden instalar software.</li></ul>
<h2>3. Propuesta</h2>
<p>Un único espacio de trabajo que sigue al usuario en cualquier dispositivo, con formatos estándar (<b>.docx</b>, <b>.xlsx</b>, <b>.pptx</b>) para no encerrar sus datos.</p>
<h2>4. Próximos pasos</h2>
<ol><li>Lanzar la beta pública.</li><li>Abrir cuentas y sincronización.</li><li>Medir uso y retención.</li></ol>`;

const ACUERDO = `<h1>Acuerdo de colaboración</h1>
<p>Este acuerdo se establece entre las partes abajo firmantes con el objeto de regular la colaboración descrita en las siguientes cláusulas.</p>
<h2>I. Objeto</h2><p>Las partes colaborarán en el desarrollo y la difusión del proyecto, aportando cada una los recursos indicados en el anexo.</p>
<h2>II. Duración</h2><p>El acuerdo tendrá una vigencia de doce (12) meses desde su firma, prorrogables de mutuo acuerdo.</p>
<h2>III. Obligaciones</h2><ul><li>Mantener la confidencialidad de la información compartida.</li><li>Colaborar de buena fe en los objetivos comunes.</li><li>Revisar y aprobar los entregables en los plazos acordados.</li></ul>
<h2>IV. Disposiciones finales</h2><p>Cualquier modificación deberá constar por escrito y ser firmada por ambas partes.</p>`;

const BUDGET = {
  sheets: [{
    name: "Presupuesto",
    cells: {
      A1: "Presupuesto de marketing", A3: "Categoría", B3: "Cantidad", C3: "Coste/ud.", D3: "Subtotal",
      A5: "Honorarios", B5: "2", C5: "2300", D5: "=B5*C5",
      A6: "Investigación web", B6: "1", C6: "1100", D6: "=B6*C6",
      A7: "Externa", B7: "3", C7: "300", D7: "=B7*C7",
      A9: "Total investigación", D9: "=SUM(D5:D7)",
      A11: "Comunicación", A12: "Folletos", B12: "5000", C12: "0.15", D12: "=B12*C12",
      A13: "Televisión", B13: "5", C13: "4000", D13: "=B13*C13",
      A15: "Total general", D15: "=D9+D12+D13",
      A17: "Promedio por partida", D17: "=ROUND(AVERAGE(D5:D7,D12:D13),2)",
    },
    fmt: { A1: { b: true }, A3: { b: true }, B3: { b: true }, C3: { b: true }, D3: { b: true }, A9: { b: true }, D9: { b: true }, A15: { b: true }, D15: { b: true } },
    widths: { A: 170 },
  }],
};
const GASTOS = `Fecha,Concepto,Importe
2026-05-04,Vuelo Bogotá - Medellín,320000
2026-05-04,Hotel (2 noches),410000
2026-05-05,Taxis,58000
2026-05-06,Comidas,126000
`;
const SLIDES = [
  { bg: "linear-gradient(135deg,#2b3a8c,#5b3a9e)", title: "Tendencias de marca 2026", sub: "Estrategia y dirección creativa", kicker: "SOTOS · EQUIPO PRODUCTO" },
  { bg: "#ffffff", dark: true, title: "El reto", bullets: ["Saturación visual en el sector", "Audiencias más jóvenes y digitales", "Necesidad de una identidad coherente"] },
  { bg: "#ffffff", dark: true, title: "Tres pilares", bullets: ["Claridad — menos es más", "Calidez — humano y cercano", "Movimiento — vivo y dinámico"] },
  { bg: "linear-gradient(135deg,#0f7f6b,#2bd4c4)", title: "Próximos pasos", sub: "Roadmap del trimestre", kicker: "Q3 2026" },
];

// "fotos" dibujadas: degradado de cielo + capas de montañas / agua
const PICS = [
  { name: "Playa.jpg", sky: ["#9be4ff", "#3ba0e0"], ground: ["#f6d98a", "#e8c46c"], sun: "#fff3b0", kind: "sea" },
  { name: "Montaña.jpg", sky: ["#cdd6e0", "#8798ad"], ground: ["#4b5b70", "#2d3a4d"], sun: "#ffffff", kind: "peaks" },
  { name: "Ciudad.jpg", sky: ["#ffb88c", "#c45a8a"], ground: ["#3a2b5e", "#21183a"], sun: "#ffd29a", kind: "city" },
  { name: "Glaciar.jpg", sky: ["#e4f6fa", "#8fd0de"], ground: ["#4fb0c4", "#1e5e74"], sun: "#ffffff", kind: "peaks" },
  { name: "Bosque.jpg", sky: ["#d9f2c9", "#8cc49a"], ground: ["#3f9e6c", "#1c4a3a"], sun: "#fffbe0", kind: "hills" },
  { name: "Noche.jpg", sky: ["#3a4a78", "#0a0e1f"], ground: ["#1d2347", "#0a0e1f"], sun: "#f4f1d0", kind: "hills", stars: true },
];
function paint(p) {
  const W = 1600, H = 1000, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  let rnd = [...p.name].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) >>> 0; const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.7); sky.addColorStop(0, p.sky[0]); sky.addColorStop(1, p.sky[1]); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  if (p.stars) for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`; g.fillRect(rand() * W, rand() * H * 0.6, 2, 2); }
  g.fillStyle = p.sun; g.globalAlpha = 0.9; g.beginPath(); g.arc(W * 0.72, H * 0.28, 70, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  const layer = (base, amp, col, jag) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += jag) g.lineTo(x, base - rand() * amp); g.lineTo(W, H); g.fill(); };
  if (p.kind === "sea") { const s = g.createLinearGradient(0, H * 0.55, 0, H * 0.75); s.addColorStop(0, "#2e8fd0"); s.addColorStop(1, "#1b6aa8"); g.fillStyle = s; g.fillRect(0, H * 0.55, W, H * 0.2); g.fillStyle = p.ground[0]; g.fillRect(0, H * 0.75, W, H * 0.25); }
  else if (p.kind === "city") { layer(H * 0.7, 30, p.ground[0], 80); for (let x = 0; x < W; x += 60 + rand() * 40) { const h = 120 + rand() * 300; g.fillStyle = p.ground[1]; g.fillRect(x, H - h - 120, 50 + rand() * 30, h + 120); g.fillStyle = "rgba(255,210,140,.55)"; for (let wy = H - h - 100; wy < H - 30; wy += 26) for (let wx = x + 8; wx < x + 44; wx += 16) if (rand() > 0.45) g.fillRect(wx, wy, 7, 10); } }
  else if (p.kind === "peaks") { layer(H * 0.55, 260, p.ground[0], 160); layer(H * 0.75, 160, p.ground[1], 110); }
  else { layer(H * 0.62, 90, p.ground[0], 60); layer(H * 0.8, 70, p.ground[1], 45); }
  return new Promise(res => c.toBlob(res, "image/jpeg", 0.88));
}

export async function buildSeed({ put, newId, typeOf }) {
  const now = Date.now();
  const folder = (name, children = [], id = newId()) => ({ id, name, type: "folder", children, ctime: now, mtime: now });
  const file = async (name, blob, extra = {}) => { const id = newId(); if (blob) await put(id, blob); return { id, name, type: typeOf(name), size: blob ? blob.size : 0, ctime: now, mtime: now, ...extra }; };
  const txt = (s, t = "text/plain") => new Blob([s], { type: t });

  const [plan, acuerdo, xlsx, pptx, pics] = await Promise.all([
    htmlToDocx(PLAN, "Plan de negocio"), htmlToDocx(ACUERDO, "Acuerdo de colaboración"),
    bookToXlsx(BUDGET), slidesToPptx(SLIDES, "Tendencias de marca"), Promise.all(PICS.map(paint)),
  ]);
  const pdf = textPdf("Guía rápida de Sotos OS", [
    "Sotos OS es un escritorio completo que funciona dentro del navegador. Tus archivos se guardan en este dispositivo y se sincronizarán con tu cuenta cuando inicies sesión.",
    "Archivos: arrastra documentos desde tu PC, crea carpetas, usa Ctrl+C, Ctrl+X y Ctrl+V para copiar y mover, Supr para enviar a la papelera y F2 para renombrar.",
    "Documentos, Hojas y Presentaciones abren y guardan archivos .docx, .xlsx y .pptx reales que puedes descargar y abrir en cualquier otro programa.",
    "Terminal: escribe help para ver los comandos. Puedes navegar con cd, listar con ls, crear con mkdir y touch, y abrir archivos con open.",
    "Sotos OS - (c) 2026 Sebastian Sotomontes.",
  ]);

  const music = [
    ["Brisa nocturna", "Lumen", "Horas azules"], ["Reflejos", "Aria Kael", "Cristal"], ["Estática suave", "Lo-fi Coop", "Sesiones"],
    ["Corriente", "Nimbo", "Flujo"], ["Atardecer 320", "Vega", "Órbita"], ["Vidriera", "Aria Kael", "Cristal"],
  ];
  const videos = [["Demo producto.mp4", "ForBiggerBlazes.mp4"], ["Big Buck Bunny.mp4", "BigBuckBunny.mp4"], ["Elephants Dream.mp4", "ElephantsDream.mp4"], ["For Bigger Fun.mp4", "ForBiggerFun.mp4"]];

  return folder("Sotos Drive", [
    folder("Escritorio", [await file("Bienvenido.txt", txt(WELCOME))], "desktop"),
    folder("Documentos", [
      await file("Plan de negocio.docx", plan), await file("Acuerdo de colaboración.docx", acuerdo),
      await file("Presupuesto marketing.xlsx", xlsx), await file("Gastos de viaje.csv", txt(GASTOS, "text/csv")),
      await file("Tendencias de marca.pptx", pptx), await file("Guía rápida de Sotos.pdf", pdf),
      await file("Notas reunión.txt", txt("Reunión de producto\n\n- Revisar roadmap del trimestre\n- Definir fecha de la beta\n- Preparar demo para el portafolio\n")),
    ]),
    folder("Imágenes", await Promise.all(PICS.map((p, i) => file(p.name, pics[i])))),
    folder("Música", await Promise.all(music.map(([t, a, al], i) => file(`${t}.mp3`, null, { url: AUDIO(i + 1), meta: { title: t, artist: a, album: al }, online: true })))),
    folder("Vídeos", await Promise.all(videos.map(([n, f]) => file(n, null, { url: VID + f, online: true })))),
    folder("Proyectos", [
      folder("web-sotos", [await file("index.html", txt(INDEX_HTML, "text/html")), await file("estilos.css", txt(CSS, "text/css"))]),
      await file("Roadmap.md", txt(ROADMAP, "text/markdown")),
    ]),
    folder("Descargas", []),
  ], "root");
}
