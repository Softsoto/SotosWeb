/* ============================================================
   Sotos — instalador web (como el de WordPress o Chevereto)
   Mientras Sotos no está instalado, cualquier visita va a /instalar: un asistente revisa los
   requisitos, configura el sitio, crea la cuenta administradora, fija las opciones y, si hay
   Docker, instala los servicios opcionales mostrando el avance en vivo.
   Seguridad: desde el propio equipo se instala directo; desde otra máquina se pide el código
   de instalación que el servidor muestra en su consola (así nadie se adueña de un servidor
   recién publicado). Al terminar, el asistente deja de existir.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { db, now, rid, DATA_DIR, getSetting, setSetting, secret } from "./db.mjs";
import { fail, json, readJson, clientIp } from "./http.mjs";
import { hashPassword, AVATARS } from "./auth.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PAGE = fileURLToPath(new URL("./instalador.html", import.meta.url));
const PREFIX = process.env.SOTOS_DOCKER_PREFIX || "sotos"; // nombre de los contenedores
const DEMO = process.env.SOTOS_SETUP_DEMO === "1"; // demostración: los servicios de Docker se simulan
const TOUR_DIR = path.join(ROOT, "docs", "capturas");
// instalaciones que ya existían (con cuentas) se dan por instaladas: el asistente no aparece
if (getSetting("installed") === null && db.prepare("SELECT 1 FROM users LIMIT 1").get()) setSetting("installed", { at: now(), by: "existente" });
export const isInstalled = () => !!getSetting("installed");
const CODE = crypto.randomInt(100000, 999999).toString().replace(/(\d{3})(\d{3})/, "$1-$2");
if (!isInstalled()) setTimeout(() => console.log(`\n[sotos] Sotos aún no está instalado. Abre la dirección del servidor en el navegador.\n[sotos] Código de instalación (solo se pide desde otro equipo): ${CODE}\n`), 300);

// archivo de configuración que lee este proceso (--env-file=…); si no hay, server/sotos.env
function envFile() {
  for (const a of process.execArgv) { const m = /^--env-file(?:-if-exists)?=(.+)$/.exec(a); if (m) return path.resolve(m[1]); }
  return path.join(ROOT, "server", "sotos.env");
}
function writeEnv(vars) {
  const f = envFile(); const lines = fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/) : [];
  const keys = new Set(Object.keys(vars)); const kept = lines.filter(l => !keys.has(l.split("=")[0].trim()) && l.trim() !== "");
  for (const [k, v] of Object.entries(vars)) if (v !== undefined && v !== null && v !== "") kept.push(`${k}=${v}`);
  fs.writeFileSync(f, kept.join("\n") + "\n", { mode: 0o600 }); return f;
}
const isLocal = (req) => { const ip = clientIp(req).replace(/^::ffff:/, ""); return ip === "127.0.0.1" || ip === "::1"; };
function guard(req) {
  if (isInstalled()) fail(410, "Sotos ya está instalado");
  if (!isLocal(req) && String(req.headers["x-setup-code"] || "").replace(/\D/g, "") !== CODE.replace(/\D/g, "")) fail(403, "Código de instalación incorrecto");
}
const run = (cmd, args, opts = {}) => new Promise((ok) => execFile(cmd, args, { timeout: opts.timeout || 15_000, windowsHide: true }, (e, out, err) => ok({ ok: !e, out: String(out || ""), err: String(err || e?.message || "") })));

/* ---------------- requisitos ---------------- */
async function requirements() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  let writable = true; try { fs.mkdirSync(DATA_DIR, { recursive: true }); const t = path.join(DATA_DIR, ".prueba"); fs.writeFileSync(t, "x"); fs.rmSync(t); } catch { writable = false; }
  let freeGb = null; try { const s = fs.statfsSync(DATA_DIR); freeGb = +(s.bavail * s.bsize / 1073741824).toFixed(1); } catch {}
  const docker = await run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  const ffmpeg = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]);
  const web = fs.existsSync(path.resolve(process.env.SOTOS_WEB || path.join(ROOT, "web/dist"), "index.html"));
  return [
    { id: "node", ok: nodeMajor >= 22, need: true, label: "Node.js 22 o superior", detail: `Tienes ${process.versions.node}` },
    { id: "data", ok: writable, need: true, label: "Carpeta de datos con permiso de escritura", detail: DATA_DIR },
    { id: "disk", ok: freeGb === null || freeGb >= 2, need: true, label: "Espacio libre en disco", detail: freeGb === null ? "No se pudo medir" : `${freeGb} GB libres` },
    { id: "web", ok: web || process.env.NODE_ENV !== "production", need: false, label: "Escritorio compilado (web/dist)", detail: web ? "Listo" : "En desarrollo lo sirve Vite; para producción: cd web && npm run build" },
    { id: "docker", ok: docker.ok, need: false, label: "Docker (para los servicios opcionales)", detail: docker.ok ? `Docker ${docker.out.trim()}` : "No disponible: Sotos funciona igual, sin Office completo, Cine ni Fotos" },
    { id: "ffmpeg", ok: ffmpeg.ok, need: false, label: "ffmpeg (películas MKV con audio AC3/DTS y subtítulos)", detail: ffmpeg.ok ? ffmpeg.out.split("\n")[0].slice(0, 60) : "No encontrado: los MKV con esos audios no se podrán preparar" },
    { id: "os", ok: true, need: false, label: "Sistema", detail: `${os.type()} ${os.release()} · ${os.cpus().length} núcleos · ${Math.round(os.totalmem() / 1073741824)} GB de memoria` },
  ];
}

