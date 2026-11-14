/* ============================================================
   Sotos OS — sistema de archivos virtual (VFS)
   © 2026 Sebastian Sotomontes

   - Árbol de metadatos + contenido binario en IndexedDB
     (sin el límite de ~5 MB de localStorage).
   - Store fuera de React con subscribe/getState → useVfs().
   - Operaciones por id: crear, escribir, leer, renombrar, mover,
     copiar (incluye contenido), papelera con restauración.
   - Portapapeles interno (copiar / cortar / pegar).
   ============================================================ */
import { useSyncExternalStore } from "react";

/* ---------------- IndexedDB ---------------- */
const DB_NAME = "sotos-os", DB_VER = 1;
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out && "result" in out ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
export const idb = {
  get: (store, k) => tx(store, "readonly", s => s.get(k)),
  put: (store, k, v) => tx(store, "readwrite", s => s.put(v, k)),
  del: (store, k) => tx(store, "readwrite", s => s.delete(k)),
  keys: (store) => tx(store, "readonly", s => s.getAllKeys()),
};

/* ---------------- tipos ---------------- */
const EXT = {
  docx: "docx", doc: "docx", odt: "docx", rtf: "docx",
  xlsx: "xlsx", xls: "xlsx", ods: "xlsx", csv: "csv",
  pptx: "pptx", ppt: "pptx", odp: "pptx",
  pdf: "pdf",
  png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", bmp: "img", svg: "img", avif: "img", ico: "img",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", aac: "audio", opus: "audio",
  mp4: "video", webm: "video", mov: "video", mkv: "video", ogv: "video", m4v: "video",
  txt: "txt", log: "txt", ini: "txt", cfg: "txt", nfo: "txt",
  md: "code", html: "code", htm: "code", css: "code", js: "code", mjs: "code", jsx: "code", ts: "code", tsx: "code", json: "code",
  xml: "code", yml: "code", yaml: "code", py: "code", c: "code", h: "code", cpp: "code", cs: "code", java: "code", php: "code",
  sh: "code", ps1: "code", bat: "code", sql: "code", go: "code", rs: "code", rb: "code", lua: "code", toml: "code",
  zip: "zip", rar: "zip", "7z": "zip", tar: "zip", gz: "zip",
};
const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf", csv: "text/csv", txt: "text/plain", html: "text/html", htm: "text/html", css: "text/css",
  js: "text/javascript", json: "application/json", md: "text/markdown", svg: "image/svg+xml", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav",
  ogg: "audio/ogg", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", zip: "application/zip",
};
export const extOf = (name) => { const m = /\.([^.]+)$/.exec(name || ""); return m ? m[1].toLowerCase() : ""; };
export const typeOf = (name) => EXT[extOf(name)] || "file";
export const mimeOf = (name) => MIME[extOf(name)] || (typeOf(name) === "code" || typeOf(name) === "txt" ? "text/plain" : "application/octet-stream");
export const isText = (n) => n && (n.type === "txt" || n.type === "code" || n.type === "csv");

