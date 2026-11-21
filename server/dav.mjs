/* ============================================================
   Sotos — WebDAV: tus archivos de la nube como una unidad del computador o del celular
   Dirección: http(s)://<servidor>/dav/   ·   usuario: tu correo   ·   clave: una contraseña de aplicación
   (Ajustes → Cuenta → Conectar como unidad). La contraseña principal nunca se usa aquí: cada
   dispositivo tiene la suya, se puede revocar y funciona aunque tengas la verificación en dos pasos.
   Lo que se borra desde la unidad va a la Papelera de Sotos, como desde la web.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { db, now, rid } from "./db.mjs";
import { rateLimit, clientIp, json, readJson, fail } from "./http.mjs";
import { requireUser, verifyPassword } from "./auth.mjs";
import { loadState, applyOps, blobPath, snapshotVersion } from "./fs.mjs";
import { index, ROOT, DESKTOP, folderSize } from "../web/src/os/tree-ops.js";

db.exec(`CREATE TABLE IF NOT EXISTS app_passwords (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL, last_used INTEGER);
CREATE INDEX IF NOT EXISTS app_passwords_user ON app_passwords(user_id);`);
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const MAX_FILE = Number(process.env.SOTOS_MAX_FILE_MB || 512) * 1024 * 1024;

/* ---------------- contraseñas de aplicación ---------------- */
export function createAppPassword(uid, name) {
  if (db.prepare("SELECT COUNT(*) n FROM app_passwords WHERE user_id = ?").get(uid).n >= 20) throw Object.assign(new Error("Máximo 20 dispositivos"), { status: 400 });
  const raw = crypto.randomBytes(15).toString("base64url").replace(/[-_]/g, "x").slice(0, 20).toLowerCase(); const pw = raw.match(/.{1,5}/g).join("-");
  const id = rid(10); db.prepare("INSERT INTO app_passwords(id,user_id,name,hash,created) VALUES(?,?,?,?,?)").run(id, uid, String(name || "Dispositivo").slice(0, 60), sha(raw), now());
  return { id, password: pw };
}
export const listAppPasswords = (uid) => db.prepare("SELECT id, name, created, last_used FROM app_passwords WHERE user_id = ? ORDER BY created DESC").all(uid);
export const revokeAppPassword = (uid, id) => db.prepare("DELETE FROM app_passwords WHERE id = ? AND user_id = ?").run(String(id), uid);

/** API de la web: listar, crear (pide la contraseña de la cuenta) y revocar */
export async function handleDavKeys(req, res, parts) {
  const u = requireUser(req);
  if (req.method === "GET") return json(res, 200, { items: listAppPasswords(u.id), path: "/dav/" });
  if (req.method === "POST") {
    const { name, password } = await readJson(req, 4096); rateLimit("pw:" + u.id, 8, 900_000);
    if (!(await verifyPassword(u.id, password))) fail(403, "Contraseña incorrecta");
    try { return json(res, 201, createAppPassword(u.id, name)); } catch (e) { fail(e.status || 400, e.message); }
  }
  if (req.method === "DELETE" && parts[0]) { revokeAppPassword(u.id, parts[0]); return json(res, 200, { ok: true }); }
  fail(404, "No encontrado");
}

export function davUser(req) {
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || ""); if (!m) return null;
  const [email, ...rest] = Buffer.from(m[1], "base64").toString("utf8").split(":"); const pw = rest.join(":").replace(/[\s-]/g, "").toLowerCase();
  const row = db.prepare("SELECT u.*, a.id app_id FROM app_passwords a JOIN users u ON u.id = a.user_id WHERE a.hash = ?").get(sha(pw));
  if (!row || row.email !== String(email).trim().toLowerCase() || row.disabled) return null;
  db.prepare("UPDATE app_passwords SET last_used = ? WHERE id = ?").run(now(), row.app_id);
  return row;
}

/* ---------------- utilidades ---------------- */
const EXT = { docx: "docx", doc: "docx", odt: "docx", rtf: "docx", xlsx: "xlsx", xls: "xlsx", ods: "xlsx", csv: "csv", pptx: "pptx", ppt: "pptx", odp: "pptx", pdf: "pdf",
  png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", bmp: "img", svg: "img", avif: "img", ico: "img", heic: "img",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", aac: "audio", opus: "audio",
  mp4: "video", webm: "video", mov: "video", mkv: "video", ogv: "video", m4v: "video", avi: "video",
  txt: "txt", log: "txt", ini: "txt", cfg: "txt", nfo: "txt", drawio: "drawio", excalidraw: "excalidraw",
  md: "code", html: "code", htm: "code", css: "code", js: "code", mjs: "code", jsx: "code", ts: "code", tsx: "code", json: "code", xml: "code", yml: "code", yaml: "code",
  py: "code", c: "code", h: "code", cpp: "code", cs: "code", java: "code", php: "code", sh: "code", ps1: "code", bat: "code", sql: "code", go: "code", rs: "code", rb: "code", lua: "code", toml: "code",
  zip: "zip", rar: "zip", "7z": "zip", tar: "zip", gz: "zip" };
