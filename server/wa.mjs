/* ============================================================
   Sotos — WhatsApp de cada cuenta (puente al servicio opcional
   services/whatsapp). El navegador nunca habla con ese servicio:
   pasa por aquí, que añade la cuenta y el secreto compartido.
     WA_URL     dirección del servicio (p. ej. http://127.0.0.1:8790)
     WA_SECRET  secreto compartido (si no, data/secrets.json → "wa")
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import http from "node:http";
import { secret } from "./db.mjs";
import { fail, json, readJson, rateLimit } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { userNode, blobPath } from "./fs.mjs";

const WA_URL = (process.env.WA_URL || "").replace(/\/$/, "");
const KEY = () => process.env.WA_SECRET || secret("wa");
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", wav: "audio/wav", pdf: "application/pdf", txt: "text/plain", zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };

// petición al servicio; con stream=true se reenvía la respuesta tal cual (SSE, archivos)
function call(user, route, { method = "GET", query = {}, body, res: pipeTo } = {}) {
  const u = new URL(`${WA_URL}/${route}`); u.searchParams.set("user", user); for (const [k, v] of Object.entries(query)) if (v != null) u.searchParams.set(k, v);
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((ok, bad) => {
    const rq = http.request(u, { method, headers: { "x-wa-secret": KEY(), ...(data ? { "content-type": "application/json", "content-length": data.length } : {}) }, timeout: pipeTo ? 0 : 120000 }, (r) => {
      if (pipeTo) {
        pipeTo.writeHead(r.statusCode, { "content-type": r.headers["content-type"] || "application/octet-stream", "cache-control": r.headers["cache-control"] || "no-store", ...(r.headers["content-length"] ? { "content-length": r.headers["content-length"] } : {}), "x-content-type-options": "nosniff" });
        r.pipe(pipeTo); pipeTo.on("close", () => { r.destroy(); rq.destroy(); }); return ok(null);
      }
      const parts = []; r.on("data", c => parts.push(c)); r.on("end", () => { let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch {} ok({ status: r.statusCode, body: j }); });
    });
    rq.on("timeout", () => rq.destroy(new Error("El servicio de WhatsApp no responde")));
    rq.on("error", () => bad(Object.assign(new Error("El servicio de WhatsApp no está en marcha"), { status: 503 })));
    if (data) rq.write(data); rq.end();
  });
}
const relay = async (res, user, route, opts) => { const r = await call(user, route, opts).catch(e => fail(e.status || 502, e.message)); return json(res, r.status, r.body); };

export async function handleWa(req, res, parts) {
  const u = requireUser(req);
  const [a] = parts; const url = new URL(req.url, "http://x"); const q = (k) => url.searchParams.get(k);
  if (!a && req.method === "GET") {
    if (!WA_URL) return json(res, 200, { enabled: false });
    const r = await call(u.id, "status").catch(() => null);
    return json(res, 200, { enabled: !!r, running: !!r, ...(r?.body || {}) });
  }
  if (!WA_URL) fail(503, "WhatsApp no está activado en este servidor");
  if (a === "events" && req.method === "GET") return call(u.id, "events", { res }).catch(e => fail(503, e.message));
  if (a === "media" && req.method === "GET") return call(u.id, "media", { query: { jid: q("jid"), id: q("id") }, res }).catch(e => fail(503, e.message));
  if (a === "status" && req.method === "GET") return relay(res, u.id, "status");
  if (a === "start" && req.method === "POST") { rateLimit("wastart:" + u.id, 20, 600_000); return relay(res, u.id, "start", { method: "POST" }); }
  if (a === "logout" && req.method === "POST") return relay(res, u.id, "logout", { method: "POST" });
  if (a === "chats" && req.method === "GET") return relay(res, u.id, "chats");
  if (a === "messages" && req.method === "GET") return relay(res, u.id, "messages", { query: { jid: q("jid"), before: q("before") } });
  if (a === "read" && req.method === "POST") { const b = await readJson(req, 4096); return relay(res, u.id, "read", { method: "POST", body: { jid: String(b.jid || "") } }); }
  if (a === "check" && req.method === "POST") { const b = await readJson(req, 1024); return relay(res, u.id, "check", { method: "POST", body: { phone: String(b.phone || "") } }); }
  if (a === "send" && req.method === "POST") {
    rateLimit("wasend:" + u.id, 120, 3600_000);
    const b = await readJson(req, 65536); const out = { jid: String(b.jid || ""), text: String(b.text || "").slice(0, 65000) };
    if (b.nodeId) { // adjuntar un archivo de Sotos
      const n = userNode(u.id, String(b.nodeId)); if (!n || n.children) fail(404, "Archivo no encontrado");
      const p = blobPath(u.id, n.id); if (!fs.existsSync(p)) fail(404, "El archivo aún no está en el servidor");
      const st = fs.statSync(p); if (st.size > 64 * 1024 * 1024) fail(413, "WhatsApp admite archivos de hasta 64 MB");
      const ext = (n.name.split(".").pop() || "").toLowerCase();
      out.media = { name: n.name, mime: MIME[ext] || "application/octet-stream", data: fs.readFileSync(p).toString("base64") };
    }
    return relay(res, u.id, "send", { method: "POST", body: out });
  }
  fail(404, "No encontrado");
}
