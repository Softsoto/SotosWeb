/* ============================================================
   Sotos — apps de terceros (SDK)
   Una app es una carpeta con sotos-app.json + sus archivos (HTML/JS/CSS…), empaquetada en .zip.
   El administrador la instala desde Administración → Apps; aparece en la Tienda y cada
   persona la instala en su cuenta.

   Seguridad: los archivos de la app se sirven con CSP «sandbox» (origen opaco): la app no
   puede leer la sesión ni llamar a la API de Sotos. Todo lo que pide pasa por el puente del
   SDK (postMessage), que comprueba los permisos de su manifiesto.

   GET    /api/apps                    catálogo de apps instaladas en el servidor
   POST   /api/apps                    (admin) instalar o actualizar desde un .zip (cuerpo)
   DELETE /api/apps/<id>               (admin) quitar del servidor
   GET/PUT/DELETE /api/apps/<id>/storage[/<clave>]   datos propios de la app por persona
   GET    /ext-apps/<id>/<ruta>        archivos de la app
   GET    /sdk/sotos-sdk.js            el SDK para las apps
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { db, now, DATA_DIR } from "./db.mjs";
import { fail, json, readJson, rateLimit } from "./http.mjs";
import { addNotification } from "./social.mjs";
import { requireUser } from "./auth.mjs";
import { notify } from "./fs.mjs";

export const APPS_DIR = path.join(DATA_DIR, "apps");
const SDK_FILE = fileURLToPath(new URL("../sdk/sotos-sdk.js", import.meta.url));
import { ID, PERMISSIONS, validateManifest } from "../sdk/manifest.mjs";
import { APPS_CASA } from "../web/src/os/apps-casa.js";
export { PERMISSIONS, validateManifest };
const MAX_ZIP = 60 * 1024 * 1024, MAX_FILES = 3000, MAX_STORAGE = 8 * 1024 * 1024;
db.exec(`CREATE TABLE IF NOT EXISTS app_storage (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, app_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, app_id, key));`);

// apps de la casa que corren con el SDK (web/public/apps): sus permisos vienen del catálogo, no de un .zip
const appById = (id) => listApps().find(a => a.id === id) || (() => { const c = APPS_CASA.find(a => a.id === id && a.sdk !== false); return c && { id: c.id, name: c.name, permissions: c.permissions || [], hosts: c.hosts || [] }; })();

/* ---------- permiso «net»: Sotos hace la petición por la app ----------
   Solo HTTPS, solo a los sitios que la app declaró en «hosts», nunca a direcciones privadas
   (la red de la casa, el propio servidor), con tiempo y tamaño máximos. Así una app puede usar
   APIs públicas sin pelear con CORS y sin poder tocar nada de la red interna. */
