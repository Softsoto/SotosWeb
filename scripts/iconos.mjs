// Sotos — genera la fuente de íconos solo con los que usa el código (Material Symbols Rounded, Apache 2.0)
// La fuente completa pesa ~5 MB; el subconjunto (grosor 400, tamaño óptico 24, con y sin relleno), unos 50 KB. Volver a ejecutar al usar íconos nuevos:
//   node scripts/iconos.mjs
// © 2026 Sebastian Sotomontes
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = new Set([...fs.readFileSync(path.join(ROOT, "web/node_modules/material-symbols/index.d.ts"), "utf8").matchAll(/"([a-z0-9_]+)"/g)].map(m => m[1]));
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory() && e.name !== "node_modules" && e.name !== "dist") walk(p, out); else if (/\.(jsx?|mjs|html)$/.test(e.name)) out.push(p); } return out; };
// web/public/apps no se recorre: esas páginas no usan esta fuente (sus íconos de la Tienda están en web/src)
const files = [...walk(path.join(ROOT, "web/src")), ...walk(path.join(ROOT, "server"))];
// palabras del código que coinciden con un ícono pero nunca se usan como tal (lenguajes, códecs, términos técnicos)
const IGNORE = new Set(["sdk", "av1", "hevc", "2d", "eyebrow", "javascript", "php", "sql", "css", "html", "http", "iframe", "markdown", "toast", "uppercase", "lists", "csv", "api", "host", "domain", "script", "window", "input", "join", "post", "start", "step", "steps", "toolbar", "web",
  // nombres de apps, campos y palabras sueltas del código que nunca se dibujan como ícono.
  // OJO: antes de agregar una, buscarla en listas de íconos (Paint, Juegos, Mundos, Contactos…): si se usa, sale como texto.
  "abc", "artist", "chips", "details", "diamond", "face", "flip", "height", "label", "light", "move", "orbit",
  "reminder", "resize", "reviews", "scan", "score", "signature", "spa", "square", "stars",
  "sticker", "store", "sweep", "target", "task", "tour", "unsubscribe", "upcoming", "wc",
  "box", "update", "menu", "radio", "navigation", "pending"]);
const used = new Set();
for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/["'`]([a-z0-9_]{2,40})["'`]/g)) if (names.has(m[1]) && !IGNORE.has(m[1])) used.add(m[1]);
const list = [...used].sort();
const url = `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${list.join(",")}&display=block`;
// Google ignora la lista (y manda la fuente entera, ~530 KB) si la dirección pasa de ~4.200 caracteres
if (url.length > 4150) console.warn(`  ! La lista de íconos está cerca del límite de Google (${url.length} caracteres): agrega palabras que no sean íconos a IGNORE.`);
const css = await (await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" } })).text();
const src = /url\((https:[^)]+)\)/.exec(css)?.[1]; if (!src) throw new Error("Google Fonts no devolvió la fuente:\n" + css.slice(0, 400));
const font = Buffer.from(await (await fetch(src)).arrayBuffer());
const out = path.join(ROOT, "web/src/os/fonts"); fs.mkdirSync(out, { recursive: true });
if (font.length > 200 * 1024) throw new Error(`Google devolvió la fuente completa (${(font.length / 1024).toFixed(0)} KB): la lista de ${list.length} íconos es demasiado larga. Agrega palabras que no sean íconos a IGNORE.`);
fs.writeFileSync(path.join(out, "material-symbols-sotos.woff2"), font);
fs.writeFileSync(path.join(out, "iconos.json"), JSON.stringify(list));
const base = fs.readFileSync(path.join(ROOT, "web/node_modules/material-symbols/rounded.css"), "utf8").replace(/src: url\([^)]+\) format\("woff2"\);/, 'src: url("./material-symbols-sotos.woff2") format("woff2");');
fs.writeFileSync(path.join(out, "simbolos.css"), `/* Material Symbols Rounded (Apache 2.0, Google) · subconjunto de ${list.length} íconos generado por scripts/iconos.mjs */\n` + base);
console.log(`${list.length} íconos · ${(font.length / 1024).toFixed(0)} KB (antes ${(fs.statSync(path.join(ROOT, "web/node_modules/material-symbols/material-symbols-rounded.woff2")).size / 1048576).toFixed(1)} MB)`);