/* ---------------- dónde corre Sotos (para proponer la opción y los valores) ---------------- */
function detectTarget() {
  const has = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
  if (has("/etc/synoinfo.conf") || has("/etc.defaults/synoinfo.conf") || /synology/i.test(read("/proc/version"))) return "synology";
  if (has("/etc/config/qpkg.conf") || has("/etc/unraid-version") || /truenas|freenas/i.test(read("/etc/version")) || has("/usr/builtin/etc/asustor")) return "nas";
  if (process.platform === "win32" || process.platform === "darwin") return "computer";
  if (has("/.dockerenv")) return "nas"; // contenedor en Linux: normalmente un NAS o un servidor casero
  return os.networkInterfaces && Object.values(os.networkInterfaces()).flat().some(i => i && !i.internal && i.family === "IPv4" && !/^(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(i.address)) ? "hosting" : "computer";
}
const lanIps = () => Object.values(os.networkInterfaces()).flat().filter(i => i && !i.internal && i.family === "IPv4").map(i => i.address);

/* ---------------- servicios opcionales (Docker) ---------------- */
// cada servicio devuelve las variables de entorno que Sotos necesita para usarlo
function dockerRun(name, args, log) {
  return new Promise((ok, bad) => {
    log(`docker run ${name}…`);
    const rm = spawn("docker", ["rm", "-f", name], { windowsHide: true }); rm.on("close", () => {
      const p = spawn("docker", ["run", "-d", "--name", name, "--restart", "unless-stopped", ...args], { windowsHide: true });
      let err = ""; p.stderr.on("data", d => { err += d; const l = String(d).trim().split("\n").pop(); if (/Pulling|Download|Extract|Pull complete|Status/i.test(l)) log(l.slice(0, 120)); });
      p.on("close", c => c === 0 ? ok() : bad(new Error(err.trim().split("\n").pop() || "docker run falló")));
    });
  });
}
const pull = (image, log) => new Promise((ok) => { log(`Descargando ${image} (puede tardar varios minutos)…`); const p = spawn("docker", ["pull", image], { windowsHide: true }); let last = 0;
  p.stdout.on("data", d => { const l = String(d).trim().split("\n").pop(); if (Date.now() - last > 1500) { last = Date.now(); log(l.slice(0, 120)); } }); p.on("close", () => ok()); });
const SERVICES = {
  office: async (o, log) => {
    const image = o.officeEngine === "onlyoffice" ? "onlyoffice/documentserver:9.1.0" : "ghcr.io/euro-office/documentserver:v9.3.1";
    await pull(image, log);
    await dockerRun(`${PREFIX}-docs`, ["-p", `${o.ports.office}:80`, "--add-host=host.docker.internal:host-gateway", "-e", "JWT_ENABLED=true", "-e", `JWT_SECRET=${secret("oo_jwt")}`, "-e", "JWT_HEADER=Authorization", "-e", "ALLOW_PRIVATE_IP_ADDRESS=true", "-e", "ALLOW_META_IP_ADDRESS=true", image], log);
    return { OO_URL: `${o.base}:${o.ports.office}`, SOTOS_INTERNAL: `http://host.docker.internal:${o.port}`, OO_ENGINE: o.officeEngine === "onlyoffice" ? "onlyoffice" : "eurooffice" };
  },
  drawio: async (o, log) => { const image = "jgraph/drawio:32.6.9"; await pull(image, log); await dockerRun(`${PREFIX}-drawio`, ["-p", `${o.ports.drawio}:8080`, image], log); return { DRAWIO_URL: `${o.base}:${o.ports.drawio}` }; },
  neko: async (o, log) => {
    const image = "ghcr.io/m1k1o/neko/firefox:3.0.8", pass = secret("neko").slice(0, 24); await pull(image, log);
    const nat = /^\d+\.\d+\.\d+\.\d+$/.test(o.host) ? o.host : "127.0.0.1";
    await dockerRun(`${PREFIX}-neko`, ["--shm-size=2g", "-p", `${o.ports.neko}:8080`, "-p", "52000-52020:52000-52020/udp", "-e", "NEKO_DESKTOP_SCREEN=1600x900@30", "-e", "NEKO_MEMBER_PROVIDER=multiuser", "-e", `NEKO_MEMBER_MULTIUSER_USER_PASSWORD=${pass}`, "-e", `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=${pass}`, "-e", "NEKO_WEBRTC_EPR=52000-52020", "-e", "NEKO_WEBRTC_ICELITE=1", "-e", `NEKO_WEBRTC_NAT1TO1=${nat}`, image], log);
    return { NEKO_URL: `${o.base}:${o.ports.neko}`, NEKO_CONTAINER: `${PREFIX}-neko` };
  },
  jellyfin: async (o, log) => {
    const image = "jellyfin/jellyfin:10.10.7", cfg = path.join(DATA_DIR, "servicios", "jellyfin", "config"), cache = path.join(DATA_DIR, "servicios", "jellyfin", "cache"), bib = path.join(DATA_DIR, "biblioteca");
    for (const d of [path.join(cfg, "config"), cache, bib]) fs.mkdirSync(d, { recursive: true });
    const net = path.join(cfg, "config", "network.xml");
    if (!fs.existsSync(net)) fs.writeFileSync(net, `<?xml version="1.0" encoding="utf-8"?>\n<NetworkConfiguration xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <BaseUrl>/jellyfin</BaseUrl>\n</NetworkConfiguration>\n`);
    await pull(image, log);
    await dockerRun(`${PREFIX}-jellyfin`, ["-p", `127.0.0.1:${o.ports.jellyfin}:8096`, "-v", `${cfg}:/config`, "-v", `${cache}:/cache`, "-v", `${bib}:/media:ro`, image], log);
    return { JELLYFIN_URL: `http://127.0.0.1:${o.ports.jellyfin}` };
  },
  immich: async (o, log) => {
    const v = "v3.4.1", dir = path.join(DATA_DIR, "servicios", "immich"), bib = path.join(DATA_DIR, "biblioteca"); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(bib, { recursive: true });
    for (const f of ["docker-compose.yml", "example.env"]) { log(`Descargando ${f} de Immich ${v}…`); const r = await fetch(`https://github.com/immich-app/immich/releases/download/${v}/${f}`); if (!r.ok) throw new Error(`No se pudo descargar ${f}`); fs.writeFileSync(path.join(dir, f), Buffer.from(await r.arrayBuffer())); }
    const envf = path.join(dir, ".env");
    if (!fs.existsSync(envf)) fs.writeFileSync(envf, `UPLOAD_LOCATION=./library\nDB_DATA_LOCATION=./postgres\nTZ=${o.tz || "UTC"}\nIMMICH_VERSION=${v}\nDB_PASSWORD=${crypto.randomBytes(18).toString("hex")}\nDB_USERNAME=postgres\nDB_DATABASE_NAME=immich\n`);
    fs.writeFileSync(path.join(dir, "docker-compose.override.yml"), `services:\n  immich-server:\n    ports: !override\n      - '127.0.0.1:${o.ports.immich}:2283'\n    volumes:\n      - ${bib.replace(/\\/g, "/")}:/mnt/sotos:ro\n  database:\n    volumes: !override\n      - immich-db:/var/lib/postgresql/data\nvolumes:\n  immich-db:\n`);
    log("Arrancando Immich (servidor, aprendizaje automático, Redis y Postgres; la primera vez descarga varios GB)…");
    await new Promise((ok, bad) => { const p = spawn("docker", ["compose", "-p", `${PREFIX}-immich`, "up", "-d"], { cwd: dir, windowsHide: true }); let last = 0, err = "";
      p.stderr.on("data", d => { err += d; const l = String(d).trim().split("\n").pop(); if (Date.now() - last > 2000) { last = Date.now(); log(l.slice(0, 120)); } }); p.on("close", c => c === 0 ? ok() : bad(new Error(err.trim().split("\n").pop() || "docker compose falló"))); });
    return { IMMICH_URL: `http://127.0.0.1:${o.ports.immich}` };
  },
};

/* ---------------- reinicio para leer la configuración nueva ---------------- */
export function restart() {
  setTimeout(() => {
    if (process.env.INVOCATION_ID || process.env.SOTOS_SUPERVISED) process.exit(0); // systemd u otro supervisor lo vuelve a levantar
    const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { cwd: process.cwd(), detached: true, stdio: "inherit", windowsHide: false });
    child.unref(); process.exit(0);
  }, 1200);
}