const NET_MAX = 6 * 1024 * 1024, netCache = new Map();
const hostAllowed = (host, list) => list.some(h => h.startsWith("*.") ? host === h.slice(2) || host.endsWith(h.slice(1)) : host === h);
const privateIp = (ip) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/.test(ip) || /^(::1?$|f[cd][0-9a-f]{2}:|fe80:|::ffff:(10|127|192\.168|169\.254)\.)/i.test(ip);
async function netFetch(app, b) {
  let url; try { url = new URL(String(b.url || "")); } catch { fail(400, "Dirección no válida"); }
  if (url.protocol !== "https:") fail(400, "Solo se permiten direcciones https://");
  if (url.username || url.password || (url.port && url.port !== "443")) fail(400, "Dirección no permitida");
  if (!hostAllowed(url.hostname.toLowerCase(), app.hosts || [])) fail(403, `La app no declaró «${url.hostname}» en sus sitios permitidos`);
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => fail(502, "No se encontró el sitio"));
  if (!addrs.length || addrs.some(a => privateIp(a.address))) fail(403, "Ese sitio apunta a una dirección privada");
  const method = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(String(b.method || "GET").toUpperCase()) ? String(b.method || "GET").toUpperCase() : "GET";
  const headers = {}; for (const [k, v] of Object.entries(b.headers || {})) if (/^[a-z0-9-]{1,40}$/i.test(k) && !/^(host|cookie|connection|content-length|transfer-encoding)$/i.test(k)) headers[k] = String(v).slice(0, 2000);
  headers["user-agent"] = headers["user-agent"] || "Sotos-App/1 (+https://github.com/Softsoto/SotosWeb)";
  const key = method === "GET" ? url.href + JSON.stringify(headers) : null, hit = key && netCache.get(key);
  if (hit && !b.fresh && Date.now() - hit.at < 60_000) return hit.data; // la misma consulta en el último minuto (fresh: true la salta, para datos en vivo)
  let r; try { r = await fetch(url, { method, headers, body: method === "GET" ? undefined : typeof b.body === "string" ? b.body.slice(0, 1_000_000) : b.body ? JSON.stringify(b.body) : undefined, redirect: "manual", signal: AbortSignal.timeout(15_000) }); }
  catch (e) { fail(502, "No se pudo conectar: " + (e.cause?.code || e.message)); }
  if (r.status >= 300 && r.status < 400) { const loc = r.headers.get("location"); fail(502, "El sitio redirige a otra dirección" + (loc ? ` (${new URL(loc, url).hostname})` : "")); }
  const chunks = []; let n = 0; for await (const c of r.body || []) { n += c.length; if (n > NET_MAX) fail(413, "La respuesta pesa más de 6 MB"); chunks.push(c); }
  const buf = Buffer.concat(chunks), type = r.headers.get("content-type") || "application/octet-stream", textual = /json|text|xml|javascript|csv/i.test(type);
  const data = { status: r.status, ok: r.ok, type, ...(textual ? { text: buf.toString("utf8") } : { base64: buf.toString("base64") }) };
  if (key && r.ok) { netCache.set(key, { at: Date.now(), data }); if (netCache.size > 300) netCache.delete(netCache.keys().next().value); }
  return data;
}
export function listApps() {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs.readdirSync(APPS_DIR).filter(d => ID.test(d)).map(d => { try { return { ...validateManifest(JSON.parse(fs.readFileSync(path.join(APPS_DIR, d, "sotos-app.json"), "utf8"))), installed: fs.statSync(path.join(APPS_DIR, d, "sotos-app.json")).mtimeMs, bytes: dirBytes(path.join(APPS_DIR, d)) }; } catch { return null; } }).filter(Boolean);
}
// tamaño en disco de una app (para «Programas y características»)
const dirBytes = (dir) => { let n = 0; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); n += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size; } return n; };

/* ---------------- .zip (lector propio: almacenado o deflate) ---------------- */
export function readZip(buf) {
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Object.assign(new Error("No es un archivo .zip válido"), { status: 400 });
  const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16); if (count > MAX_FILES) throw Object.assign(new Error("Demasiados archivos en el .zip"), { status: 400 });
  const out = []; let p = cdOff, total = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw Object.assign(new Error(".zip dañado"), { status: 400 });
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8").replace(/\\/g, "/"); p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    total += usize; if (total > MAX_ZIP * 3) throw Object.assign(new Error("El contenido del .zip es demasiado grande"), { status: 400 });
    const lnl = buf.readUInt16LE(loff + 26), lxl = buf.readUInt16LE(loff + 28), data = buf.subarray(loff + 30 + lnl + lxl, loff + 30 + lnl + lxl + csize);
    const body = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: usize + 1024 }) : (() => { throw Object.assign(new Error(`Compresión no soportada en ${name}`), { status: 400 }); })();
    out.push({ name, data: body });
  }
  return out;
}
export function installZip(buf) {
  if (buf.length > MAX_ZIP) throw Object.assign(new Error("El .zip pesa más de 60 MB"), { status: 413 });
  let files = readZip(buf);
  // la app puede venir dentro de una carpeta: se toma la que tenga sotos-app.json
  const man = files.find(f => /(^|\/)sotos-app\.json$/.test(f.name) && f.name.split("/").length <= 2); if (!man) throw Object.assign(new Error("Falta sotos-app.json en el .zip"), { status: 400 });
  const base = man.name.slice(0, man.name.length - "sotos-app.json".length);
  let m; try { m = validateManifest(JSON.parse(man.data.toString("utf8"))); } catch (e) { throw e.status ? e : Object.assign(new Error("sotos-app.json no es JSON válido"), { status: 400 }); }
  files = files.filter(f => f.name.startsWith(base)).map(f => ({ ...f, rel: f.name.slice(base.length) }));
  if (!files.some(f => f.rel === m.entry)) throw Object.assign(new Error(`No está el archivo de entrada «${m.entry}»`), { status: 400 });
  const tmp = path.join(APPS_DIR, `.${m.id}-${Date.now()}`), dest = path.join(APPS_DIR, m.id);
  for (const f of files) { const to = path.resolve(tmp, f.rel); if (!to.startsWith(path.resolve(tmp) + path.sep) || /(^|\/)\.\.(\/|$)/.test(f.rel)) throw Object.assign(new Error("Ruta no válida en el .zip: " + f.rel), { status: 400 }); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, f.data); }
  const prev = fs.existsSync(dest) ? (() => { try { return JSON.parse(fs.readFileSync(path.join(dest, "sotos-app.json"), "utf8")).version; } catch { return null; } })() : null;
  fs.rmSync(dest, { recursive: true, force: true }); fs.renameSync(tmp, dest);
  return { app: m, updatedFrom: prev };
}

