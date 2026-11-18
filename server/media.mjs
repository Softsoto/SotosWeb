/* ============================================================
   Sotos — preparar videos para el navegador (opcional, con ffmpeg)
   Los MKV y similares suelen traer audio AC3/E-AC3/DTS y subtítulos
   incrustados que los navegadores no reproducen. El servidor prepara
   el video UNA vez (copia la imagen sin recomprimir y convierte el
   audio a AAC) y lo guarda; después se sirve como un archivo normal,
   con descargas por partes: adelantar es instantáneo y audio, video y
   subtítulos van siempre juntos. Los subtítulos de texto salen como WebVTT.
     FFMPEG_PATH / FFPROBE_PATH  rutas (por defecto "ffmpeg" y "ffprobe" del PATH)
     SOTOS_MEDIA_CACHE_GB         espacio máximo para videos preparados (30)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fail, json } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { userNode, blobPath } from "./fs.mjs";
import { DATA_DIR } from "./db.mjs";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg", FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
let available = null;
const hasFfmpeg = () => available ??= [FFMPEG, FFPROBE].every(b => { try { return spawnSync(b, ["-version"], { windowsHide: true, timeout: 8000 }).status === 0; } catch { return false; } });

const COPY_VIDEO = new Set(["h264", "hevc", "vp9", "av1"]);           // se pueden copiar a MP4 tal cual
const BROWSER_AUDIO = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);
const TEXT_SUBS = new Set(["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"]);
const probes = new Map(); // id:mtime → resultado

/* ---------------- videos preparados (en disco, se reutilizan) ---------------- */
const CACHE = path.join(DATA_DIR, "media-cache"); fs.mkdirSync(CACHE, { recursive: true });
// fuera lo que no sea un video preparado completo (preparaciones a medias o temporales de versiones anteriores)
for (const f of fs.readdirSync(CACHE)) if (!/^[0-9a-z]+-[0-9a-z]+-\d+-a\d+\.mp4$/.test(f)) fs.rmSync(path.join(CACHE, f), { force: true });
const MAX_CACHE = Number(process.env.SOTOS_MEDIA_CACHE_GB || 30) * 1024 ** 3;
const jobs = new Map(); // archivo final → { progress, error, proc }
const outFor = (userId, node, a) => path.join(CACHE, `${userId}-${node.id}-${node.mtime || 0}-a${a}.mp4`);
function trimCache(keep) { // borra los preparados menos usados si se pasa del espacio máximo
  const files = fs.readdirSync(CACHE).filter(f => f.endsWith(".mp4")).map(f => { const p = path.join(CACHE, f), st = fs.statSync(p); return { p, size: st.size, at: st.atimeMs }; }).sort((x, y) => y.at - x.at);
  let total = 0; for (const f of files) { total += f.size; if (total > MAX_CACHE && f.p !== keep) fs.rm(f.p, { force: true }, () => {}); }
}
function prepare(out, file, info, a) {
  if (fs.existsSync(out)) return { ready: true, progress: 100 };
  let j = jobs.get(out); if (j) return j;
  const part = out + ".part";
  const copy = COPY_VIDEO.has(info.video.codec);
  const args = ["-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1", "-i", file, "-map", "0:v:0", ...(info.audio.length ? ["-map", `0:a:${a}`] : []),
    ...(copy ? ["-c:v", "copy", ...(info.video.codec === "hevc" ? ["-tag:v", "hvc1"] : [])] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]),
    ...(info.audio.length ? ["-c:a", "aac", "-ac", "2", "-b:a", "192k"] : []), "-sn", "-map_metadata", "-1", "-f", "mp4", "-y", part]; // sin faststart: el índice queda al final y el navegador lo lee por partes (prepara mucho más rápido)
  const p = spawn(FFMPEG, args, { windowsHide: true }); let err = "";
  j = { ready: false, progress: 0, error: null, proc: p };
  p.stdout.on("data", d => { const m = /out_time_us=(\d+)/.exec(String(d)); if (m && info.duration) j.progress = Math.min(99, Math.floor(Number(m[1]) / 1e6 / info.duration * 100)); });
  p.stderr.on("data", d => { if (err.length < 2000) err += d; });
  p.on("close", (code) => {
    if (code === 0 && fs.existsSync(part)) { fs.renameSync(part, out); j.ready = true; j.progress = 100; jobs.delete(out); trimCache(out); }
    else { j.error = "No se pudo preparar el video"; console.error("[media] ffmpeg:", err.slice(0, 400)); fs.rm(part, { force: true }, () => {}); setTimeout(() => jobs.delete(out), 30000); }
  });
  jobs.set(out, j); return j;
}

