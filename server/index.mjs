/* ============================================================
   Sotos OS — servidor
   © 2026 Sebastian Sotomontes

   Desarrollo (:8787)
     /api/*  -> API (cuentas, archivos, compartir, ONLYOFFICE)
     resto   -> proxy del Navegador (px.mjs)
   Producción (NODE_ENV=production)
     Host = PX_HOST      -> solo proxy del Navegador (origen aislado)
     cualquier otro host -> API + escritorio compilado (web/dist)
   ============================================================ */
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleProxy } from "./px.mjs";

// si algo se escapa, queda escrito en data/errores.log y el servidor sigue en pie
const errLog = (kind, e) => { const line = `[${new Date().toISOString()}] ${kind}: ${e?.stack || e}\n`; console.error(line); try { fs.mkdirSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "data"), { recursive: true }); fs.appendFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "errores.log"), line); } catch {} };
process.on("uncaughtException", e => errLog("uncaughtException", e));
process.on("unhandledRejection", e => errLog("unhandledRejection", e));
process.on("exit", c => { if (c) errLog("exit", "código " + c); });
import { HttpError, json } from "./http.mjs";
import { handleAuth } from "./auth.mjs";
import { handleFs } from "./fs.mjs";
import { handleShares, handlePublicShare } from "./shares.mjs";
import { handleOO } from "./oo.mjs";
import { handleNotifications, handleContacts, handlePresence } from "./social.mjs";
import { handleInbox } from "./inbox.mjs";
import { handleAdmin } from "./admin.mjs";
import { handleCalendar, handleTasks } from "./agenda.mjs";
import { handleStore } from "./store.mjs";
import { handleMail } from "./mail.mjs";
import { handleNeko } from "./neko.mjs";
import { handleWa } from "./wa.mjs";
import { handleMedia } from "./media.mjs";
import { handleVault } from "./vault.mjs";
import { handleDav, handleDavKeys } from "./dav.mjs";
import { handleCalDav } from "./caldav.mjs";
import { handleApps, serveExtApp, serveSdk } from "./apps.mjs";
import { handlePublicDonations } from "./donaciones.mjs";
import { handleDescargas } from "./descargas.mjs";
import { handlePush } from "./push.mjs";
import { handleJellyfin, proxyJellyfin, upgradeJellyfin } from "./jellyfin.mjs";
import { handleImmich } from "./immich.mjs";
import { handleSetup, serveInstaller, serveTourImage, isInstalled } from "./setup.mjs";
import "./backup.mjs";      // copias de seguridad diarias
import "./maintenance.mjs"; // papelera automática y avisos de espacio
import { handleWorlds } from "./worlds.mjs";
import { currentVersion } from "./updates.mjs";

// prueba de arranque del actualizador: todos los módulos cargaron bien → salir sin abrir puertos
if (process.env.SOTOS_SMOKE === "1") { console.log("[sotos] arranque comprobado"); process.exit(0); }
const PORT = Number(process.env.PORT || 8787);
const PROD = process.env.NODE_ENV === "production";
const PX_HOST = (process.env.PX_HOST || "").toLowerCase();
const PX_PORT = Number(process.env.PX_PORT || 0);          // modo IP: proxy en un segundo puerto
const PX_PUBLIC = (process.env.PX_PUBLIC || "").replace(/\/$/, ""); // modo dominio: https://px.midominio
const HOST = process.env.HOST || (PROD ? "0.0.0.0" : "127.0.0.1"); // en desarrollo, solo este equipo

/* origen del proxy que verá el navegador (se inyecta en la página: una sola compilación sirve para todos los modos) */
function pxOriginFor(req) {
  if (PX_PUBLIC) return PX_PUBLIC;
  const host = String(req.headers.host || "localhost").split(":")[0];
  const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  if (PX_PORT) return `${proto}://${host}:${PX_PORT}`;
  if (PX_HOST) return `https://${PX_HOST}`;
  return `${proto}://${host}:${PORT}`;
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) out.push(a.address);
  return out;
}
const WEB_DIR = path.resolve(process.env.SOTOS_WEB || fileURLToPath(new URL("../web/dist", import.meta.url)));

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };
const SEC = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "permissions-policy": "geolocation=(), camera=(self), microphone=(self)" };

