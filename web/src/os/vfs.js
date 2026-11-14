/* ============================================================
   Sotos OS — sistema de archivos virtual (VFS) con sincronización
   © 2026 Sebastian Sotomontes

   - Caché local en IndexedDB (una base por cuenta; "sotos-os" = invitado).
   - Cada cambio es una operación pura (tree-ops.js) que se aplica al
     instante en local y, con cuenta, se envía al servidor en cola
     (funciona sin conexión y reintenta).
   - Eventos en vivo (SSE): otros dispositivos ven los cambios al momento.
   - Contenido: se sube antes de la operación que lo referencia y se
     descarga bajo demanda desde la nube.
   ============================================================ */
import { useSyncExternalStore } from "react";
import { applyOp, index, cloneTree, folderSize as fSize, isInside, ROOT as R, DESKTOP as D } from "./tree-ops.js";
import { api, ApiError } from "./api.js";

export const ROOT = R, DESKTOP = D;
export const folderSize = fSize;

/* ---------------- IndexedDB ---------------- */
let DB_NAME = "sotos-os";
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && "result" in out ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
export const idb = {
  get: (s, k) => tx(s, "readonly", st => st.get(k)),
  put: (s, k, v) => tx(s, "readwrite", st => st.put(v, k)),
  del: (s, k) => tx(s, "readwrite", st => st.delete(k)),
};