export const fmtSize = (b) => b == null ? "—" : b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB" : b < 1073741824 ? (b / 1048576).toFixed(1) + " MB" : (b / 1073741824).toFixed(2) + " GB";
export const fmtDate = (ms) => {
  if (!ms) return "—";
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return "hoy " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
};
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------------- árbol (puro) ---------------- */
export const ROOT = "root", DESKTOP = "desktop";
function index(root) { const map = new Map(); const walk = (n, parent) => { map.set(n.id, { node: n, parent }); (n.children || []).forEach(c => walk(c, n)); }; walk(root, null); return map; }
const cloneTree = (n) => n.children ? { ...n, children: n.children.map(cloneTree) } : { ...n };
export function folderSize(n) { return n.children ? n.children.reduce((s, c) => s + folderSize(c), 0) : (n.size || 0); }
export function uniqueName(folder, name, ignoreId) {
  const taken = new Set((folder.children || []).filter(c => c.id !== ignoreId).map(c => c.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const m = /^(.*?)(\.[^.]+)?$/.exec(name); const base = m[1], ext = m[2] || "";
  for (let k = 2; ; k++) { const cand = `${base} (${k})${ext}`; if (!taken.has(cand.toLowerCase())) return cand; }
}
const validName = (s) => { const n = String(s || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_"); return n && n !== "." && n !== ".." ? n.slice(0, 200) : null; };

/* ---------------- store ---------------- */
let state = { ready: false, root: null, trash: [], clipboard: null, rev: 0 };
let idx = new Map();
const subs = new Set();
const emit = () => subs.forEach(f => f());
let saveTimer = null;
function commit(next, { persist = true } = {}) {
  state = { ...state, ...next, rev: state.rev + 1 };
  if (next.root) idx = index(state.root);
  emit();
  if (persist) { clearTimeout(saveTimer); saveTimer = setTimeout(() => idb.put("kv", "tree", { root: state.root, trash: state.trash, v: 2 }).catch(e => console.error("[vfs] guardar", e)), 250); }
}
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
export function search(q, limit = 30) {
  const out = []; const ql = q.toLowerCase();
  walk(n => { if (n.id !== ROOT && n.name.toLowerCase().includes(ql) && out.length < limit) out.push(n); });
  return out;
}
export const allOfType = (types) => { const out = []; walk(n => { if (types.includes(n.type)) out.push(n); }); return out; };
export const usedBytes = () => state.root ? folderSize(state.root) + state.trash.reduce((s, t) => s + folderSize(t.node), 0) : 0;

/* ---------------- contenido ---------------- */
const urlCache = new Map();
export async function read(id) {
  const n = node(id) || state.trash.map(t => t.node).find(x => x.id === id);
  if (!n) throw new Error("No existe");
  const b = await idb.get("blobs", id);
  if (b) return b;
  if (n.url) { const r = await fetch(n.url); if (!r.ok) throw new Error("No se pudo descargar"); return r.blob(); }
  return new Blob([], { type: mimeOf(n.name) });
}
export const readText = async (id) => (await read(id)).text();
/** URL reproducible para <img>/<audio>/<video>/<iframe>; usa la remota si el archivo es en línea. */
export async function objectUrl(id) {
  const n = node(id);
  if (n && n.url && !(await idb.get("blobs", id))) return n.url;
  const cached = urlCache.get(id); if (cached && cached.rev === n?.mtime) return cached.url;
  const b = await read(id); const url = URL.createObjectURL(b);
  if (cached) URL.revokeObjectURL(cached.url);
  urlCache.set(id, { url, rev: n?.mtime }); return url;
}
export async function write(id, data) {
  const n = node(id); if (!n) throw new Error("No existe");
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeOf(n.name) });
  await idb.put("blobs", id, blob);
  const root = cloneTree(state.root); const map = index(root); const t = map.get(id).node;
  t.size = blob.size; t.mtime = Date.now(); delete t.url;
  commit({ root });
  return t;
}

/* ---------------- mutaciones ---------------- */
function mutate(fn) { const root = cloneTree(state.root); const map = index(root); const r = fn(root, map); commit({ root }); return r; }

export async function create(parentId, name, data, extra = {}) {
  const nm = validName(name); if (!nm) throw new Error("Nombre no válido");
  const id = newId();
  const blob = data == null ? null : data instanceof Blob ? data : new Blob([data], { type: mimeOf(nm) });
  if (blob) await idb.put("blobs", id, blob);
  mutate((root, map) => {
    const p = map.get(parentId)?.node || root; p.children = p.children || [];
    p.children.push({ id, name: uniqueName(p, nm), type: typeOf(nm), size: blob ? blob.size : (extra.size || 0), ctime: Date.now(), mtime: Date.now(), ...extra });
  });
  return id;
}
export function mkdir(parentId, name = "Nueva carpeta") {
  const nm = validName(name) || "Nueva carpeta"; const id = newId();
  mutate((root, map) => { const p = map.get(parentId)?.node || root; p.children = p.children || []; p.children.push({ id, name: uniqueName(p, nm), type: "folder", children: [], ctime: Date.now(), mtime: Date.now() }); });
  return id;
}
export function rename(id, name) {
  const nm = validName(name); if (!nm || id === ROOT || id === DESKTOP) return false;
  mutate((root, map) => { const e = map.get(id); if (!e) return; const n = e.node; n.name = uniqueName(e.parent, nm, id); if (n.type !== "folder") n.type = typeOf(n.name); n.mtime = Date.now(); });
  return true;
}
const isInside = (map, id, ancestorId) => { let cur = map.get(id); while (cur) { if (cur.node.id === ancestorId) return true; cur = cur.parent ? map.get(cur.parent.id) : null; } return false; };
export function move(ids, destId) {
  let moved = 0;
  mutate((root, map) => {
    const dest = map.get(destId)?.node; if (!dest || dest.type !== "folder" && dest.type !== "root") return;
    for (const id of ids) {
      const e = map.get(id); if (!e || !e.parent || id === DESKTOP || e.parent.id === destId) continue;
      if (isInside(map, destId, id)) continue; // no meter una carpeta dentro de sí misma
      e.parent.children = e.parent.children.filter(c => c.id !== id);
      e.node.name = uniqueName(dest, e.node.name);
      dest.children.push(e.node); moved++;
    }
  });
  return moved;
}
export async function copy(ids, destId) {
  const jobs = [];
  const dup = (n, dest) => {
    const id = newId(); const c = { ...n, id, ctime: Date.now(), mtime: Date.now() };
    if (n.children) { c.children = []; n.children.forEach(ch => c.children.push(dup(ch, c))); }
    else jobs.push(idb.get("blobs", n.id).then(b => b && idb.put("blobs", id, b)));
    return c;
  };
  mutate((root, map) => {
    const dest = map.get(destId)?.node; if (!dest) return;
    for (const id of ids) {
      const e = map.get(id); if (!e || isInside(map, destId, id) && e.node.children) continue;
      const c = dup(e.node, dest); c.name = uniqueName(dest, e.node.name); dest.children.push(c);
    }
  });
  await Promise.all(jobs);
}
export function trash(ids) {
  const items = [];
  mutate((root, map) => {
    for (const id of ids) {
      const e = map.get(id); if (!e || !e.parent || id === DESKTOP) continue;
      e.parent.children = e.parent.children.filter(c => c.id !== id);
      items.push({ node: e.node, from: e.parent.id, at: Date.now() });
    }
  });
  if (items.length) commit({ trash: [...items, ...state.trash] });
  return items.length;
}
export function restore(trashIds) {
  const keep = [], back = [];
  for (const t of state.trash) (trashIds.includes(t.node.id) ? back : keep).push(t);
  mutate((root, map) => {
    for (const t of back) { const dest = map.get(t.from)?.node || root; t.node.name = uniqueName(dest, t.node.name); dest.children.push(t.node); }
  });
  commit({ trash: keep });
}
async function purgeBlobs(n) { const ids = []; const go = (x) => { if (x.children) x.children.forEach(go); else ids.push(x.id); }; go(n); await Promise.all(ids.map(id => idb.del("blobs", id))); }
export async function destroy(trashIds) {
  const gone = state.trash.filter(t => trashIds.includes(t.node.id));
  commit({ trash: state.trash.filter(t => !trashIds.includes(t.node.id)) });
  for (const t of gone) await purgeBlobs(t.node);
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
export async function importFiles(destId, fileList) {
  const ids = [];
  for (const f of fileList) ids.push(await create(destId, f.name, f));
  return ids;
}
/** entradas de arrastrar carpetas desde el PC (webkitGetAsEntry) */
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
export async function init() {
  if (state.ready) return;
  let saved = null;
  try { saved = await idb.get("kv", "tree"); } catch (e) { console.error("[vfs] IndexedDB no disponible", e); }
  if (saved && saved.root) { commit({ ready: true, root: saved.root, trash: saved.trash || [] }, { persist: false }); return; }
  const { buildSeed } = await import("./seed.js");
  const root = await buildSeed({ put: (id, blob) => idb.put("blobs", id, blob), newId, typeOf });
  // limpiar claves de la v1 (todo en localStorage)
  ["sotos_fs", "sotos_desk", "sotos_trash"].forEach(k => { try { localStorage.removeItem(k); } catch {} });
  commit({ ready: true, root, trash: [] });
}
/** borra todo (Ajustes → Restablecer) */
export async function factoryReset() {
  const d = await db(); d.close(); dbp = null;
  await new Promise((res) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}
