/* ============================================================
   Sotos — preparar videos para el navegador (opcional, con ffmpeg)
   Los MKV y similares suelen traer audio AC3/E-AC3/DTS y subtítulos
   incrustados que los navegadores no reproducen. El servidor los
   prepara al vuelo: copia el video si el navegador lo entiende,
   convierte el audio a AAC estéreo y saca los subtítulos como WebVTT.
     FFMPEG_PATH / FFPROBE_PATH  rutas (por defecto "ffmpeg" y "ffprobe" del PATH)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { fail, json } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { userNode, blobPath } from "./fs.mjs";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg", FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
let available = null;
const hasFfmpeg = () => available ??= [FFMPEG, FFPROBE].every(b => { try { return spawnSync(b, ["-version"], { windowsHide: true, timeout: 8000 }).status === 0; } catch { return false; } });

const COPY_VIDEO = new Set(["h264", "hevc", "vp9", "av1"]);           // se pueden copiar a MP4 tal cual
const BROWSER_AUDIO = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);
const TEXT_SUBS = new Set(["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"]);
const probes = new Map(); // id:mtime → resultado

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
  // ¿lo reproduce el navegador sin ayuda? (contenedor, video y la primera pista de audio)
  const native = ["mp4", "m4v", "webm", "mov"].includes(ext) && v && ["h264", "vp8", "vp9", "av1"].includes(v.codec_name) && (!audio.length || BROWSER_AUDIO.has(audio[0].codec)) && audio.length <= 1 && !subs.length; // varias pistas: el servidor permite elegir
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
  const t = Math.max(0, Math.min(Number(url.searchParams.get("t") || 0), (info.duration || 1e9) - 1));
  if (action === "seek" && req.method === "GET") {
    // el video se copia sin recomprimir y solo puede empezar en un fotograma clave: se busca el anterior a "t"
    // para que video, audio y subtítulos arranquen en el mismo instante (si no, el audio queda corrido)
    if (t < 0.5) return json(res, 200, { k: 0 });
    const k = await new Promise((ok) => {
      const p = spawn(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries", "frame=pts_time,best_effort_timestamp_time", "-of", "csv=p=0",
        "-read_intervals", `${Math.max(0, t - 15).toFixed(2)}%${(t + 0.05).toFixed(2)}`, file], { windowsHide: true });
      let out = ""; p.stdout.on("data", d => out += d); const tm = setTimeout(() => { p.kill(); ok(t); }, 15000);
      p.on("close", () => { clearTimeout(tm); const ks = out.split(/\r?\n/).map(l => parseFloat(l.split(",").find(x => x && x !== "N/A"))).filter(x => isFinite(x) && x <= t + 0.01); ok(ks.length ? Math.max(...ks) : t); });
      p.on("error", () => ok(t));
    });
    return json(res, 200, { k: Math.max(0, Math.round(k * 1000) / 1000) });
  }
  const seek = t > 0 ? ["-ss", t.toFixed(3)] : [];
  if (action === "stream" && req.method === "GET") {
    if (!info.video) fail(415, "No es un video");
    const a = Math.max(0, Math.min(Number(url.searchParams.get("a") || 0), Math.max(0, info.audio.length - 1)));
    const copy = COPY_VIDEO.has(info.video.codec);
    const args = ["-hide_banner", "-loglevel", "error", ...seek, "-i", file, "-map", "0:v:0", ...(info.audio.length ? ["-map", `0:a:${a}`] : []),
      ...(copy ? ["-c:v", "copy", ...(info.video.codec === "hevc" ? ["-tag:v", "hvc1"] : [])] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p"]),
      ...(info.audio.length ? ["-c:a", "aac", "-ac", "2", "-b:a", "192k"] : []), "-sn", "-avoid_negative_ts", "make_zero",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-frag_duration", "2000000", "-f", "mp4", "pipe:1"]; // fragmentos de 2 s: arranca y salta más rápido
    const p = spawn(FFMPEG, args, { windowsHide: true });
    res.writeHead(200, { "content-type": "video/mp4", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    p.stdout.pipe(res); let err = ""; p.stderr.on("data", d => { if (err.length < 2000) err += d; });
    const stop = () => { try { p.kill("SIGKILL"); } catch {} };
    req.on("close", stop); res.on("close", stop);
    p.on("close", (code) => { if (code && code !== 255 && !res.writableEnded) console.error("[media] ffmpeg:", err.slice(0, 400)); res.end(); });
    return;
  }
  if (action === "subs" && req.method === "GET") {
    const sub = info.subs[Number(n)]; if (!sub) fail(404, "No existe esa pista de subtítulos");
    if (!sub.text) fail(415, "Esos subtítulos son imágenes (PGS/VobSub) y no se pueden convertir a texto");
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", ...seek, "-i", file, "-map", `0:s:${Number(n)}`, "-f", "webvtt", "pipe:1"], { windowsHide: true });
    res.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" });
    p.stdout.pipe(res); req.on("close", () => { try { p.kill(); } catch {} });
    return;
  }
  fail(404, "No encontrado");
}