export async function handleSetup(req, res, parts) {
  const [a] = parts;
  if (a === "status" && req.method === "GET") return json(res, 200, { installed: isInstalled(), local: isLocal(req), site: getSetting("siteName", "Sotos") });
  guard(req);
  if (a === "check" && req.method === "POST") return json(res, 200, { ok: true });
  if (a === "requirements" && req.method === "GET") return json(res, 200, { target: detectTarget(), platform: process.platform, memGb: Math.round(os.totalmem() / 1073741824), ips: lanIps(), container: fs.existsSync("/.dockerenv"), demo: DEMO, db: { engine: "SQLite " + (process.versions.sqlite || ""), file: path.join(DATA_DIR, "sotos.db"), blobs: path.join(DATA_DIR, "blobs") }, items: await requirements(), env: envFile(), data: DATA_DIR, port: Number(process.env.PORT || 8787), host: String(req.headers.host || "").split(":")[0], tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (a === "install" && req.method === "POST") {
    const b = await readJson(req, 64 * 1024);
    const name = String(b.adminName || "").trim().slice(0, 60), email = String(b.adminEmail || "").trim().toLowerCase(), pw = String(b.adminPassword || "");
    if (!name) fail(400, "Escribe tu nombre"); if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) fail(400, "Correo no válido"); if (pw.length < 8) fail(400, "La contraseña debe tener al menos 8 caracteres");
    if ((await requirements()).some(r => r.need && !r.ok)) fail(400, "Faltan requisitos obligatorios");
    // respuesta en vivo: una línea JSON por paso
    res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
    const send = (o) => res.write(JSON.stringify(o) + "\n"); const log = (msg) => send({ log: msg });
    try {
      const host = String(b.host || String(req.headers.host || "localhost").split(":")[0]).trim(); const port = Number(process.env.PORT || 8787);
      const o = { ...b, host, port, base: `http://${host}`, tz: b.timeZone, ports: { office: 8099, drawio: 8097, neko: 8098, jellyfin: 8096, immich: 2283, ...(b.ports || {}) } };
      send({ step: "cuenta", msg: "Creando la cuenta administradora" });
      if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) fail(409, "Ya existe una cuenta con ese correo");
      const quotaMb = Math.max(100, Math.min(10_000_000, Number(b.adminQuotaMb || 51200)));
      db.prepare("INSERT INTO users(id,email,name,pass,quota,created,role,avatar) VALUES(?,?,?,?,?,?,?,?)").run(rid(12), email, name, await hashPassword(pw), quotaMb * 1048576, now(), "admin", "def:" + AVATARS[crypto.randomInt(AVATARS.length)]);
      send({ step: "opciones", msg: "Guardando las opciones" });
      setSetting("siteName", String(b.siteName || "Sotos").trim().slice(0, 60) || "Sotos");
      setSetting("registration", b.registration === "open" ? "open" : "closed");
      setSetting("defaultQuotaMb", Math.max(10, Math.min(10_000_000, Number(b.defaultQuotaMb || 2048))));
      if (b.lang === "en" || b.lang === "es") setSetting("defaultLang", b.lang);
      if (["computer", "hosting", "synology", "nas"].includes(b.target)) setSetting("deployTarget", b.target);
      // en un computador con Windows: arrancar Sotos al iniciar sesión, sin ventana
      if (b.target === "computer" && b.autostart && process.platform === "win32" && !DEMO) {
        try {
          const dir = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
          const args = [...process.execArgv.filter(x => !/^--watch/.test(x)), ...process.argv.slice(1)].map(x => `""${x}""`).join(" ");
          fs.writeFileSync(path.join(dir, "Sotos.vbs"), `CreateObject("WScript.Shell").Run """${process.execPath}"" ${args}", 0, False\r\n`);
          log("Sotos arrancará solo al iniciar sesión en este equipo");
        } catch (e) { log("No se pudo configurar el arranque automático: " + e.message); }
      }
      const env = {
        SOTOS_VAULT_ADMIN: b.vaultAdmin ? "1" : "0", SOTOS_TRASH_DAYS: String(Math.max(0, Number(b.trashDays ?? 30))), SOTOS_MAX_FILE_MB: String(Math.max(16, Number(b.maxFileMb || 51200))),
        SOTOS_BACKUP_HOUR: b.backups === false ? "off" : String(Math.max(0, Math.min(23, Number(b.backupHour ?? 3)))), SOTOS_BACKUP_DIR: b.backupDir || undefined, TZ: b.timeZone || undefined,
      };
      const services = (b.services || []).filter(s => SERVICES[s]);
      for (const s of services) {
        send({ step: "servicio", service: s, msg: `Instalando ${s}` });
        if (DEMO) { for (const t of ["Descargando la imagen…", "Extrayendo capas…", "Creando el contenedor…", "Arrancando…"]) { log(`[demostración] ${t}`); await new Promise(r => setTimeout(r, 1800)); } send({ service: s, done: true }); continue; }
        try { Object.assign(env, await SERVICES[s](o, log)); send({ service: s, done: true }); }
        catch (e) { send({ service: s, error: e.message }); log(`No se pudo instalar ${s}: ${e.message}. Puedes instalarlo después desde scripts/.`); }
      }
      const f = writeEnv(env); log(`Configuración guardada en ${f}`);
      setSetting("installed", { at: now(), by: email });
      send({ step: "listo", msg: "Sotos está instalado", restart: true });
      res.end(); if (!DEMO) restart();
    } catch (e) { send({ error: e.message }); res.end(); }
    return;
  }
  fail(404, "No encontrado");
}

/** capturas reales para el tour del asistente (solo las de docs/capturas) */
export function serveTourImage(req, res) {
  const name = decodeURIComponent(req.url.split("/").pop().split("?")[0]);
  const f = path.join(TOUR_DIR, name);
  if (!/^[a-z0-9-]+\.(jpg|png)$/.test(name) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": name.endsWith(".png") ? "image/png" : "image/jpeg", "cache-control": "public, max-age=86400" }); fs.createReadStream(f).pipe(res);
}
/** página del asistente (y redirección a ella mientras no esté instalado) */
export function serveInstaller(req, res) {
  if (isInstalled()) { res.writeHead(302, { location: "/" }); return res.end(); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:" });
  fs.createReadStream(PAGE).pipe(res);
}
