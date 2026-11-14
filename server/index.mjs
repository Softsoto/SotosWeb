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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleProxy } from "./px.mjs";
import { HttpError, json } from "./http.mjs";
import { handleAuth } from "./auth.mjs";
import { handleFs } from "./fs.mjs";
import { handleShares, handlePublicShare } from "./shares.mjs";
import { handleOO } from "./oo.mjs";

const PORT = Number(process.env.PORT || 8787);
const PROD = process.env.NODE_ENV === "production";
const PX_HOST = (process.env.PX_HOST || "").toLowerCase();
const WEB_DIR = path.resolve(process.env.SOTOS_WEB || fileURLToPath(new URL("../web/dist", import.meta.url)));

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };
const SEC = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "permissions-policy": "geolocation=(), camera=(self), microphone=(self)" };

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR)) { res.writeHead(400); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIR, "index.html"); // SPA
  if (!fs.existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Compila primero el escritorio: cd web && npm run build"); }
  const ext = path.extname(file);
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": rel.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache", ...SEC });
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res) {
  const parts = new URL(req.url, "http://x").pathname.split("/").filter(Boolean).slice(1); // sin "api"
  const [area, ...rest] = parts;
  // anti-CSRF: toda escritura desde el navegador lleva X-Sotos (los formularios ajenos no pueden ponerla)
  const signedByOO = area === "oo" && (rest[0] === "callback" || rest[0] === "file");
  if (!["GET", "HEAD"].includes(req.method) && !signedByOO && req.headers["x-sotos"] !== "1") return json(res, 403, { error: "Petición no permitida" });
  switch (area) {
    case "health": return json(res, 200, { ok: true, name: "Sotos OS", by: "Sebastian Sotomontes" });
    case "auth": return handleAuth(req, res, rest[0]);
    case "fs": return handleFs(req, res, rest);
    case "shares": return handleShares(req, res, rest);
    case "s": return handlePublicShare(req, res, rest);
    case "oo": return handleOO(req, res, rest);
  }
  return json(res, 404, { error: "No encontrado" });
}

const server = http.createServer(async (req, res) => {
  try {
    const host = String(req.headers.host || "").split(":")[0].toLowerCase();
    if (PROD && PX_HOST && host === PX_HOST) return await handleProxy(req, res);
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
server.listen(PORT, () => console.log(`[sotos] servidor en http://localhost:${PORT}${PROD ? " (producción)" : ""}`));