/* ---------------- API ---------------- */
// lee el cuerpo; si se pasa del máximo sigue leyendo (sin guardar) para poder responder 413 en vez de cortar la conexión
const readRaw = (req, max, msg = "El .zip pesa más de 60 MB") => new Promise((ok, bad) => { const c = []; let n = 0; req.on("data", d => { n += d.length; if (n <= max) c.push(d); }); req.on("end", () => n > max ? bad(Object.assign(new Error(msg), { status: 413 })) : ok(Buffer.concat(c))); req.on("error", bad); });
export async function handleApps(req, res, parts) {
  const u = requireUser(req); const [id, kind, key] = parts;
  if (!id && req.method === "GET") return json(res, 200, { items: listApps(), permissions: PERMISSIONS });
  if (!id && req.method === "POST") {
    if (u.role !== "admin") fail(403, "Solo el administrador instala apps en el servidor");
    try { const r = installZip(await readRaw(req, MAX_ZIP)); for (const x of db.prepare("SELECT id FROM users").all()) notify(x.id, "store", {}); return json(res, 201, r); } catch (e) { fail(e.status || 400, e.message); }
  }
  if (!ID.test(id || "")) fail(404, "App no encontrada");
  if (!kind && req.method === "DELETE") {
    if (u.role !== "admin") fail(403, "Solo el administrador");
    fs.rmSync(path.join(APPS_DIR, id), { recursive: true, force: true });
    db.prepare("DELETE FROM app_installs WHERE app_id = ?").run(id); db.prepare("DELETE FROM app_storage WHERE app_id = ?").run(id);
    for (const x of db.prepare("SELECT id FROM users").all()) notify(x.id, "store", {}); return json(res, 200, { ok: true });
  }
  if (kind === "notify" && req.method === "POST") { // aviso en la campana (permiso «notify»)
    const app = appById(id); if (!app) fail(404, "App no encontrada"); if (!app.permissions.includes("notify")) fail(403, "La app no pidió el permiso «notify»");
    if (!db.prepare("SELECT 1 FROM app_installs WHERE user_id = ? AND app_id = ?").get(u.id, id)) fail(403, "La app no está instalada en tu cuenta");
    rateLimit("app-notify:" + u.id + ":" + id, 30, 3600_000);
    const b = await readJson(req, 8192); const title = String(b.title || "").trim().slice(0, 120); if (!title) fail(400, "Falta el título");
    addNotification(u.id, { kind: "app", title: `${app.name}: ${title}`, body: String(b.body || "").slice(0, 400) || null, link: { app: id } }); return json(res, 200, { ok: true });
  }
  if (kind === "fetch" && req.method === "POST") { // permiso «net»
    const app = appById(id); if (!app) fail(404, "App no encontrada"); if (!app.permissions.includes("net")) fail(403, "La app no pidió el permiso «net»");
    if (!db.prepare("SELECT 1 FROM app_installs WHERE user_id = ? AND app_id = ?").get(u.id, id)) fail(403, "La app no está instalada en tu cuenta");
    rateLimit("app-net:" + u.id + ":" + id, 300, 600_000);
    return json(res, 200, await netFetch(app, await readJson(req, 1_100_000)));
  }
  if (kind === "storage") { // datos propios de la app, por persona (lo pide el puente del SDK)
    const app = appById(id); if (!app) fail(404, "App no encontrada"); if (!app.permissions.includes("storage")) fail(403, "La app no pidió el permiso «storage»");
    const k = key ? decodeURIComponent(key) : null; if (k !== null && !/^[\w.\-:/ ]{1,120}$/.test(k)) fail(400, "Clave no válida");
    if (req.method === "GET") { if (k === null) return json(res, 200, { keys: db.prepare("SELECT key FROM app_storage WHERE user_id = ? AND app_id = ? ORDER BY key").all(u.id, id).map(r => r.key) });
      const r = db.prepare("SELECT value FROM app_storage WHERE user_id = ? AND app_id = ? AND key = ?").get(u.id, id, k); return json(res, 200, { value: r ? JSON.parse(r.value) : null }); }
    if (req.method === "PUT" && k !== null) {
      let raw; try { raw = (await readRaw(req, MAX_STORAGE + 1024, "La app llegó a su límite de 8 MB de datos")).toString("utf8"); } catch (e) { fail(413, e.message); } let v; try { v = JSON.parse(raw).value; } catch { fail(400, "Valor no válido"); }
      const s = JSON.stringify(v ?? null); const used = db.prepare("SELECT COALESCE(SUM(LENGTH(value)),0) n FROM app_storage WHERE user_id = ? AND app_id = ? AND key <> ?").get(u.id, id, k).n;
      if (used + s.length > MAX_STORAGE) fail(413, "La app llegó a su límite de 8 MB de datos");
      db.prepare("INSERT INTO app_storage(user_id,app_id,key,value,updated) VALUES(?,?,?,?,?) ON CONFLICT(user_id,app_id,key) DO UPDATE SET value = excluded.value, updated = excluded.updated").run(u.id, id, k, s, now());
      return json(res, 200, { ok: true });
    }
    if (req.method === "DELETE" && k !== null) { db.prepare("DELETE FROM app_storage WHERE user_id = ? AND app_id = ? AND key = ?").run(u.id, id, k); return json(res, 200, { ok: true }); }
  }
  fail(404, "No encontrado");
}

/* ---------------- archivos de la app y el SDK ---------------- */
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", wasm: "application/wasm", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", txt: "text/plain; charset=utf-8", map: "application/json" };
// origen opaco aunque alguien abra la app directamente en una pestaña
const SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock";
export function serveExtApp(req, res) {
  const u = new URL(req.url, "http://x"); const parts = u.pathname.replace(/^\/ext-apps\//, "").split("/").map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  const [id, ...rest] = parts; if (!ID.test(id || "")) { res.writeHead(404); return res.end(); }
  const root = path.resolve(APPS_DIR, id), file = path.resolve(root, rest.join("/") || "index.html");
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const ext = path.extname(file).slice(1).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "content-length": fs.statSync(file).size, "access-control-allow-origin": "*", "cache-control": "no-cache",
    "x-content-type-options": "nosniff", "content-security-policy": `${SANDBOX}; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src * data: blob:`, "referrer-policy": "no-referrer" });
  fs.createReadStream(file).pipe(res);
}
export function serveSdk(req, res) {
  if (!fs.existsSync(SDK_FILE)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-cache", "x-content-type-options": "nosniff" });
  fs.createReadStream(SDK_FILE).pipe(res);
}