function probe(file) {
  return new Promise((ok, bad) => {
    const p = spawn(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { windowsHide: true });
    let out = ""; p.stdout.on("data", d => out += d); p.on("error", bad);
    const t = setTimeout(() => { p.kill(); bad(new Error("ffprobe tardó demasiado")); }, 30000);
    p.on("close", code => { clearTimeout(t); try { code === 0 ? ok(JSON.parse(out)) : bad(new Error("No se pudo leer el video")); } catch (e) { bad(e); } });
  });
}
function describe(pr, ext) {
  const s = pr.streams || [];
  const v = s.find(x => x.codec_type === "video" && !x.disposition?.attached_pic);
  const tag = (x) => ({ lang: x.tags?.language && x.tags.language !== "und" ? x.tags.language : null, title: x.tags?.title || null, default: !!x.disposition?.default });
  const audio = s.filter(x => x.codec_type === "audio").map((x, n) => ({ n, codec: x.codec_name, channels: x.channels || null, ...tag(x) }));
  const subs = s.filter(x => x.codec_type === "subtitle").map((x, n) => ({ n, codec: x.codec_name, text: TEXT_SUBS.has(x.codec_name), forced: !!x.disposition?.forced, ...tag(x) }));
  // ¿lo reproduce el navegador sin ayuda? (contenedor, video y la primera pista de audio; varias pistas: el servidor permite elegir)
  const native = ["mp4", "m4v", "webm", "mov"].includes(ext) && v && ["h264", "vp8", "vp9", "av1"].includes(v.codec_name) && (!audio.length || BROWSER_AUDIO.has(audio[0].codec)) && audio.length <= 1 && !subs.length;
  return { duration: Number(pr.format?.duration) || null, video: v ? { codec: v.codec_name, width: v.width, height: v.height } : null, audio, subs, native };
}

export async function handleMedia(req, res, parts) {
  const u = requireUser(req);
  const [id, action, n] = parts;
  const node = userNode(u.id, String(id || "")); if (!node || node.children) fail(404, "Archivo no encontrado");
  const file = blobPath(u.id, node.id); if (!fs.existsSync(file)) fail(404, "El archivo aún no está en el servidor");
  if (!hasFfmpeg()) { if (action === "info") return json(res, 200, { ffmpeg: false }); fail(501, "Este servidor no tiene ffmpeg para preparar el video"); }
  const key = node.id + ":" + (node.mtime || 0);
  if (!probes.has(key)) probes.set(key, probe(file).then(pr => describe(pr, (node.name.split(".").pop() || "").toLowerCase())).catch(e => { probes.delete(key); throw e; }));
  const info = await probes.get(key);
  if (action === "info" && req.method === "GET") return json(res, 200, { ffmpeg: true, ...info });

  const url = new URL(req.url, "http://x");
  const a = Math.max(0, Math.min(Number(url.searchParams.get("a") || 0), Math.max(0, info.audio.length - 1)));
  if (!info.video && action !== "subs") fail(415, "No es un video");
  const out = outFor(u.id, node, a);

  // preparar (o ver cómo va): { ready, progress, error }
  if (action === "prepare" && req.method === "POST") { const j = prepare(out, file, info, a); return json(res, 200, { ready: !!j.ready, progress: j.progress, error: j.error || null }); }
  if (action === "prepare" && req.method === "GET") { const j = fs.existsSync(out) ? { ready: true, progress: 100 } : jobs.get(out) || { ready: false, progress: 0 }; return json(res, 200, { ready: !!j.ready, progress: j.progress, error: j.error || null }); }

  // el video preparado, como un archivo normal con descargas por partes
  if (action === "file" && req.method === "GET") {
    if (!fs.existsSync(out)) fail(409, "El video aún se está preparando");
    const st = fs.statSync(out); const now = new Date(); fs.utimes(out, now, st.mtime, () => {});
    const base = { "content-type": "video/mp4", "accept-ranges": "bytes", "x-content-type-options": "nosniff", "cache-control": "private, max-age=86400" };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) { res.writeHead(416, { "content-range": `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...base, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
      return pipeline(fs.createReadStream(out, { start, end }), res).catch(() => {});
    }
    res.writeHead(200, { ...base, "content-length": st.size });
    return pipeline(fs.createReadStream(out), res).catch(() => {});
  }

  if (action === "subs" && req.method === "GET") {
    const sub = info.subs[Number(n)]; if (!sub) fail(404, "No existe esa pista de subtítulos");
    if (!sub.text) fail(415, "Esos subtítulos son imágenes (PGS/VobSub) y no se pueden convertir a texto");
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", file, "-map", `0:s:${Number(n)}`, "-f", "webvtt", "pipe:1"], { windowsHide: true });
    res.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" });
    p.stdout.pipe(res); req.on("close", () => { try { p.kill(); } catch {} });
    return;
  }
  fail(404, "No encontrado");
}
