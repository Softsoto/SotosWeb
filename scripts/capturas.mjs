// Sotos OS — capturas automáticas para la documentación
// © 2026 Sebastian Sotomontes
//
// Requiere: servidor (server: npm run dev) y escritorio (web: npm run dev) en marcha.
// Uso:  node scripts/capturas.mjs <carpeta de salida>
// Abre Edge sin ventana a 1600×1000 (densidad 1.5), crea/usa una cuenta local de capturas
// y recorre el sistema por el gancho de desarrollo window.__sotos y eventos reales de ratón/teclado.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "capturas");
const APP = process.env.SOTOS_URL || "http://localhost:5173";
const EDGE = process.env.EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9333, W = 1600, H = 1000;
const ACCOUNT = { email: "capturas@sotos.test", name: "Sebastian Sotomontes", password: "capturas-locales-2026" }; // cuenta local de prueba
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------------- Edge + CDP ---------------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sotos-capturas-"));
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  "--no-first-run", "--hide-scrollbars", "--disable-features=Translate", "--lang=es-ES", "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); } catch {} }
if (!target) throw new Error("No se pudo conectar con Edge");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } };
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });

await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1.5, mobile: false });
await cdp("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: APP }).catch(() => {});

const js = async (expression) => { const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const nav = async (url, wait = 3500) => { await cdp("Page.navigate", { url }); await sleep(wait); };
const shot = async (name) => { const r = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 90 }); fs.writeFileSync(path.join(OUT, name + ".jpg"), Buffer.from(r.data, "base64")); console.log("  captura", name); };
const mouse = async (x, y, button = "left") => {
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, clickCount: 1 });
};
const drag = async (x1, y1, x2, y2) => {
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1 });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
  for (let i = 1; i <= 6; i++) { await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + (x2 - x1) * i / 6, y: y1 + (y2 - y1) * i / 6, button: "left", buttons: 1 }); await sleep(30); }
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
};
const type = (text) => cdp("Input.insertText", { text });
const enter = async () => { for (const t of ["keyDown", "keyUp"]) await cdp("Input.dispatchKeyEvent", { type: t, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: t === "keyDown" ? "\r" : undefined }); };
const esc = async () => { for (const t of ["keyDown", "keyUp"]) await cdp("Input.dispatchKeyEvent", { type: t, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); };
const center = (sel) => js(`(() => { const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
// ventanas: cerrar todo, colocar una
const reset = () => js("__sotos.setWins([]), true");
const place = (app, x, y, w, h) => js(`__sotos.setWins(ws => ws.map(v => v.appId === "${app}" ? { ...v, x: ${x}, y: ${y}, w: ${w}, h: ${h}, maximized: false, minimized: false } : v)), true`);
const nodeId = (p) => js(`__sotos.vfs.resolve(${JSON.stringify(p)})?.id`);
const open = async (p, wait = 3000) => { await js(`__sotos.openItem(__sotos.vfs.resolve(${JSON.stringify(p)})), true`); await sleep(wait); };

try {
  /* 1. pantalla de acceso */
  await nav(APP, 5000);
  await js(`localStorage.setItem("sotos", JSON.stringify({ wallpaper: "paramo", theme: "light", accent: "#c4532f" })), true`);
  await nav(APP, 5000);
  await shot("01-acceso");

  /* cuenta local de capturas (crear o entrar) */
  await js(`(async () => { const h = { "x-sotos": "1", "content-type": "application/json" };
    const r = await fetch("/api/auth/register", { method: "POST", headers: h, body: JSON.stringify(${JSON.stringify(ACCOUNT)}) });
    if (r.status === 409) await fetch("/api/auth/login", { method: "POST", headers: h, body: JSON.stringify(${JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.password })}) });
    localStorage.setItem("sotos_in", "1"); localStorage.setItem("sotos_mode", "cloud"); return true; })()`);
  await nav(APP, 9000);
  for (let i = 0; i < 40 && !(await js("!!(window.__sotos && __sotos.vfs.getState().ready && __sotos.vfs.getState().sync.status === 'ok')")); i++) await sleep(500);

  /* 2. escritorio */
  await reset(); await js(`__sotos.openApp("files"), true`); await sleep(1200);
  await place("files", 330, 120, 900, 560); await sleep(1200);
  await shot("02-escritorio");

  /* 3. archivos: Documentos en vista de lista */
  await reset(); await js(`localStorage.setItem("sotos_files_view", "list"), true`);
  await js(`__sotos.openApp("files", { folderId: __sotos.vfs.resolve("/Documentos").id }), true`); await sleep(1200);
  await place("files", 200, 80, 1200, 760); await sleep(800);
  const row = await center(`[...document.querySelectorAll(".file-row")].find(r => r.textContent.includes("Plan de negocio"))`);
  if (row) await mouse(row[0], row[1]);
  await sleep(500); await shot("03-archivos");
  await js(`localStorage.setItem("sotos_files_view", "grid"), true`);

  /* 4. Word */
  await reset(); await open("/Documentos/Plan de negocio.docx", 4000);
  await place("docs", 170, 56, 1260, 850); await sleep(1500); await shot("04-word");

  /* 5. Excel con una selección (suma y promedio en la barra) */
  await reset(); await open("/Documentos/Presupuesto marketing.xlsx", 4000);
  await place("sheets", 170, 56, 1260, 850); await sleep(1500);
  const td = (ref) => center(`document.querySelectorAll(".window .sheet tbody tr")[${+ref.slice(1) - 1}]?.children[${ref.charCodeAt(0) - 64}]`);
  const a = await td("D5"), b = await td("D13");
  if (a && b) await drag(a[0], a[1], b[0], b[1]);
  await sleep(800); await shot("05-excel");

  /* 6. Presentaciones */
  await reset(); await open("/Documentos/Tendencias de marca.pptx", 4000);
  await place("slides", 170, 56, 1260, 850); await sleep(1500); await shot("06-presentaciones");

  /* 7. Terminal */
  await reset(); await js(`__sotos.openApp("terminal"), true`); await sleep(1000);
  await place("terminal", 250, 110, 1100, 680); await sleep(600);
  const term = await center(`document.querySelector(".window .t-line input")`); if (term) await mouse(term[0], term[1]);
  for (const c of ["cd Documentos", "ls -l", "neofetch"]) { await type(c); await enter(); await sleep(900); }
  await shot("07-terminal");

  /* 8. Navegador con proxy + menú contextual dentro de la página */
  await reset(); await js(`localStorage.removeItem("sotos_browser"), true`);
  await js(`__sotos.openApp("browser", { url: "https://es.wikipedia.org/wiki/Espeletia", scName: "Espeletia" }), true`);
  await sleep(1000); await place("browser", 150, 56, 1300, 850); await sleep(14000);
  const fr = await js(`(() => { const r = document.querySelector(".window iframe").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
  // estado real de las imágenes dentro del iframe (otro origen: se consulta por CDP en su contexto)
  const frames = (await cdp("Page.getFrameTree")).frameTree.childFrames || [];
  if (frames[0]) {
    const w = await cdp("Page.createIsolatedWorld", { frameId: frames[0].frame.id });
    // Edge sin ventana no dispara la carga diferida dentro de iframes: forzarla para la captura
    await cdp("Runtime.evaluate", { contextId: w.executionContextId, expression: `document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = "eager"; i.src = i.src; })` });
    await sleep(3000);
    const r = await cdp("Runtime.evaluate", { contextId: w.executionContextId, returnByValue: true, expression: `[...document.images].filter(i => i.closest(".infobox")).map(i => ({ ok: i.complete && i.naturalWidth > 0 }))` });
    console.log("  imágenes de la ficha:", JSON.stringify(r.result.value));
  }
  await mouse(fr[0] + fr[2] * 0.66, fr[1] + fr[3] * 0.4, "right"); await sleep(900);
  await shot("08-navegador");
  await esc();

  /* 9. menú contextual sobre un archivo del escritorio */
  await reset(); await sleep(600);
  const ico = await center(`[...document.querySelectorAll(".desk-icon")].find(d => d.textContent.includes("Bienvenido"))`);
  if (ico) { await mouse(ico[0], ico[1]); await mouse(ico[0], ico[1], "right"); }
  await sleep(800); await shot("09-menu-contextual"); await esc();

  /* 10. Ajustes > Fondo */
  await reset(); await js(`__sotos.openApp("settings"), true`); await sleep(1000);
  await place("settings", 170, 70, 1260, 800); await sleep(500);
  const tab = await center(`[...document.querySelectorAll(".window .side-item")].find(s => /Fondo$/.test(s.textContent.trim()))`);
  if (tab) await mouse(tab[0], tab[1]);
  await sleep(3500); await shot("10-fondos");

  /* 11. Compartir */
  await reset(); await js(`__sotos.share(__sotos.vfs.resolve("/Documentos/Plan de negocio.docx").id), true`); await sleep(1200);
  const btn = await center(`[...document.querySelectorAll(".share-card button")].find(b => b.textContent.includes("Crear enlace"))`);
  if (btn) await mouse(btn[0], btn[1]);
  await sleep(2000); await shot("11-compartir"); await esc();

  /* 12. tema oscuro: música y galería sobre Tatacoa */
  await js(`__sotos.update("theme", "dark"), __sotos.update("wallpaper", "tatacoa"), true`); await reset(); await sleep(2500);
  await js(`__sotos.openApp("gallery"), true`); await sleep(1500); await place("gallery", 620, 260, 860, 600);
  await js(`__sotos.openApp("music"), true`); await sleep(1500); await place("music", 120, 70, 780, 540);
  await sleep(2500); await shot("12-oscuro");
  await js(`__sotos.update("theme", "light"), __sotos.update("wallpaper", "paramo"), true`);

  /* 13. página pública de un enlace */
  const tok = await js(`fetch("/api/shares").then(r => r.json()).then(d => d.shares[0]?.token)`);
  if (tok) { await nav(`${APP}/#/s/${tok}`, 500); await nav(`${APP}/#/s/${tok}`, 4000); await shot("13-enlace-publico"); }

  /* 14. arranque */
  await js(`localStorage.setItem("sotos_in", "")`); await cdp("Page.navigate", { url: APP }); await sleep(1300); await shot("14-arranque");
} finally {
  ws.close(); edge.kill();
  await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log("Capturas en", OUT);
