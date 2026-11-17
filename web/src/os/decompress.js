/* ============================================================
   Sotos — descompresor: .zip, .tar, .tar.gz/.tgz, .gz (propio + nativo)
   y .7z, .rar, .bz2, .xz, .tar.bz2, .tar.xz (libarchive.js, MIT, carga diferida).
   Rutas saneadas (nada fuera de la carpeta) y límites contra "bombas".
   © 2026 Sebastian Sotomontes
   ============================================================ */
import * as vfs from "./vfs.js";

export const ARCHIVE_RE = /\.(zip|tar|tgz|tar\.gz|gz|7z|rar|bz2|tbz2?|tar\.bz2|xz|txz|tar\.xz)$/i;
export const isArchive = (n) => !!n && n.type !== "folder" && ARCHIVE_RE.test(n.name);
const MAX_FILES = 20000, MAX_BYTES = 2 * 1024 ** 3;
const clean = (p) => p.replace(/\\/g, "/").split("/").filter(s => s && s !== ".." && s !== ".").join("/");
const baseName = (name) => name.replace(/\.(tar\.(gz|bz2|xz)|tgz|tbz2?|txz|zip|tar|gz|7z|rar|bz2|xz)$/i, "") || "Extraído";

async function gunzip(blob) { return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).blob(); }
/* lector tar (ustar/pax básico) */
async function untar(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), out = [], td = new TextDecoder();
  const str = (o, n) => { const s = td.decode(buf.subarray(o, o + n)); const z = s.indexOf("\0"); return z < 0 ? s : s.slice(0, z); };
  let off = 0, longName = null;
  while (off + 512 <= buf.length) {
    if (buf.subarray(off, off + 512).every(b => b === 0)) break;
    let name = str(off, 100); const size = parseInt(str(off + 124, 12).trim() || "0", 8) || 0, type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = str(off + 345, 155); if (prefix) name = prefix + "/" + name;
    const data = buf.subarray(off + 512, off + 512 + size);
    if (type === "L") longName = td.decode(data).replace(/\0.*$/, "");
    else if (type === "x") { const m = td.decode(data).match(/\d+ path=([^\n]+)\n/); if (m) longName = m[1]; }
    else { if (longName) { name = longName; longName = null; } if (type === "0" || type === "\0" || type === "7") out.push({ path: name, blob: new Blob([data.slice()]) }); }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
async function unzipEntries(blob) {
  const JSZip = (await import("jszip")).default, zip = await JSZip.loadAsync(blob), out = [];
  for (const [p, e] of Object.entries(zip.files)) if (!e.dir) out.push({ path: p, get: () => e.async("blob") });
  return out;
}
let archiveP = null;
async function libarchive(blob, name) {
  archiveP ||= import("libarchive.js").then(m => { const A = m.Archive || m.default?.Archive || m.default; A.init({ workerUrl: import.meta.env.BASE_URL + "libarchive/worker-bundle.js" }); return A; });
  const Archive = await archiveP;
  const arc = await Archive.open(new File([blob], name));
  const obj = await arc.extractFiles(); const out = [];
  const walk = (o, pre) => { for (const [k, v] of Object.entries(o)) { if (v instanceof File || v instanceof Blob) out.push({ path: pre + k, blob: v }); else if (v && typeof v === "object") walk(v, pre + k + "/"); } };
  walk(obj, ""); return out;
}

/** lista de entradas { path, blob | get() } del archivo comprimido */
async function entriesOf(n) {
  const blob = await vfs.read(n.id), nm = n.name.toLowerCase();
  if (nm.endsWith(".zip")) return unzipEntries(blob);
  if (/\.(tar\.gz|tgz)$/.test(nm)) return untar(await gunzip(blob));
  if (nm.endsWith(".tar")) return untar(blob);
  if (nm.endsWith(".gz")) return [{ path: n.name.replace(/\.gz$/i, ""), blob: await gunzip(blob) }];
  return libarchive(blob, n.name); // 7z, rar, bz2, xz y sus .tar
}

/** extrae el archivo en una carpeta nueva junto a él; devuelve { folderId, count } */
export async function extract(n, parentId, onProgress) {
  const list = (await entriesOf(n)).map(e => ({ ...e, path: clean(e.path) })).filter(e => e.path && !/^__MACOSX(\/|$)/.test(e.path));
  if (list.length > MAX_FILES) throw new Error(`Tiene ${list.length} archivos; el máximo es ${MAX_FILES}`);
  const parent = vfs.node(parentId);
  // un solo archivo (un .gz/.bz2/.xz suelto): va directo al lado del comprimido, sin carpeta
  if (list.length === 1 && !/\.(zip|tar|tgz|tbz2?|txz|7z|rar)$|\.tar\.(gz|bz2|xz)$/i.test(n.name)) {
    const e = list[0], blob = e.blob || await e.get(); if (blob.size > MAX_BYTES) throw new Error("El contenido descomprimido supera 2 GB");
    const name = e.path.split("/").pop() || baseName(n.name);
    const id = await vfs.create(parentId, vfs.uniqueName(parent, name), blob);
    onProgress && onProgress(1, 1); return { folderId: parentId, fileId: id, count: 1 };
  }
  const root = vfs.mkdir(parentId, vfs.uniqueName(parent, baseName(n.name)));
  const dirs = new Map([["", root]]);
  const dirFor = (path) => { if (dirs.has(path)) return dirs.get(path); const i = path.lastIndexOf("/"); const p = dirFor(i < 0 ? "" : path.slice(0, i)); const id = vfs.mkdir(p, path.slice(i + 1)); dirs.set(path, id); return id; };
  let count = 0, bytes = 0;
  for (const e of list) {
    const blob = e.blob || await e.get();
    bytes += blob.size; if (bytes > MAX_BYTES) throw new Error("El contenido descomprimido supera 2 GB");
    const i = e.path.lastIndexOf("/");
    await vfs.create(dirFor(i < 0 ? "" : e.path.slice(0, i)), e.path.slice(i + 1), blob);
    count++; onProgress && onProgress(count, list.length);
  }
  return { folderId: root, count };
}