/* ---------------- tipos ---------------- */
const EXT = {
  docx: "docx", doc: "docx", odt: "docx", rtf: "docx", xlsx: "xlsx", xls: "xlsx", ods: "xlsx", csv: "csv", pptx: "pptx", ppt: "pptx", odp: "pptx", pdf: "pdf",
  png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", bmp: "img", svg: "img", avif: "img", ico: "img",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", aac: "audio", opus: "audio",
  mp4: "video", webm: "video", mov: "video", mkv: "video", ogv: "video", m4v: "video",
  txt: "txt", log: "txt", ini: "txt", cfg: "txt", nfo: "txt",
  md: "code", html: "code", htm: "code", css: "code", js: "code", mjs: "code", jsx: "code", ts: "code", tsx: "code", json: "code", xml: "code", yml: "code", yaml: "code",
  py: "code", c: "code", h: "code", cpp: "code", cs: "code", java: "code", php: "code", sh: "code", ps1: "code", bat: "code", sql: "code", go: "code", rs: "code", rb: "code", lua: "code", toml: "code",
  zip: "zip", rar: "zip", "7z": "zip", tar: "zip", gz: "zip",
};
const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", pdf: "application/pdf", csv: "text/csv", txt: "text/plain", html: "text/html", htm: "text/html",
  css: "text/css", js: "text/javascript", json: "application/json", md: "text/markdown", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", zip: "application/zip",
};
export const extOf = (name) => { const m = /\.([^.]+)$/.exec(name || ""); return m ? m[1].toLowerCase() : ""; };
export const typeOf = (name) => EXT[extOf(name)] || "file";
export const mimeOf = (name) => MIME[extOf(name)] || (["code", "txt"].includes(typeOf(name)) ? "text/plain" : "application/octet-stream");
export const isText = (n) => n && (n.type === "txt" || n.type === "code" || n.type === "csv");
export const fmtSize = (b) => b == null ? "—" : b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB" : b < 1073741824 ? (b / 1048576).toFixed(1) + " MB" : (b / 1073741824).toFixed(2) + " GB";
export const fmtDate = (ms) => {
  if (!ms) return "—";
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return "hoy " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
};
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export function uniqueName(folder, name, ignoreId) {
  const taken = new Set((folder?.children || []).filter(c => c.id !== ignoreId).map(c => c.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const m = /^(.*?)(\.[^.]+)?$/.exec(name); const base = m[1], ext = m[2] || "";
  for (let k = 2; ; k++) { const cand = `${base} (${k})${ext}`; if (!taken.has(cand.toLowerCase())) return cand; }
}
const validName = (s) => { const n = String(s || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_"); return n && n !== "." && n !== ".." ? n.slice(0, 200) : null; };

/* ---------------- store ---------------- */
const ORIGIN = newId(); // identifica a esta pestaña en los eventos del servidor
let state = { ready: false, root: null, trash: [], clipboard: null, rev: 0, mode: "local", user: null, sync: { status: "idle", pending: 0, quota: null, used: null } };
let idx = new Map();
const subs = new Set();
const emit = () => subs.forEach(f => f());
let saveTimer = null;
function commit(next, { persist = true } = {}) {
  state = { ...state, ...next, rev: state.rev + 1 };
  if (next.root) idx = index(state.root);
  emit();
  if (persist) { clearTimeout(saveTimer); saveTimer = setTimeout(() => idb.put("kv", "tree", { root: state.root, trash: state.trash, v: 3 }).catch(e => console.error("[vfs] guardar", e)), 200); }
}
const setSync = (patch) => commit({ sync: { ...state.sync, ...patch } }, { persist: false });
export const getState = () => state;
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export function useVfs(selector = (s) => s) { return selector(useSyncExternalStore(subscribe, getState)); }

/* ---------------- consultas ---------------- */
export const node = (id) => idx.get(id)?.node || null;
export const parentOf = (id) => idx.get(id)?.parent || null;
export function pathOf(id) { const out = []; let cur = idx.get(id); while (cur && cur.parent) { out.unshift(cur.node); cur = idx.get(cur.parent.id); } return out; }
export const pathString = (id) => "/" + pathOf(id).map(n => n.name).join("/");
export function resolve(path, cwdId = ROOT) {
  let cur = path.startsWith("/") ? state.root : node(cwdId) || state.root;
  for (const part of path.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") { cur = parentOf(cur.id) || cur; continue; }
    if (part === "~") { cur = state.root; continue; }
    const next = (cur.children || []).find(c => c.name.toLowerCase() === part.toLowerCase());
    if (!next) return null; cur = next;
  }
  return cur;
}
export function walk(fn, from) { const go = (n) => { fn(n); (n.children || []).forEach(go); }; if (state.root) go(from || state.root); }
export function search(q, limit = 30) { const out = []; const ql = q.toLowerCase(); walk(n => { if (n.id !== ROOT && n.name.toLowerCase().includes(ql) && out.length < limit) out.push(n); }); return out; }
export const allOfType = (types) => { const out = []; walk(n => { if (types.includes(n.type)) out.push(n); }); return out; };
export const usedBytes = () => state.root ? fSize(state.root) + state.trash.reduce((s, t) => s + fSize(t.node), 0) : 0;

/* ---------------- cola de sincronización ---------------- */
let queue = [];          // [{ k: "blob", id } | { k: "op", op }]
let version = 0;
let pumping = false, retryTimer = null, events = null;
const saveQueue = () => idb.put("kv", "queue", { queue, version }).catch(() => {});
function enqueue(item) { if (state.mode !== "cloud") return; queue.push(item); saveQueue(); setSync({ pending: queue.length }); pump(); }
async function pump() {
  if (pumping || state.mode !== "cloud") return;
  pumping = true; clearTimeout(retryTimer);
  try {
    while (queue.length) {
      const item = queue[0];
      if (item.k === "blob") {
        const b = await idb.get("blobs", item.id);
        if (b) await api("PUT", "fs/blob/" + item.id, b);
        queue.shift();
      } else {
        // agrupar operaciones seguidas en una sola petición
        const ops = []; while (queue.length && queue[0].k === "op" && ops.length < 200) ops.push(queue.shift().op);
        try { const r = await api("POST", "fs/ops", { ops, origin: ORIGIN }); version = r.version; }
        catch (e) { queue.unshift(...ops.map(op => ({ k: "op", op }))); throw e; }
      }
      saveQueue(); setSync({ pending: queue.length, status: queue.length ? "syncing" : "ok" });
    }
    setSync({ status: "ok", pending: 0 });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setSync({ status: "auth" });
    else if (e instanceof ApiError && (e.status === 507 || e.status === 413)) { setSync({ status: "full" }); queue.shift(); saveQueue(); }
    else { setSync({ status: "offline" }); retryTimer = setTimeout(pump, 5000); }
  } finally { pumping = false; }
}
export const flush = async () => { await pump(); for (let i = 0; i < 40 && (pumping || queue.length) && state.sync.status !== "offline"; i++) await new Promise(r => setTimeout(r, 150)); };

/* trae el estado del servidor y vuelve a aplicar lo pendiente encima */
async function pull() {
  const r = await api("GET", "fs/state");
  let s = r.state;
  for (const it of queue) if (it.k === "op") { try { const x = applyOp(s, it.op); s = { root: x.root, trash: x.trash }; } catch {} }
  version = r.version;
  commit({ root: s.root, trash: s.trash, sync: { ...state.sync, quota: r.quota, used: r.used } });
  return r;
}
function listen() {
  events?.close();
  events = new EventSource("/api/fs/events");
  events.addEventListener("fs", (e) => { const d = JSON.parse(e.data); if (d.origin !== ORIGIN && d.version > version) pull().catch(() => {}); else if (d.version > version) version = d.version; });
  events.addEventListener("hello", (e) => { const d = JSON.parse(e.data); if (d.version > version) pull().catch(() => {}); if (queue.length) pump(); });
  events.onerror = () => { if (state.sync.status === "ok") setSync({ status: "offline" }); };
  events.onopen = () => { if (state.sync.status === "offline") { setSync({ status: queue.length ? "syncing" : "ok" }); pump(); } };
}
window.addEventListener("online", () => pump());

/* ejecutar una operación: local al instante + nube en cola */
function exec(op) {
  const r = applyOp({ root: state.root, trash: state.trash }, op);
  commit({ root: r.root, trash: r.trash });
  enqueue({ k: "op", op });
  return r.effects;
}

/* ---------------- contenido ---------------- */
const urlCache = new Map();
const findAny = (id) => node(id) || state.trash.map(t => index(t.node).get(id)?.node).find(Boolean) || null;
export async function read(id) {
  const n = findAny(id);
  if (!n) throw new Error("No existe");
  const b = await idb.get("blobs", id);
  if (b) return b;
  if (state.mode === "cloud" && (n.size > 0 || !n.url)) {
    try {
      const r = await api("GET", "fs/blob/" + id, null, { raw: true });
      const blob = new Blob([await r.arrayBuffer()], { type: mimeOf(n.name) });
      if (blob.size < 200 * 1024 * 1024) idb.put("blobs", id, blob).catch(() => {});
      return blob;
    } catch (e) { if (!n.url) { if (e.status === 404) return new Blob([], { type: mimeOf(n.name) }); throw e; } }
  }
  if (n.url) { const r = await fetch(n.url); if (!r.ok) throw new Error("No se pudo descargar"); return r.blob(); }
  return new Blob([], { type: mimeOf(n.name) });
}
export const readText = async (id) => (await read(id)).text();
export async function objectUrl(id) {
  const n = node(id);
  if (n && n.url && !(n.size > 0) && !(await idb.get("blobs", id))) return n.url;
  const cached = urlCache.get(id); if (cached && cached.rev === n?.mtime) return cached.url;
  const b = await read(id); const url = URL.createObjectURL(b);
  if (cached) URL.revokeObjectURL(cached.url);
  urlCache.set(id, { url, rev: n?.mtime }); return url;
}
export async function write(id, data) {
  const n = node(id); if (!n) throw new Error("No existe");
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeOf(n.name) });
  await idb.put("blobs", id, blob);
  enqueue({ k: "blob", id });
  exec({ t: "write", id, size: blob.size, mtime: Date.now() });
  return node(id);
}

/* ---------------- mutaciones ---------------- */
export async function create(parentId, name, data, extra = {}) {
  const nm = validName(name); if (!nm) throw new Error("Nombre no válido");
  const id = newId();
  const blob = data == null ? null : data instanceof Blob ? data : new Blob([data], { type: mimeOf(nm) });
  if (blob) { await idb.put("blobs", id, blob); enqueue({ k: "blob", id }); }
  const p = node(parentId) || state.root;
  exec({ t: "create", parent: p.id, node: { id, name: uniqueName(p, nm), type: typeOf(nm), size: blob ? blob.size : (extra.size || 0), ctime: Date.now(), mtime: Date.now(), ...extra } });
  return id;
}
export function mkdir(parentId, name = "Nueva carpeta") {
  const nm = validName(name) || "Nueva carpeta"; const id = newId(); const p = node(parentId) || state.root;
  exec({ t: "create", parent: p.id, node: { id, name: uniqueName(p, nm), type: "folder", children: [], ctime: Date.now(), mtime: Date.now() } });
  return id;
}
export function rename(id, name) {
  const nm = validName(name); const n = node(id); if (!nm || !n || id === ROOT || id === DESKTOP) return false;
  const final = uniqueName(parentOf(id), nm, id);
  exec({ t: "rename", id, name: final, type: n.type === "folder" ? undefined : typeOf(final), mtime: Date.now() });
  return true;
}
export function move(ids, destId) {
  const dest = node(destId); if (!dest || !dest.children) return 0;
  const ok = ids.filter(id => { const p = parentOf(id); return p && p.id !== destId && id !== DESKTOP && !isInside(idx, destId, id); });
  if (!ok.length) return 0;
  const names = {}; const tmp = { children: [...dest.children] };
  for (const id of ok) { names[id] = uniqueName(tmp, node(id).name); tmp.children.push({ id, name: names[id] }); }
  exec({ t: "move", ids: ok, dest: destId, names });
  return ok.length;
}
export async function copy(ids, destId) {
  const dest = node(destId); if (!dest) return;
  const blobs = []; const items = []; const tmp = { children: [...dest.children] };
  const dup = (n) => { const id = newId(); const c = { ...n, id, ctime: Date.now(), mtime: Date.now() }; if (n.children) c.children = n.children.map(dup); else blobs.push({ from: n.id, to: id }); return c; };
  for (const id of ids) { const n = node(id); if (!n || (n.children && isInside(idx, destId, id))) continue; const c = dup(n); c.name = uniqueName(tmp, n.name); tmp.children.push(c); items.push({ node: c }); }
  // copia local del contenido (el servidor copia el suyo)
  await Promise.all(blobs.map(({ from, to }) => idb.get("blobs", from).then(b => b && idb.put("blobs", to, b))));
  exec({ t: "copy", dest: destId, items, blobs });
}
export function trash(ids) {
  const ok = ids.filter(id => parentOf(id) && id !== DESKTOP);
  if (ok.length) exec({ t: "trash", ids: ok, at: Date.now() });
  return ok.length;
}
export function restore(trashIds) {
  const names = {}; const tmpByFolder = new Map();
  for (const t of state.trash.filter(t => trashIds.includes(t.node.id))) {
    const dest = node(t.from) || state.root; const tmp = tmpByFolder.get(dest.id) || { children: [...dest.children] }; tmpByFolder.set(dest.id, tmp);
    names[t.node.id] = uniqueName(tmp, t.node.name); tmp.children.push({ name: names[t.node.id] });
  }
  exec({ t: "restore", ids: trashIds, names });
}
export async function destroy(trashIds) {
  const fx = exec({ t: "destroy", ids: trashIds });
  await Promise.all(fx.deleteBlobs.map(id => idb.del("blobs", id).catch(() => {})));
}
export const emptyTrash = () => destroy(state.trash.map(t => t.node.id));

/* ---------------- portapapeles ---------------- */
export const clip = (mode, ids) => commit({ clipboard: ids.length ? { mode, ids } : null }, { persist: false });
export async function paste(destId) {
  const c = state.clipboard; if (!c) return 0;
  if (c.mode === "cut") { const n = move(c.ids, destId); commit({ clipboard: null }, { persist: false }); return n; }
  await copy(c.ids, destId); return c.ids.length;
}

/* ---------------- importar / exportar ---------------- */
export async function importFiles(destId, fileList) { const ids = []; for (const f of fileList) ids.push(await create(destId, f.name, f)); return ids; }
export async function importDataTransfer(destId, dt) {
  const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return importFiles(destId, dt.files || []);
  const ids = [];
  const go = async (entry, parent) => {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); ids.push(await create(parent, f.name, f)); }
    else if (entry.isDirectory) {
      const dir = mkdir(parent, entry.name); const reader = entry.createReader();
      let batch; do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const e of batch) await go(e, dir); } while (batch.length);
      ids.push(dir);
    }
  };
  for (const e of entries) await go(e, destId);
  return ids;
}
export async function download(id) {
  const n = node(id); if (!n) return;
  let blob, name = n.name;
  if (n.type === "folder") {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const add = async (x, folder) => { for (const c of x.children || []) { if (c.children) await add(c, folder.folder(c.name)); else folder.file(c.name, await read(c.id)); } };
    await add(n, zip); blob = await zip.generateAsync({ type: "blob" }); name += ".zip";
  } else blob = await read(id);
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/* ---------------- arranque ---------------- */
async function seedRoot() {
  const { buildSeed } = await import("./seed.js");
  return buildSeed({ put: (id, blob) => idb.put("blobs", id, blob), newId, typeOf });
}
/**
 * init()            → modo invitado (todo en este navegador)
 * init({ user })    → modo nube para esa cuenta (caché local propia)
 */
export async function init({ user } = {}) {
  const wantDb = user ? "sotos-os-" + user.id : "sotos-os";
  if (state.ready && DB_NAME === wantDb) return;
  // cambiar de cuenta: cerrar todo lo anterior
  events?.close(); events = null; clearTimeout(retryTimer); queue = []; version = 0;
  if (dbp) { (await dbp).close(); dbp = null; }
  urlCache.forEach(v => URL.revokeObjectURL(v.url)); urlCache.clear();
  DB_NAME = wantDb;
  commit({ ready: false, mode: user ? "cloud" : "local", user: user || null, clipboard: null, sync: { status: user ? "syncing" : "idle", pending: 0, quota: null, used: null } }, { persist: false });

  let saved = null;
  try { saved = await idb.get("kv", "tree"); } catch (e) { console.error("[vfs] IndexedDB no disponible", e); }
  if (!user) {
    if (saved?.root) commit({ ready: true, root: saved.root, trash: saved.trash || [] }, { persist: false });
    else { const root = await seedRoot(); ["sotos_fs", "sotos_desk", "sotos_trash"].forEach(k => { try { localStorage.removeItem(k); } catch {} }); commit({ ready: true, root, trash: [] }); }
    return;
  }
  // nube: mostrar la caché al instante y reconciliar con el servidor
  const q = await idb.get("kv", "queue").catch(() => null);
  if (q) { queue = q.queue || []; version = q.version || 0; }
  if (saved?.root) commit({ ready: true, root: saved.root, trash: saved.trash || [] }, { persist: false });
  try {
    const r = await api("GET", "fs/state");
    if (r.fresh && !queue.length) {
      // cuenta nueva: crear el contenido de ejemplo y subirlo
      const root = saved?.root || await seedRoot();
      commit({ ready: true, root, trash: saved?.trash || [] });
      const ids = []; const collect = (n) => n.children ? n.children.forEach(collect) : ids.push(n.id); collect(root);
      for (const id of ids) queue.push({ k: "blob", id });
      queue.push({ k: "op", op: { t: "replace", root, trash: saved?.trash || [] } });
      saveQueue(); setSync({ pending: queue.length, quota: r.quota, used: r.used });
    } else {
      let s = r.state; for (const it of queue) if (it.k === "op") { try { const x = applyOp(s, it.op); s = { root: x.root, trash: x.trash }; } catch {} }
      version = r.version;
      commit({ ready: true, root: s.root, trash: s.trash, sync: { ...state.sync, quota: r.quota, used: r.used } });
    }
    listen(); pump();
  } catch (e) {
    if (!saved?.root) throw new Error(e.status === 401 ? "La sesión caducó" : "No se pudo conectar con la nube y no hay copia local");
    setSync({ status: "offline" }); listen(); retryTimer = setTimeout(pump, 5000);
  }
}
/** copia los archivos del modo invitado a la cuenta actual (carpeta "Archivos de invitado") */
export async function importGuest() {
  if (state.mode !== "cloud") return 0;
  const g = await new Promise((res, rej) => { const r = indexedDB.open("sotos-os", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onupgradeneeded = () => { r.transaction.abort(); }; });
  const get = (s, k) => new Promise((res, rej) => { const q = g.transaction(s).objectStore(s).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const tree = await get("kv", "tree").catch(() => null); if (!tree?.root) { g.close(); return 0; }
  const folder = mkdir(ROOT, "Archivos de invitado"); let count = 0;
  const go = async (n, parent) => { for (const c of n.children || []) { if (c.children) await go(c, mkdir(parent, c.name)); else { const b = await get("blobs", c.id); await create(parent, c.name, b || null, c.url ? { url: c.url, online: true, meta: c.meta } : {}); count++; } } };
  await go(tree.root, folder); g.close();
  return count;
}
export async function factoryReset() {
  const d = await db(); d.close(); dbp = null;
  await new Promise((res) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}
