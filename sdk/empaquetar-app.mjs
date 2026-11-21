#!/usr/bin/env node
// Sotos SDK — revisa una app y la empaqueta en <id>-<versión>.zip, lista para instalar en
// Administración → Apps.
//   node sdk/empaquetar-app.mjs <carpeta-de-la-app> [--salida carpeta]
// Revisa el manifiesto, que exista el archivo de entrada, que la página cargue el SDK si pide
// permisos, y avisa de lo que no funcionará en el aislamiento (localStorage, cookies, rutas absolutas).
// © 2026 Sebastian Sotomontes · MIT
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { validateManifest } from "./manifest.mjs";
const args = process.argv.slice(2); const dir = path.resolve(args.find(a => !a.startsWith("--")) || ".");
const outDir = path.resolve(args.includes("--salida") ? args[args.indexOf("--salida") + 1] : process.cwd());
const fail = (m) => { console.error("  ✗ " + m); process.exit(1); };
const warn = (m) => console.log("  ! " + m), ok = (m) => console.log("  ✓ " + m);
if (!fs.existsSync(path.join(dir, "sotos-app.json"))) fail(`No hay sotos-app.json en ${dir}`);
let m; try { m = validateManifest(JSON.parse(fs.readFileSync(path.join(dir, "sotos-app.json"), "utf8"))); } catch (e) { fail(e.message); }
ok(`${m.name} ${m.version} (${m.id})`);
const SKIP = /(^|\/)(node_modules|\.git|\.DS_Store|Thumbs\.db|.*\.zip)$/;
const files = []; (function walk(d, rel = "") { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + "/" + e.name : e.name; if (SKIP.test(r)) continue; e.isDirectory() ? walk(path.join(d, e.name), r) : files.push(r); } })(dir);
if (!files.includes(m.entry)) fail(`No existe el archivo de entrada «${m.entry}»`);
const html = fs.readFileSync(path.join(dir, m.entry), "utf8");
if (m.permissions.length && !/sotos-sdk\.js/.test(html)) warn(`La app pide permisos pero ${m.entry} no carga el SDK: agrega <script src="/sdk/sotos-sdk.js"></script>`);
let code = ""; for (const f of files) if (/\.(html?|m?js)$/.test(f)) code += fs.readFileSync(path.join(dir, f), "utf8");
if (/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/.test(code)) warn("Usa localStorage/sessionStorage/indexedDB: en Sotos la app corre aislada y no están disponibles. Usa sotos.storage.");
if (/document\.cookie/.test(code)) warn("Usa document.cookie: no funciona en el aislamiento.");
if (/(src|href)=["']\/(?!sdk\/)/.test(html)) warn("Hay rutas absolutas (\"/algo\") en el HTML: usa rutas relativas («./algo»).");
if (/type=["']module["']/.test(html)) ok("Usa módulos JS (se sirven con CORS: funcionan)");
for (const p of m.permissions) ok("permiso: " + p);
// .zip con deflate y CRC32 (sin dependencias)
const recs = [], central = []; let off = 0; const D = new Date(); const dt = ((D.getFullYear() - 1980) << 25) | ((D.getMonth() + 1) << 21) | (D.getDate() << 16) | (D.getHours() << 11) | (D.getMinutes() << 5) | (D.getSeconds() >> 1);
for (const f of files.sort()) {
  const data = fs.readFileSync(path.join(dir, f)), comp = zlib.deflateRawSync(data, { level: 9 }), name = Buffer.from(f, "utf8"), crc = zlib.crc32(data);
  const useComp = comp.length < data.length, body = useComp ? comp : data;
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useComp ? 8 : 0, 8); lh.writeUInt32LE(dt >>> 0, 10); lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  recs.push(lh, name, body);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useComp ? 8 : 0, 10); ch.writeUInt32LE(dt >>> 0, 12); ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
  central.push(ch, name); off += 30 + name.length + body.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${m.id}-${m.version}.zip`); fs.writeFileSync(out, Buffer.concat([...recs, cd, end]));
ok(`${files.length} archivo(s) → ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
console.log("\n  Instálala en Sotos: Administración → Apps → Instalar una app (.zip)");
