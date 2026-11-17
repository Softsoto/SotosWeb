/* ============================================================
   Sotos — Navegador virtual (Neko)
   Un Firefox real corre en un contenedor y se transmite por WebRTC;
   sirve para las páginas que no se dejan mostrar dentro de otra web.
   Variables:
     NEKO_URL        dirección pública de Neko (p. ej. http://localhost:8098)
     NEKO_CONTAINER  nombre del contenedor Docker (para abrir direcciones; opcional)
     SOTOS_NEKO_PASS contraseña de la sala (si no, se deriva de data/secrets.json)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { execFile } from "node:child_process";
import { secret } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";

const NEKO_URL = (process.env.NEKO_URL || "").replace(/\/$/, "");
const CONTAINER = process.env.NEKO_CONTAINER || "";
const PASS = () => process.env.SOTOS_NEKO_PASS || secret("neko").slice(0, 24);
const busy = { t: 0 };

function openInNeko(url) {
  // la barra de direcciones de Firefox: Ctrl+T, escribir, Enter (Firefox corre con --no-remote)
  const script = `xdotool search --onlyvisible --class firefox windowactivate --sync %@ >/dev/null 2>&1; xdotool key --clearmodifiers ctrl+t; sleep 0.3; xdotool type --delay 6 -- "$1"; xdotool key Return`;
  return new Promise((res, rej) => execFile("docker", ["exec", "-u", "neko", "-e", "DISPLAY=:99.0", CONTAINER, "sh", "-c", script, "sh", url],
    { timeout: 20000, windowsHide: true }, (e) => e ? rej(new Error("No se pudo abrir la dirección en el navegador virtual")) : res()));
}

export async function handleNeko(req, res, parts) {
  const u = requireUser(req);
  if (!NEKO_URL) { if (req.method === "GET" && !parts[0]) return json(res, 200, { enabled: false }); fail(503, "El navegador virtual no está instalado en este servidor"); }
  if (req.method === "GET" && !parts[0]) return json(res, 200, { enabled: true, canOpen: !!CONTAINER });
  if (parts[0] === "session" && req.method === "POST") {
    // enlace de entrada a la sala; el nombre visible es el de la cuenta de Sotos
    const name = String(u.name || "Sotos").replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 30) || "Sotos";
    return json(res, 200, { url: `${NEKO_URL}/?usr=${encodeURIComponent(name)}&pwd=${encodeURIComponent(PASS())}` });
  }
  if (parts[0] === "open" && req.method === "POST") {
    if (!CONTAINER) fail(501, "Abre la dirección escribiéndola en el navegador virtual");
    const { url } = await readJson(req, 4096);
    let p; try { p = new URL(String(url)); } catch { fail(400, "Dirección no válida"); }
    if (!/^https?:$/.test(p.protocol)) fail(400, "Solo direcciones http o https");
    if (Date.now() - busy.t < 1500) fail(429, "Espera un momento");
    busy.t = Date.now();
    await openInNeko(p.href);
    return json(res, 200, { ok: true });
  }
  fail(404, "No encontrado");
}
