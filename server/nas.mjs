/* ============================================================
   Sotos — Carpetas del NAS
   Las carpetas compartidas del NAS se montan en el contenedor bajo SOTOS_NAS_DIR (por defecto /nas),
   una subcarpeta por cada una (/nas/Música, /nas/Fotos…). Sotos las muestra tal cual están en el
   disco: no se copian ni se indexan.
   Quién: SOTOS_NAS_USERS=admin (por defecto) o "todos". Escribir: solo administradores, y solo si
   SOTOS_NAS_WRITE no es "0". Borrar mueve a la papelera de la carpeta compartida (#recycle de
   Synology); si la carpeta no tiene papelera, no se borra.
   GET  /api/nas                        estado y carpetas
   GET  /api/nas/list?p=/Música/Rock    contenido
   GET  /api/nas/file?p=…[&dl=1]        ver o descargar (con Range: video y música avanzan)
   POST /api/nas/import  { p }          copiar a mis archivos (carpeta «Del NAS»)
   POST /api/nas/export  { nodeId, p }  guardar un archivo mío en una carpeta del NAS
   PUT  /api/nas/upload?p=…&name=…      subir (cuerpo = el archivo)
   POST /api/nas/mkdir   { p, name }    nueva carpeta
   POST /api/nas/rename  { p, name }    renombrar
   POST /api/nas/delete  { p }          a la papelera
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { DATA_DIR } from "./db.mjs";
import { fail, json, readJson, rateLimit } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { loadState, blobPath, applyOps, userNode } from "./fs.mjs";
import { guardLocked } from "./candados.mjs";
import { typeOf, newId, quotaOf, MAX_FILE } from "./dav.mjs";

const BASE = path.resolve(process.env.SOTOS_NAS_DIR || "/nas");
const WRITE = process.env.SOTOS_NAS_WRITE !== "0";
const EVERYONE = (process.env.SOTOS_NAS_USERS || "admin").toLowerCase() === "todos";
// carpetas internas de Synology y del sistema que nunca se muestran ni se tocan
const HIDDEN = /^(@eaDir|@tmp|#recycle|#snapshot|\.SynologyWorkingDirectory|\.DS_Store|Thumbs\.db|desktop\.ini)$/i;
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", heic: "image/heic",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav",
  pdf: "application/pdf", txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", csv: "text/plain; charset=utf-8", log: "text/plain; charset=utf-8", json: "text/plain; charset=utf-8" };

/** carpetas compartidas montadas (una subcarpeta de BASE por cada una) */
export function nasRoots() {
  try { return fs.readdirSync(BASE, { withFileTypes: true }).filter(e => (e.isDirectory() || e.isSymbolicLink()) && !HIDDEN.test(e.name) && !e.name.startsWith(".")).map(e => e.name).sort((a, b) => a.localeCompare(b, "es")); }
  catch { return []; }
}
export const nasEnabled = () => nasRoots().length > 0;

