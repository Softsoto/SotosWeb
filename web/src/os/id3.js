/* ============================================================
   Sotos — lector de etiquetas ID3 (v2.2, v2.3, v2.4)
   © 2026 Sebastian Sotomontes
   Título, artista, álbum, año y carátula (APIC/PIC) de archivos MP3.
   ============================================================ */
import React from "react";
import * as vfs from "./vfs.js";
const { useState, useEffect } = React;

const syncsafe = (b, o) => (b[o] & 0x7f) << 21 | (b[o + 1] & 0x7f) << 14 | (b[o + 2] & 0x7f) << 7 | (b[o + 3] & 0x7f);
const be32 = (b, o) => (b[o] << 24 >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const be24 = (b, o) => (b[o] << 16) + (b[o + 1] << 8) + b[o + 2];
const decoders = {};
const dec = (name) => decoders[name] || (decoders[name] = new TextDecoder(name));
function text(bytes, enc) {
  if (!bytes.length) return "";
  let s;
  if (enc === 0) s = dec("iso-8859-1").decode(bytes);
  else if (enc === 3) s = dec("utf-8").decode(bytes);
  else if (enc === 2) s = dec("utf-16be").decode(bytes);
  else { // UTF-16 con BOM
    if (bytes[0] === 0xfe && bytes[1] === 0xff) s = dec("utf-16be").decode(bytes.subarray(2));
    else s = dec("utf-16le").decode(bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2) : bytes);
  }
  return s.replace(/\u0000+$/, "").split("\u0000")[0].trim();
}
// posición del final de una cadena terminada en nulo según la codificación
function strEnd(b, start, enc) {
  if (enc === 1 || enc === 2) { for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i; return b.length; }
  for (let i = start; i < b.length; i++) if (b[i] === 0) return i; return b.length;
}

/** analiza un ArrayBuffer/Uint8Array que empieza por la etiqueta ID3 */
export function parseId3(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null; // "ID3"
  const ver = b[3], flags = b[5], size = syncsafe(b, 6), end = Math.min(b.length, 10 + size);
  let p = 10;
  if (flags & 0x40) p += ver === 4 ? syncsafe(b, 10) : be32(b, 10) + 4; // cabecera extendida
  const out = {};
  const short = ver === 2;
  const MAP = short ? { TT2: "title", TP1: "artist", TAL: "album", TYE: "year" } : { TIT2: "title", TPE1: "artist", TALB: "album", TYER: "year", TDRC: "year" };
  while (p + (short ? 6 : 10) <= end) {
    const id = String.fromCharCode(...b.subarray(p, p + (short ? 3 : 4)));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break; // relleno
    const fsize = short ? be24(b, p + 3) : ver === 4 ? syncsafe(b, p + 4) : be32(b, p + 4);
    const start = p + (short ? 6 : 10), stop = Math.min(end, start + fsize);
    if (fsize <= 0 || stop > end) break;
    const body = b.subarray(start, stop);
    if (MAP[id]) out[MAP[id]] = text(body.subarray(1), body[0]);
    else if ((id === "APIC" || id === "PIC") && !out.picture) {
      const enc = body[0]; let q = 1, mime;
      if (short) { const fmt = String.fromCharCode(...body.subarray(1, 4)).toLowerCase(); mime = fmt === "png" ? "image/png" : "image/jpeg"; q = 4; }
      else { const e = strEnd(body, 1, 0); mime = text(body.subarray(1, e), 0) || "image/jpeg"; q = e + 1; if (!mime.includes("/")) mime = "image/" + mime.toLowerCase().replace("jpg", "jpeg"); }
      q += 1; // tipo de imagen
      const dEnd = strEnd(body, q, enc); q = dEnd + (enc === 1 || enc === 2 ? 2 : 1);
      if (q < body.length) out.picture = { mime, data: body.slice(q) };
    }
    p = stop;
  }
  return out;
}

/* ---------------- caché e integración con Sotos ---------------- */
const cache = new Map(); // `${id}:${mtime}` → Promise<{title,artist,album,year,cover}>
export function fallbackInfo(n) {
  if (n?.meta?.title) return { title: n.meta.title, artist: n.meta.artist || "Desconocido", album: n.meta.album || "" };
  const base = (n?.name || "").replace(/\.[^.]+$/, ""); const m = /^(.+?)\s+-\s+(.+)$/.exec(base);
  return m ? { title: m[2], artist: m[1], album: "" } : { title: base, artist: "Desconocido", album: "" };
}
/**
 * Info de una pista. Con `full` descarga si hace falta (la que suena);
 * sin `full` solo lee archivos que ya están en este navegador.
 */
export function trackInfo(n, full = false) {
  const base = fallbackInfo(n);
  if (!n || !(n.size > 0)) return Promise.resolve(base);
  const key = `${n.id}:${n.mtime}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    let blob = await vfs.cachedBlob(n.id);
    if (!blob && full) blob = await vfs.read(n.id).catch(() => null);
    if (!blob) { cache.delete(key); return base; }
    const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return base;
    const len = Math.min(10 + syncsafe(head, 6), 16 * 1024 * 1024);
    const tag = parseId3(await blob.slice(0, len).arrayBuffer()) || {};
    return {
      title: tag.title || base.title, artist: tag.artist || base.artist, album: tag.album || base.album, year: tag.year || "",
      cover: tag.picture ? URL.createObjectURL(new Blob([tag.picture.data], { type: tag.picture.mime })) : null,
    };
  })();
  cache.set(key, p);
  return p;
}
export function useTrackInfo(n, full = false) {
  const [info, setInfo] = useState(() => fallbackInfo(n));
  useEffect(() => { let live = true; setInfo(fallbackInfo(n)); if (n) trackInfo(n, full).then(i => live && setInfo(i)); return () => { live = false; }; }, [n?.id, n?.mtime, full]);
  return info;
}
