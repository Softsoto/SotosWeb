/* ============================================================
   Sotos — descargas al servidor
   Pegas un enlace y el servidor lo baja directo a tu carpeta «Descargas» de Sotos Drive, con
   progreso en vivo; sigue aunque cierres el navegador (ideal en un NAS).
   Seguridad: solo http/https, nunca direcciones internas (localhost, red de la casa, nube
   privada) ni en las redirecciones; respeta tu espacio y el tamaño máximo de archivo.
   POST   /api/descargas         { url }       empezar
   GET    /api/descargas                       las tuyas (en memoria: se olvidan al reiniciar)
   DELETE /api/descargas/<id>                  cancelar / quitar de la lista
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { now, rid } from "./db.mjs";
import { fail, json, readJson, rateLimit } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { loadState, blobPath, applyOps, notify } from "./fs.mjs";
import { typeOf, newId, quotaOf, MAX_FILE } from "./dav.mjs";
import { addNotification } from "./social.mjs";

const jobs = new Map(); // id → trabajo
const MAX_ACTIVE = 3;

/** ¿la dirección IP es interna? (loopback, privada, enlace local, CGNAT, multicast…) */
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}
async function checkUrl(raw) {
  let u; try { u = new URL(String(raw).trim()); } catch { throw Object.assign(new Error("Escribe un enlace completo (https://…)"), { status: 400 }); }
  if (!["http:", "https:"].includes(u.protocol)) throw Object.assign(new Error("Solo enlaces http o https"), { status: 400 });
  if (u.username || u.password) throw Object.assign(new Error("El enlace no puede llevar usuario y contraseña"), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw Object.assign(new Error("No se encontró ese sitio"), { status: 400 }); });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw Object.assign(new Error("Por seguridad no se descargan direcciones internas (localhost o tu red local)"), { status: 400 });
  return u;
}
const nameFrom = (u, r) => {
  const cd = r.headers.get("content-disposition") || ""; const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
  let n = m ? decodeURIComponent(m[1] || m[2]) : decodeURIComponent(path.posix.basename(u.pathname) || "");
  n = n.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 180); return n && n !== "." && n !== ".." ? n : "descarga";
};
const pub = (j) => ({ id: j.id, url: j.url, name: j.name, size: j.size, got: j.got, state: j.state, error: j.error || null, started: j.started, finished: j.finished || null, nodeId: j.nodeId || null });

async function run(j) {
  const ac = new AbortController(); j.abort = () => ac.abort();
  const tell = () => notify(j.user, "descargas", pub(j));
  let tmp = null;
  try {
    let url = await checkUrl(j.url), r;
    for (let hop = 0; ; hop++) { // redirecciones a mano: cada salto se vuelve a comprobar
      r = await fetch(url, { redirect: "manual", signal: ac.signal, headers: { "user-agent": "Sotos-descargas/1" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { if (hop >= 5) throw new Error("Demasiadas redirecciones"); url = await checkUrl(new URL(r.headers.get("location"), url)); continue; }
      break;
    }
    if (!r.ok) throw new Error(`El sitio respondió ${r.status}`);
    j.name = nameFrom(url, r); j.size = r.headers.get("content-encoding") ? 0 : Number(r.headers.get("content-length")) || 0; // comprimido: el tamaño final no se sabe j.state = "bajando"; tell();
    const { quota, used } = quotaOf(j.user);
    if (j.size > MAX_FILE) throw new Error("El archivo supera el tamaño máximo del servidor");
    if (quota && used + j.size > quota) throw new Error("No queda espacio en tu cuenta para este archivo");
    const id = newId(), dest = blobPath(j.user, id); tmp = dest + ".part"; fs.mkdirSync(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(tmp); let last = 0;
    for await (const chunk of r.body) {
      j.got += chunk.length;
      if (j.got > MAX_FILE || (quota && used + j.got > quota)) throw new Error("Se acabó el espacio o se superó el tamaño máximo");
      if (!out.write(chunk)) await new Promise(ok => out.once("drain", ok));
      if (Date.now() - last > 600) { last = Date.now(); tell(); }
    }
    await new Promise((ok, bad) => out.end(err => err ? bad(err) : ok()));
    fs.renameSync(tmp, dest); tmp = null;
    const root = loadState(j.user).state.root; const dir = (root.children || []).find(c => c.children && c.name === "Descargas") || root;
    const taken = new Set((dir.children || []).map(c => c.name.toLowerCase())); const ext = path.extname(j.name), base = j.name.slice(0, j.name.length - ext.length);
    let name = j.name; for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
    const t = Date.now(); applyOps(j.user, [{ t: "create", parent: dir.id, node: { id, name, type: typeOf(name), size: j.got, ctime: t, mtime: t } }], "descargas");
    Object.assign(j, { state: "lista", name, nodeId: id, finished: now() }); tell();
    addNotification(j.user, { kind: "system", title: `Descarga lista: ${name}`, body: "Está en tu carpeta Descargas", link: { app: "files" } });
  } catch (e) {
    if (tmp) fs.rmSync(tmp, { force: true });
    Object.assign(j, { state: ac.signal.aborted ? "cancelada" : "error", error: ac.signal.aborted ? null : e.message, finished: now() }); tell();
  } finally { j.abort = null; }
}

export async function handleDescargas(req, res, parts) {
  const u = requireUser(req); const [id] = parts;
  if (!id && req.method === "GET") return json(res, 200, { items: [...jobs.values()].filter(j => j.user === u.id).sort((a, b) => b.started - a.started).map(pub) });
  if (!id && req.method === "POST") {
    rateLimit("descargas:" + u.id, 30, 3600_000);
    const { url } = await readJson(req, 8192);
    try { await checkUrl(url); } catch (e) { fail(e.status || 400, e.message); }
    if ([...jobs.values()].filter(j => j.user === u.id && ["esperando", "bajando"].includes(j.state)).length >= MAX_ACTIVE) fail(429, `Máximo ${MAX_ACTIVE} descargas a la vez`);
    const j = { id: rid(8), user: u.id, url: String(url).trim(), name: "", size: 0, got: 0, state: "esperando", started: now() };
    jobs.set(j.id, j); run(j); return json(res, 201, pub(j));
  }
  const j = id && jobs.get(id); if (!j || j.user !== u.id) fail(404, "Descarga no encontrada");
  if (req.method === "DELETE") { if (j.abort) j.abort(); else jobs.delete(id); return json(res, 200, { ok: true }); }
  fail(404, "No encontrado");
}