const canSee = (u) => EVERYONE || u.role === "admin";
const canWrite = (u) => WRITE && u.role === "admin";
function who(req, write) {
  const u = requireUser(req);
  if (!canSee(u)) fail(403, "Las carpetas del NAS solo las ve el administrador");
  if (write && !canWrite(u)) fail(403, WRITE ? "Solo el administrador puede cambiar las carpetas del NAS" : "Las carpetas del NAS están en solo lectura");
  return u;
}
function cleanName(n) {
  const s = String(n ?? "").normalize("NFC").trim();
  if (!s || s === "." || s === ".." || s.length > 255 || /[\\/\x00-\x1f]/.test(s) || HIDDEN.test(s)) fail(400, "Ese nombre no es válido");
  return s;
}
/** ruta pública ("/Música/Rock") → ruta real, sin salir nunca de la carpeta compartida */
function resolve(p, { mustExist = true } = {}) {
  const segs = String(p || "").split("/").filter(Boolean).map(s => s.normalize("NFC"));
  if (!segs.length) fail(400, "Elige una carpeta del NAS");
  if (segs.some(s => s === "." || s === ".." || HIDDEN.test(s) || /[\\\x00-\x1f]/.test(s))) fail(400, "Ruta no válida");
  if (!nasRoots().includes(segs[0])) fail(404, "Esa carpeta del NAS no existe");
  const rootReal = fs.realpathSync(path.join(BASE, segs[0]));
  const abs = path.join(BASE, ...segs);
  let real = abs;
  try { real = fs.realpathSync(abs); } catch { if (mustExist) fail(404, "No existe en el NAS"); real = path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs)); }
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) fail(403, "Ruta fuera de la carpeta compartida");
  return { abs: real, rootReal, segs, pub: "/" + segs.join("/") };
}
const errMsg = (e) => e.code === "EACCES" || e.code === "EPERM" ? "Sotos no tiene permiso en esa carpeta del NAS" : e.code === "ENOSPC" ? "El disco del NAS está lleno" : e.code === "EEXIST" ? "Ya existe algo con ese nombre" : null;
function guard(fn) { try { return fn(); } catch (e) { const m = errMsg(e); if (m) fail(e.code === "EEXIST" ? 409 : 403, m); throw e; } }
async function guardAsync(p) { try { return await p; } catch (e) { const m = errMsg(e); if (m) fail(e.code === "EEXIST" ? 409 : 403, m); throw e; } }
function freeName(dir, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  let n = name; for (let i = 2; fs.existsSync(path.join(dir, n)); i++) n = `${base} (${i})${ext}`;
  return n;
}
const disposition = (kind, name) => `${kind}; filename="${name.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

function sendFile(req, res, abs, name, download) {
  const st = guard(() => fs.statSync(abs));
  if (!st.isFile()) fail(400, "No es un archivo");
  const ext = path.extname(name).slice(1).toLowerCase();
  const type = download ? "application/octet-stream" : (MIME[ext] || "application/octet-stream");
  const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=300", "last-modified": st.mtime.toUTCString(),
    "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    "content-disposition": disposition(download || !MIME[ext] ? "attachment" : "inline", name) };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { "content-range": `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(abs, { start, end }).on("error", () => res.destroy()).pipe(res);
  }
  res.writeHead(200, { ...headers, "content-length": st.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(abs).on("error", () => res.destroy()).pipe(res);
}

/* miniaturas: primero las que Synology ya generó (@eaDir), si no una propia con ffmpeg, en caché.
   Sin esto cada icono descargaba la foto entera y las 6 conexiones del navegador se quedaban
   ocupadas: la carpeta siguiente no cargaba hasta que bajaran todas. */
const THUMB_DIR = path.join(DATA_DIR, "nas-miniaturas");
const SYNO_THUMBS = ["SYNOPHOTO_THUMB_M.jpg", "SYNOFILE_THUMB_M.jpg", "SYNOPHOTO_THUMB_SM.jpg", "SYNOPHOTO_THUMB_S.jpg", "SYNOFILE_THUMB_S.jpg"];
const THUMB_TYPES = new Set(["img", "video"]);
let running = 0; const waiting = [];
const slot = () => running < 2 ? (running++, Promise.resolve()) : new Promise(ok => waiting.push(ok));
const release = () => { const next = waiting.shift(); if (next) next(); else running--; };
const making = new Map(); // misma miniatura pedida dos veces a la vez: un solo ffmpeg
async function makeThumb(abs, st, type) {
  const key = crypto.createHash("sha1").update(`${abs}|${st.size}|${st.mtimeMs}`).digest("hex");
  const out = path.join(THUMB_DIR, key.slice(0, 2), key + ".jpg");
  if (fs.existsSync(out)) return out;
  if (making.has(out)) return making.get(out);
  const job = (async () => {
    await slot();
    try {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const tmp = out + ".tmp.jpg";
      const args = ["-y", "-loglevel", "error", ...(type === "video" ? ["-ss", "3"] : []), "-i", abs, "-frames:v", "1", "-vf", "scale=320:320:force_original_aspect_ratio=decrease", "-q:v", "6", tmp];
      let ok = await new Promise(r => execFile(process.env.FFMPEG_PATH || "ffmpeg", args, { timeout: 20_000, windowsHide: true }, e => r(!e && fs.existsSync(tmp))));
      if (!ok && type === "video") ok = await new Promise(r => execFile(process.env.FFMPEG_PATH || "ffmpeg", args.filter((a, i) => !(a === "-ss" || args[i - 1] === "-ss")), { timeout: 20_000, windowsHide: true }, e => r(!e && fs.existsSync(tmp)))); // videos de menos de 3 s
      if (!ok) { fs.rmSync(tmp, { force: true }); return null; }
      fs.renameSync(tmp, out); return out;
    } finally { release(); }
  })().finally(() => making.delete(out));
  making.set(out, job); return job;
}

export async function handleNas(req, res, parts) {
  const [a] = parts;
  const q = new URL(req.url, "http://x").searchParams;

  if (!a && req.method === "GET") {
    const u = requireUser(req);
    if (!canSee(u)) return json(res, 200, { enabled: false, reason: "Solo el administrador ve las carpetas del NAS" });
    const roots = nasRoots();
    return json(res, 200, { enabled: roots.length > 0, writable: canWrite(u), roots });
  }

  if (a === "list" && req.method === "GET") {
    who(req);
    const { abs, pub } = resolve(q.get("p"));
    const entries = [];
    for (const e of guard(() => fs.readdirSync(abs, { withFileTypes: true }))) {
      if (HIDDEN.test(e.name) || e.name.startsWith(".")) continue;
      let st; try { st = fs.statSync(path.join(abs, e.name)); } catch { continue; } // enlaces rotos o sin permiso
      const dir = st.isDirectory();
      entries.push({ name: e.name, dir, size: dir ? 0 : st.size, mtime: st.mtimeMs, type: dir ? "folder" : typeOf(e.name) });
      if (entries.length >= 5000) break;
    }
    entries.sort((x, y) => (y.dir - x.dir) || x.name.localeCompare(y.name, "es", { numeric: true }));
    return json(res, 200, { path: pub, entries, truncated: entries.length >= 5000 });
  }

  if (a === "file" && (req.method === "GET" || req.method === "HEAD")) {
    who(req);
    const { abs, segs } = resolve(q.get("p"));
    return sendFile(req, res, abs, segs[segs.length - 1], q.get("dl") === "1");
  }

  if (a === "thumb" && req.method === "GET") {
    who(req);
    const { abs, segs } = resolve(q.get("p"));
    const name = segs[segs.length - 1], type = typeOf(name);
    if (!THUMB_TYPES.has(type)) fail(404, "Sin miniatura");
    const st = guard(() => fs.statSync(abs)); if (!st.isFile()) fail(404, "Sin miniatura");
    const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
    const headers = { "content-type": "image/jpeg", "cache-control": "private, max-age=604800", etag, "x-content-type-options": "nosniff" };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
    let file = null;
    const ea = path.join(path.dirname(abs), "@eaDir", name);
    for (const t of SYNO_THUMBS) { const f = path.join(ea, t); if (fs.existsSync(f)) { file = f; break; } }
    if (!file) file = await makeThumb(abs, st, type);
    if (!file) fail(404, "Sin miniatura");
    res.writeHead(200, headers);
    return fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  }

  if (a === "import" && req.method === "POST") { // NAS → mis archivos
    const u = who(req);
    rateLimit("nas-import:" + u.id, 200, 3600_000);
    const body = await readJson(req, 8192);
    const { abs, segs } = resolve(body.p);
    const st = guard(() => fs.statSync(abs));
    if (!st.isFile()) fail(400, "Por ahora se copian archivos, no carpetas enteras");
    if (st.size > MAX_FILE) fail(413, "El archivo supera el tamaño máximo del servidor");
    const { quota, used } = quotaOf(u.id);
    if (quota && used + st.size > quota) fail(507, "No queda espacio en tu cuenta para este archivo");
    const id = newId(), dest = blobPath(u.id, id);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try { await guardAsync(fs.promises.copyFile(abs, dest + ".part")); fs.renameSync(dest + ".part", dest); }
    catch (e) { fs.rmSync(dest + ".part", { force: true }); throw e; }
    const root = loadState(u.id).state.root, ops = [], t = Date.now();
    let dir = (root.children || []).find(c => c.children && c.name === "Del NAS");
    if (dir) guardLocked(u.id, dir.id, req);
    if (!dir) { dir = { id: newId(), name: "Del NAS", type: "folder", children: [], ctime: t, mtime: t }; ops.push({ t: "create", parent: root.id, node: dir }); }
    const taken = new Set((dir.children || []).map(c => c.name.toLowerCase())), orig = segs[segs.length - 1];
    const ext = path.extname(orig), base = orig.slice(0, orig.length - ext.length);
    let name = orig; for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
    ops.push({ t: "create", parent: dir.id, node: { id, name, type: typeOf(name), size: st.size, ctime: t, mtime: t } });
    applyOps(u.id, ops, "nas");
    return json(res, 200, { nodeId: id, folder: "Del NAS", name });
  }

  if (a === "export" && req.method === "POST") { // mis archivos → NAS
    const u = who(req, true);
    const body = await readJson(req, 8192);
    const n = userNode(u.id, String(body.nodeId || ""));
    if (!n || n.children || n.type === "folder") fail(404, "Elige un archivo de tus archivos");
    guardLocked(u.id, n.id, req);
    const src = blobPath(u.id, n.id);
    if (!fs.existsSync(src)) fail(409, "Ese archivo no tiene contenido en el servidor (puede que aún se esté subiendo)");
    const { abs } = resolve(body.p);
    if (!guard(() => fs.statSync(abs)).isDirectory()) fail(400, "Elige una carpeta del NAS");
    const name = freeName(abs, cleanName(n.name));
    await guardAsync(fs.promises.copyFile(src, path.join(abs, name), fs.constants.COPYFILE_EXCL));
    return json(res, 200, { name });
  }

  if (a === "upload" && req.method === "PUT") {
    who(req, true);
    const { abs } = resolve(q.get("p"));
    if (!guard(() => fs.statSync(abs)).isDirectory()) fail(400, "Elige una carpeta del NAS");
    const len = Number(req.headers["content-length"] || 0);
    if (len > MAX_FILE) fail(413, "El archivo supera el tamaño máximo del servidor");
    const name = freeName(abs, cleanName(q.get("name"))), tmp = path.join(abs, `.${name}.sotos-part`);
    try {
      let got = 0;
      req.on("data", c => { got += c.length; if (got > MAX_FILE) req.destroy(new Error("demasiado grande")); });
      await pipeline(req, fs.createWriteStream(tmp, { flags: "wx" }));
      fs.renameSync(tmp, path.join(abs, name));
    } catch (e) { fs.rmSync(tmp, { force: true }); const m = errMsg(e); if (m) fail(403, m); throw e; }
    return json(res, 200, { name });
  }

  if (a === "mkdir" && req.method === "POST") {
    who(req, true);
    const body = await readJson(req, 4096);
    const { abs } = resolve(body.p), name = cleanName(body.name);
    guard(() => fs.mkdirSync(path.join(abs, name)));
    return json(res, 200, { name });
  }

  if (a === "rename" && req.method === "POST") {
    who(req, true);
    const body = await readJson(req, 4096);
    const r = resolve(body.p);
    if (r.segs.length < 2) fail(400, "Las carpetas compartidas se renombran en DSM, no desde Sotos");
    const name = cleanName(body.name), to = path.join(path.dirname(r.abs), name);
    if (fs.existsSync(to)) fail(409, "Ya existe algo con ese nombre");
    guard(() => fs.renameSync(r.abs, to));
    return json(res, 200, { name });
  }

  if (a === "delete" && req.method === "POST") {
    who(req, true);
    const body = await readJson(req, 4096);
    const r = resolve(body.p);
    if (r.segs.length < 2) fail(400, "Las carpetas compartidas no se borran desde Sotos");
    const bin = path.join(r.rootReal, "#recycle");
    if (!fs.existsSync(bin)) fail(409, "Esta carpeta compartida no tiene papelera. Actívala en DSM (Panel de control, Carpeta compartida, Editar, «Habilitar Papelera de reciclaje») para poder borrar desde Sotos.");
    const destDir = path.join(bin, ...r.segs.slice(1, -1));
    guard(() => fs.mkdirSync(destDir, { recursive: true }));
    const dest = path.join(destDir, freeName(destDir, r.segs[r.segs.length - 1]));
    guard(() => fs.renameSync(r.abs, dest));
    return json(res, 200, { ok: true, recycled: true });
  }

  fail(404, "No encontrado");
}