const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", mp4: "video/mp4", mkv: "video/x-matroska", txt: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip" };
const extOf = (n) => (/\.([^.]+)$/.exec(n || "") || [])[1]?.toLowerCase() || "";
const typeOf = (n) => EXT[extOf(n)] || "file";
const newId = () => Date.now().toString(36) + crypto.randomBytes(5).toString("hex");
const xml = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const httpDate = (ms) => new Date(ms || Date.now()).toUTCString();
const BAD_NAME = /[\\/:*?"<>|\x00-\x1f]/;
// basura que los sistemas crean al explorar una unidad: no se guarda en la nube
const JUNK = /^(\._.*|\.DS_Store|Thumbs\.db|desktop\.ini|\.Spotlight-V100|\.Trashes|\.fseventsd|\.metadata_never_index.*|\.TemporaryItems)$/i;

function segs(p) {
  const rel = p.replace(/^\/dav\/?/, ""); if (!rel) return [];
  return rel.split("/").filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
}
/** nodo para una ruta (o el padre y el nombre que faltan) */
function resolve(state, parts) {
  let cur = state.root, parent = null;
  for (let i = 0; i < parts.length; i++) {
    if (!cur?.children) return { node: null, parent: null, name: parts[i] };
    parent = cur; cur = cur.children.find(c => c.name === parts[i]);
    if (!cur) return { node: null, parent: i === parts.length - 1 ? parent : null, name: parts[i] }; // solo falta el último: se puede crear
  }
  return { node: cur, parent, name: parts[parts.length - 1] };
}
const hrefOf = (parts, isDir) => "/dav/" + parts.map(encodeURIComponent).join("/") + (isDir && parts.length ? "/" : "");
const quotaOf = (uid) => { const r = db.prepare("SELECT u.quota, f.used FROM users u LEFT JOIN fs_state f ON f.user_id = u.id WHERE u.id = ?").get(uid); return { quota: r?.quota || 0, used: r?.used || 0 }; };

function propXml(n, parts, uid) {
  const dir = !!n.children; const q = parts.length === 0 ? quotaOf(uid) : null;
  return `<d:response><d:href>${xml(hrefOf(parts, dir))}</d:href><d:propstat><d:prop>
<d:displayname>${xml(parts.length ? n.name : "Sotos")}</d:displayname>
<d:resourcetype>${dir ? "<d:collection/>" : ""}</d:resourcetype>
${dir ? "" : `<d:getcontentlength>${n.size || 0}</d:getcontentlength><d:getcontenttype>${xml(MIME[extOf(n.name)] || "application/octet-stream")}</d:getcontenttype>`}
<d:getlastmodified>${httpDate(n.mtime)}</d:getlastmodified><d:creationdate>${new Date(n.ctime || n.mtime || Date.now()).toISOString()}</d:creationdate>
<d:getetag>"${n.id}-${(n.mtime || 0).toString(36)}-${(n.size || 0).toString(36)}"</d:getetag>
${q ? `<d:quota-used-bytes>${q.used}</d:quota-used-bytes><d:quota-available-bytes>${Math.max(0, q.quota - q.used)}</d:quota-available-bytes>` : ""}
<d:supportedlock><d:lockentry><d:lockscope><d:exclusive/></d:lockscope><d:locktype><d:write/></d:locktype></d:lockentry></d:supportedlock>
</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
}
const send = (res, status, body = "", headers = {}) => { res.writeHead(status, { "content-length": Buffer.byteLength(body), ...headers }); res.end(body); };
const multistatus = (res, inner) => send(res, 207, `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">${inner}</d:multistatus>`, { "content-type": "application/xml; charset=utf-8" });
const drain = (req) => new Promise(r => { req.resume(); req.on("end", r); req.on("error", r); });

function cloneWithIds(n, blobs) {
  const id = newId(); if (n.children) return { ...n, id, children: n.children.map(c => cloneWithIds(c, blobs)) };
  blobs.push({ from: n.id, to: id }); return { ...n, id };
}

/* ---------------- servidor WebDAV ---------------- */
export async function handleDav(req, res) {
  const base = { DAV: "1, 2", "MS-Author-Via": "DAV", "x-content-type-options": "nosniff" };
  if (req.method === "OPTIONS") return send(res, 200, "", { ...base, Allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK" });
  rateLimit("dav:" + clientIp(req), 3000, 60_000);
  const u = davUser(req);
  if (!u) { rateLimit("dav-fail:" + clientIp(req), 30, 900_000); await drain(req); return send(res, 401, "Usa tu correo y una contraseña de aplicación de Sotos", { ...base, "WWW-Authenticate": 'Basic realm="Sotos", charset="UTF-8"' }); }
  const url = new URL(req.url, "http://x"); const parts = segs(url.pathname);
  const { state } = loadState(u.id); const at = resolve(state, parts);

  switch (req.method) {
    case "PROPFIND": {
      await drain(req);
      if (!at.node) return send(res, 404, "", base);
      const depth = String(req.headers.depth ?? "1");
      let out = propXml(at.node, parts, u.id);
      if (at.node.children && depth !== "0") for (const c of at.node.children) out += propXml(c, [...parts, c.name], u.id);
      return multistatus(res, out);
    }
    case "PROPPATCH": { // fechas que el sistema intenta fijar: se aceptan sin guardar
      await drain(req);
      return multistatus(res, `<d:response><d:href>${xml(hrefOf(parts, !!at.node?.children))}</d:href><d:propstat><d:prop/><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`);
    }
    case "GET": case "HEAD": {
      if (!at.node) return send(res, 404, "", base);
      if (at.node.children) { // en el navegador, una lista sencilla
        const list = at.node.children.map(c => `<li><a href="${xml(hrefOf([...parts, c.name], !!c.children))}">${xml(c.name)}${c.children ? "/" : ""}</a></li>`).join("");
        return send(res, 200, req.method === "HEAD" ? "" : `<!doctype html><meta charset="utf-8"><title>Sotos</title><h1>${xml(parts.join("/") || "Sotos")}</h1><ul>${list}</ul>`, { ...base, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'" });
      }
      const p = blobPath(u.id, at.node.id); const size = fs.existsSync(p) ? fs.statSync(p).size : 0;
      const h = { ...base, "content-type": MIME[extOf(at.node.name)] || "application/octet-stream", "accept-ranges": "bytes", "last-modified": httpDate(at.node.mtime), etag: `"${at.node.id}-${(at.node.mtime || 0).toString(36)}-${size.toString(36)}"` };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (m && size) {
        let s = m[1] === "" ? size - Number(m[2]) : Number(m[1]), e = m[1] === "" || m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
        if (s >= size || s > e) return send(res, 416, "", { ...h, "content-range": `bytes */${size}` });
        res.writeHead(206, { ...h, "content-length": e - s + 1, "content-range": `bytes ${s}-${e}/${size}` });
        return req.method === "HEAD" ? res.end() : pipeline(fs.createReadStream(p, { start: s, end: e }), res).catch(() => res.destroy());
      }
      res.writeHead(200, { ...h, "content-length": size });
      return req.method === "HEAD" || !size ? res.end() : pipeline(fs.createReadStream(p), res).catch(() => res.destroy());
    }
    case "PUT": {
      if (!parts.length || at.node?.children) { await drain(req); return send(res, 405, "", base); }
      const name = parts[parts.length - 1];
      if (JUNK.test(name)) { await drain(req); return send(res, 201, "", base); }
      if (!at.node && !at.parent?.children) { await drain(req); return send(res, 409, "La carpeta no existe", base); }
      if (BAD_NAME.test(name) || name.length > 200) { await drain(req); return send(res, 400, "Nombre no válido", base); }
      const len = Number(req.headers["content-length"] || 0);
      const { quota, used } = quotaOf(u.id); const old = at.node ? at.node.size || 0 : 0;
      if (len > MAX_FILE) { await drain(req); return send(res, 413, "Archivo demasiado grande", base); }
      if (quota && used - old + len > quota) { await drain(req); return send(res, 507, "No queda espacio en tu cuenta", base); }
      const id = at.node ? at.node.id : newId(); const dest = blobPath(u.id, id); const tmp = dest + ".part"; let n = 0;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try { await pipeline(req, async function* (src) { for await (const ch of src) { n += ch.length; if (n > MAX_FILE || (quota && used - old + n > quota)) throw Object.assign(new Error("big"), { status: 507 }); yield ch; } }, fs.createWriteStream(tmp)); }
      catch (e) { fs.rmSync(tmp, { force: true }); return send(res, e.status || 500, "", base); }
      if (at.node) { try { snapshotVersion(u.id, id); } catch {} } // la versión anterior queda en el historial
      fs.renameSync(tmp, dest);
      const t = Date.now();
      applyOps(u.id, [at.node ? { t: "write", id, size: n, mtime: t } : { t: "create", parent: at.parent.id, node: { id, name, type: typeOf(name), size: n, ctime: t, mtime: t } }], "webdav");
      return send(res, at.node ? 204 : 201, "", base);
    }
    case "MKCOL": {
      await drain(req);
      if (at.node) return send(res, 405, "Ya existe", base);
      if (!at.parent?.children) return send(res, 409, "", base);
      const name = parts[parts.length - 1]; if (BAD_NAME.test(name)) return send(res, 400, "", base);
      const t = Date.now(); applyOps(u.id, [{ t: "create", parent: at.parent.id, node: { id: newId(), name, type: "folder", children: [], ctime: t, mtime: t } }], "webdav");
      return send(res, 201, "", base);
    }
    case "DELETE": {
      await drain(req);
      if (!at.node) return send(res, 404, "", base);
      if (at.node.id === ROOT || at.node.id === DESKTOP) return send(res, 403, "", base);
      applyOps(u.id, [{ t: "trash", ids: [at.node.id], at: Date.now() }], "webdav"); // a la Papelera, no se pierde
      return send(res, 204, "", base);
    }
    case "MOVE": case "COPY": {
      await drain(req);
      if (!at.node) return send(res, 404, "", base);
      let dparts; try { dparts = segs(new URL(String(req.headers.destination || ""), "http://x").pathname); } catch { return send(res, 400, "", base); }
      const dst = resolve(state, dparts); const overwrite = String(req.headers.overwrite || "T").toUpperCase() !== "F";
      if (!dst.parent?.children && !dst.node) return send(res, 409, "", base);
      if (dst.node && dst.node.id === at.node.id) return send(res, 204, "", base);
      if (at.node.id === ROOT || at.node.id === DESKTOP) return send(res, 403, "", base);
      const ops = []; const newName = dparts[dparts.length - 1];
      if (BAD_NAME.test(newName)) return send(res, 400, "", base);
      if (dst.node) { if (!overwrite) return send(res, 412, "", base); ops.push({ t: "trash", ids: [dst.node.id], at: Date.now() }); }
      const parentId = (dst.node ? resolve(state, dparts.slice(0, -1)).node : dst.parent).id;
      const t = Date.now();
      if (req.method === "MOVE") {
        const map = index(state.root); const curParent = map.get(at.node.id)?.parent?.id;
        if (curParent !== parentId) ops.push({ t: "move", ids: [at.node.id], dest: parentId, names: { [at.node.id]: newName } });
        if (curParent === parentId || newName !== at.node.name) ops.push({ t: "rename", id: at.node.id, name: newName, type: at.node.children ? undefined : typeOf(newName), mtime: t });
      } else {
        const { quota, used } = quotaOf(u.id); if (quota && used + folderSize(at.node) > quota) return send(res, 507, "", base);
        const blobs = []; const copy = cloneWithIds({ ...at.node, name: newName, mtime: t }, blobs);
        ops.push({ t: "copy", dest: parentId, items: [{ node: copy }], blobs });
      }
      applyOps(u.id, ops, "webdav");
      return send(res, dst.node ? 204 : 201, "", base);
    }
    case "LOCK": { // bloqueos simulados: Windows y macOS los piden antes de escribir
      await drain(req);
      const token = "opaquelocktoken:" + crypto.randomUUID();
      return send(res, 200, `<?xml version="1.0" encoding="utf-8"?>\n<d:prop xmlns:d="DAV:"><d:lockdiscovery><d:activelock><d:locktype><d:write/></d:locktype><d:lockscope><d:exclusive/></d:lockscope><d:depth>infinity</d:depth><d:owner>${xml(u.name)}</d:owner><d:timeout>Second-3600</d:timeout><d:locktoken><d:href>${token}</d:href></d:locktoken><d:lockroot><d:href>${xml(hrefOf(parts, !!at.node?.children))}</d:href></d:lockroot></d:activelock></d:lockdiscovery></d:prop>`,
        { ...base, "content-type": "application/xml; charset=utf-8", "Lock-Token": `<${token}>` });
    }
    case "UNLOCK": await drain(req); return send(res, 204, "", base);
    default: await drain(req); return send(res, 405, "", base);
  }
}