// lo que el escritorio necesita saber del servidor sin iniciar sesión (servicios opcionales propios)
const clientConfig = () => ({ drawio: (process.env.DRAWIO_URL || "").replace(/\/$/, "") || null });
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR)) { res.writeHead(400); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIR, "index.html"); // SPA
  if (!fs.existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Compila primero el escritorio: cd web && npm run build"); }
  const ext = path.extname(file);
  const headers = { "content-type": MIME[ext] || "application/octet-stream", "cache-control": rel.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache", ...SEC };
  if (path.basename(file) === "index.html") {
    const cfg = JSON.stringify({ pxOrigin: pxOriginFor(req), ...clientConfig() }).replace(/</g, "\\u003c");
    const html = fs.readFileSync(file, "utf8").replace("<head>", `<head><script>window.__SOTOS__=${cfg}</script>`);
    res.writeHead(200, headers); return res.end(html);
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res) {
  const parts = new URL(req.url, "http://x").pathname.split("/").filter(Boolean).slice(1); // sin "api"
  const [area, ...rest] = parts;
  // anti-CSRF: toda escritura desde el navegador lleva X-Sotos (los formularios ajenos no pueden ponerla)
  const signedByOO = area === "oo" && (rest[0] === "callback" || rest[0] === "file");
  if (!["GET", "HEAD"].includes(req.method) && !signedByOO && req.headers["x-sotos"] !== "1") return json(res, 403, { error: "Petición no permitida" });
  switch (area) {
    case "health": return json(res, 200, { ok: true, name: "Sotos OS", by: "Sebastian Sotomontes", version: currentVersion() });
    case "client-config": return json(res, 200, clientConfig());
    case "info": // direcciones para entrar desde otros equipos de la red (solo en el modo "este equipo")
      return json(res, 200, { port: PORT, lan: process.env.SOTOS_SHOW_LAN === "1" ? lanAddresses().map(ip => `http://${ip}:${PORT}`) : [] });
    case "auth": return handleAuth(req, res, rest[0]);
    case "fs": return handleFs(req, res, rest);
    case "shares": return handleShares(req, res, rest);
    case "s": return handlePublicShare(req, res, rest);
    case "apps": return handleApps(req, res, rest);
    case "donar": return handlePublicDonations(req, res);
    case "descargas": return handleDescargas(req, res, rest);
    case "oo": return handleOO(req, res, rest);
    case "notifications": return handleNotifications(req, res, rest);
    case "contacts": return handleContacts(req, res, rest);
    case "worlds": return handleWorlds(req, res, rest);
    case "inbox": return handleInbox(req, res, rest);
    case "presence": return handlePresence(req, res);
    case "admin": return handleAdmin(req, res, rest);
    case "calendar": return handleCalendar(req, res, rest);
    case "tasks": return handleTasks(req, res, rest);
    case "store": return handleStore(req, res, rest);
    case "mail": return handleMail(req, res, rest);
    case "neko": return handleNeko(req, res, rest);
    case "wa": return handleWa(req, res, rest);
    case "media": return handleMedia(req, res, rest);
    case "vault": return handleVault(req, res, rest);
    case "dav-keys": return handleDavKeys(req, res, rest);
    case "push": return handlePush(req, res, rest);
    case "jellyfin": return handleJellyfin(req, res, rest);
    case "immich": return handleImmich(req, res, rest);
    case "install": return handleSetup(req, res, rest);
  }
  return json(res, 404, { error: "No encontrado" });
}

const server = http.createServer(async (req, res) => {
  try {
    const host = String(req.headers.host || "").split(":")[0].toLowerCase();
    if (PROD && PX_HOST && host === PX_HOST) return await handleProxy(req, res);
    // instalador web: mientras Sotos no esté instalado, todo lleva al asistente
    if (req.url === "/instalar" || req.url.startsWith("/instalar?")) return serveInstaller(req, res);
    if (req.url.startsWith("/instalar/tour/")) return serveTourImage(req, res);
    if (!isInstalled() && !req.url.startsWith("/api/") && (req.headers.accept || "").includes("text/html")) { res.writeHead(302, { location: "/instalar" }); return res.end(); }
    if (req.url === "/dav" || req.url.startsWith("/dav/")) return await handleDav(req, res); // unidad de red (WebDAV)
    if (req.url.startsWith("/ext-apps/") && req.method === "GET") return serveExtApp(req, res); // apps del SDK (origen opaco)
    if (req.url.split("?")[0] === "/sdk/sotos-sdk.js") return serveSdk(req, res);
    if (req.url === "/cal" || req.url.startsWith("/cal/") || req.url.startsWith("/.well-known/caldav") || req.url.startsWith("/.well-known/carddav")) return await handleCalDav(req, res); // calendario y contactos (CalDAV/CardDAV)
    if (req.url === "/jellyfin" || req.url.startsWith("/jellyfin/")) return proxyJellyfin(req, res); // Cine
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    if (PROD) return serveStatic(req, res);
    if (req.url === "/favicon.ico" && !(req.headers.referer || "").includes("/px/")) { res.writeHead(204); return res.end(); }
    await handleProxy(req, res);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error("[sotos]", req.method, req.url, e);
    if (!res.headersSent) json(res, status, { error: status === 500 ? "Error interno" : e.message });
    else res.end();
  }
});
server.requestTimeout = 0; // subidas grandes
server.on("upgrade", (req, socket, head) => { if (req.url.startsWith("/jellyfin/")) return upgradeJellyfin(req, socket, head); socket.destroy(); });
server.listen(PORT, HOST, () => {
  console.log(`[sotos] escritorio en http://localhost:${PORT}${PROD ? " (producción)" : ""}`);
  if (process.env.SOTOS_SHOW_LAN === "1") lanAddresses().forEach(ip => console.log(`[sotos] desde otros equipos: http://${ip}:${PORT}`));
});

// proxy del Navegador en un puerto propio (origen aislado sin necesitar un dominio)
if (PX_PORT) {
  const px = http.createServer(async (req, res) => {
    try { await handleProxy(req, res); }
    catch (e) { console.error("[px]", e); if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  px.listen(PX_PORT, HOST, () => console.log(`[sotos] proxy del navegador en el puerto ${PX_PORT}`));
}
