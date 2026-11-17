/* ============================================================
   Sotos — miniaturas de vídeo
   Abre el vídeo en silencio, salta al 15 % de su duración, dibuja
   ese cuadro en un canvas y lo guarda (IndexedDB) para no repetirlo.
   Máximo dos a la vez para no saturar la red ni el equipo.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import * as vfs from "./vfs.js";

const DB = "sotos-thumbs";
let dbp = null;
const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("t"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const idbGet = (k) => db().then(d => new Promise(res => { const q = d.transaction("t").objectStore("t").get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); })).catch(() => null);
const idbPut = (k, v) => db().then(d => new Promise(res => { const tx = d.transaction("t", "readwrite"); tx.objectStore("t").put(v, k); tx.oncomplete = res; tx.onerror = res; })).catch(() => {});

const mem = new Map();      // clave -> Promise<url|null>
const waiting = []; let active = 0;
const pump = () => { while (active < 2 && waiting.length) { const job = waiting.shift(); active++; job().finally(() => { active--; pump(); }); } };
const enqueue = (fn) => new Promise(res => { waiting.push(() => fn().then(res, () => res(null))); pump(); });

function once(el, ok, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { clean(); rej(new Error("tiempo")); }, ms);
    const on = () => { clean(); res(); }, bad = () => { clean(); rej(new Error("error")); };
    const clean = () => { clearTimeout(t); el.removeEventListener(ok, on); el.removeEventListener("error", bad); };
    el.addEventListener(ok, on); el.addEventListener("error", bad);
  });
}

async function capture(src, remote) {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto";
  if (remote) v.crossOrigin = "anonymous";
  v.src = src;
  try {
    await once(v, "loadeddata", 20000);
    const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 2;
    v.currentTime = Math.min(Math.max(d * 0.15, 0.5), Math.max(d - 0.2, 0));
    await once(v, "seeked", 20000);
    const w = 320, h = Math.round(w * (v.videoHeight || 180) / (v.videoWidth || 320)) || 180;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(v, 0, 0, w, h);
    return await new Promise(res => c.toBlob(b => res(b), "image/jpeg", 0.8)); // lanza si el vídeo remoto no permite leer sus cuadros
  } finally { v.removeAttribute("src"); v.load(); }
}

/** URL de la miniatura de un nodo de vídeo, o null si no se pudo */
export function videoThumb(n) {
  if (!n || n.type !== "video") return Promise.resolve(null);
  const key = `${n.id}:${n.mtime || 0}`;
  if (!mem.has(key)) mem.set(key, (async () => {
    const saved = await idbGet(key);
    if (saved) return URL.createObjectURL(saved);
    const blob = await enqueue(async () => { const src = await vfs.objectUrl(n.id); return capture(src, /^https?:/.test(src)); });
    if (!blob) return null;
    idbPut(key, blob);
    return URL.createObjectURL(blob);
  })().catch(() => null));
  return mem.get(key);
}

export function useVideoThumb(n) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => { let live = true; setUrl(null); videoThumb(n).then(u => live && setUrl(u)); return () => { live = false; }; }, [n?.id, n?.mtime]);
  return url;
}
