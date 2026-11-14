/* ============================================================
   Sotos OS — utilidades HTTP mínimas (sin dependencias)
   © 2026 Sebastian Sotomontes
   ============================================================ */
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const fail = (status, msg) => { throw new HttpError(status, msg); };

export function json(res, status, data, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(data));
}
export function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > limit) { reject(new HttpError(413, "Contenido demasiado grande")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
export async function readJson(req, limit) {
  const b = await readBody(req, limit);
  try { return b.length ? JSON.parse(b.toString("utf8")) : {}; } catch { fail(400, "JSON no válido"); }
}
export function cookies(req) {
  const out = {}; (req.headers.cookie || "").split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
export const clientIp = (req) => (process.env.TRUST_PROXY ? (req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "") || req.socket.remoteAddress || "?";

/* límite de intentos por clave (login, registro) */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now(); const b = buckets.get(key) || { n: 0, reset: t + windowMs };
  if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
  b.n++; buckets.set(key, b);
  if (b.n > max) fail(429, `Demasiados intentos. Espera ${Math.ceil((b.reset - t) / 1000)} s.`);
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k); }, 60_000).unref();

/* JWT HS256 (ONLYOFFICE y enlaces firmados) */
import crypto from "node:crypto";
const b64u = (b) => Buffer.from(b).toString("base64url");
export function jwtSign(payload, key, ttlSec = 3600) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec };
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify(body));
  return `${h}.${p}.${crypto.createHmac("sha256", key).update(`${h}.${p}`).digest("base64url")}`;
}
export function jwtVerify(token, key) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) fail(401, "Token no válido");
  const want = crypto.createHmac("sha256", key).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, "base64url");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) fail(401, "Firma no válida");
  let header; try { header = JSON.parse(Buffer.from(h, "base64url")); } catch { fail(401, "Token no válido"); }
  if (header.alg !== "HS256") fail(401, "Algoritmo no permitido");
  const body = JSON.parse(Buffer.from(p, "base64url"));
  if (body.exp && body.exp < Date.now() / 1000) fail(401, "Token caducado");
  return body;
}
