/* ============================================================
   Sotos — Fotos (Immich): tus fotos y videos por fecha y lugar, con caras, búsqueda inteligente y recuerdos
   Immich (AGPL-3.0) corre en sus contenedores (scripts/immich-dev.ps1). Sotos:
   · crea la cuenta administradora de Immich y la da por configurada,
   · crea una cuenta de Immich por persona, con una biblioteca externa de SOLO LECTURA apuntando
     a sus fotos y videos de Sotos (las fotos nunca se copian ni se modifican),
   · entra por ella: Immich no admite subrutas, así que se abre en su propio puerto del mismo equipo,
     y la sesión se entrega con las cookies de Immich (las cookies no distinguen puertos).
   IMMICH_URL          dirección interna, p. ej. http://127.0.0.1:2283
   IMMICH_PUBLIC       dirección que abre el navegador (por defecto: el mismo nombre de equipo que Sotos, puerto 2283)
   IMMICH_COOKIE_DOMAIN dominio para la cookie si Immich vive en otro subdominio (p. ej. .midominio.com)
   IMMICH_MEDIA        ruta de la biblioteca dentro del contenedor (por defecto /mnt/sotos)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import { db, now, secret } from "./db.mjs";
import { fail, json } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { enableLibrary, onLibraryChange } from "./library.mjs";

const IM = (process.env.IMMICH_URL || "").replace(/\/$/, "");
const MEDIA = process.env.IMMICH_MEDIA || "/mnt/sotos";
db.exec(`CREATE TABLE IF NOT EXISTS immich_users (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, im_id TEXT NOT NULL, email TEXT NOT NULL, pw TEXT NOT NULL, lib_id TEXT, created INTEGER NOT NULL)`);
const key = () => crypto.createHash("sha256").update("sotos-immich:" + secret("immich_key")).digest();
const enc = (t) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv); const d = Buffer.concat([c.update(t, "utf8"), c.final()]); return [iv, d, c.getAuthTag()].map(x => x.toString("base64")).join("."); };
const dec = (s) => { const [iv, d, tag] = s.split(".").map(x => Buffer.from(x, "base64")); const c = crypto.createDecipheriv("aes-256-gcm", key(), iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString("utf8"); };

async function im(method, p, body, token, raw) {
  const r = await fetch(IM + "/api" + p, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  if (raw) return r;
  const t = await r.text(); if (!r.ok) throw Object.assign(new Error(`Immich ${r.status} ${p}: ${t.slice(0, 200)}`), { status: r.status });
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}

let adminTok = null, setupP = null;
const ADMIN = "admin@sotos.local";
async function admin() {
  if (adminTok) return adminTok;
  return setupP || (setupP = (async () => {
    const pw = secret("immich_admin");
    const cfg = await im("GET", "/server/config");
    if (!cfg.isInitialized) await im("POST", "/auth/admin-sign-up", { email: ADMIN, password: pw, name: "Sotos" });
    const a = await im("POST", "/auth/login", { email: ADMIN, password: pw });
    if (!cfg.isOnboarded) await im("POST", "/system-metadata/admin-onboarding", { isOnboarded: true }, a.accessToken).catch(() => {});
    adminTok = a.accessToken; return adminTok;
  })().finally(() => { setupP = null; }));
}

async function ensureUser(u) {
  const tok = await admin();
  let row = db.prepare("SELECT * FROM immich_users WHERE user_id = ?").get(u.id);
  if (!row) {
    const email = `${u.id}@sotos.local`, pw = crypto.randomBytes(18).toString("base64url");
    const existing = (await im("GET", "/admin/users", null, tok)).find(x => x.email === email);
    const user = existing || await im("POST", "/admin/users", { email, password: pw, name: u.name, shouldChangePassword: false, notify: false }, tok);
    if (existing) await im("PUT", `/admin/users/${existing.id}`, { password: pw, shouldChangePassword: false }, tok);
    db.prepare("INSERT OR REPLACE INTO immich_users(user_id,im_id,email,pw,created) VALUES(?,?,?,?,?)").run(u.id, user.id, email, enc(pw), now());
    row = db.prepare("SELECT * FROM immich_users WHERE user_id = ?").get(u.id);
  }
  // biblioteca externa de solo lectura con sus fotos y videos de Sotos
  if (!row.lib_id) {
    const lib = await im("POST", "/libraries", { ownerId: row.im_id, name: "Sotos", importPaths: [`${MEDIA}/${u.id}/Fotos`, `${MEDIA}/${u.id}/Videos`] }, tok);
    db.prepare("UPDATE immich_users SET lib_id = ? WHERE user_id = ?").run(lib.id, u.id); row.lib_id = lib.id;
    await im("POST", `/libraries/${lib.id}/scan`, {}, tok).catch(() => {});
  }
  return row;
}

// fotos nuevas, movidas o borradas en Sotos → Immich vuelve a escanear la biblioteca de esa persona
const scanT = new Map();
onLibraryChange((uid) => {
  if (!IM) return; clearTimeout(scanT.get(uid));
  scanT.set(uid, setTimeout(async () => { scanT.delete(uid); try { const r = db.prepare("SELECT lib_id FROM immich_users WHERE user_id = ?").get(uid); if (r?.lib_id) await im("POST", `/libraries/${r.lib_id}/scan`, {}, await admin()); } catch (e) { console.error("[immich]", e.message); } }, 3000));
});

export async function handleImmich(req, res, parts) {
  const [a] = parts;
  if (a === "status") return json(res, 200, { enabled: !!IM });
  const u = requireUser(req);
  if (!IM) fail(503, "Fotos (Immich) no está activado en este servidor");
  if (a === "session" && req.method === "POST") {
    enableLibrary(u.id, "immich");
    const row = await ensureUser(u);
    const r = await im("POST", "/auth/login", { email: row.email, password: dec(row.pw) }, null, true);
    if (!r.ok) fail(502, "Immich no aceptó la sesión");
    const s = await r.json();
    if (!s.isOnboarded) await im("PUT", "/users/me/onboarding", { isOnboarded: true }, s.accessToken).catch(() => {});
    // la sesión de Immich se entrega con sus propias cookies (válidas para el mismo equipo en otro puerto)
    const dom = process.env.IMMICH_COOKIE_DOMAIN ? `; Domain=${process.env.IMMICH_COOKIE_DOMAIN}` : "";
    const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    res.setHeader("set-cookie", [
      `immich_access_token=${s.accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${dom}${secure}`,
      `immich_auth_type=password; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${dom}${secure}`,
      `immich_is_authenticated=true; Path=/; SameSite=Lax; Max-Age=${30 * 86400}${dom}${secure}`,
    ]);
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(":")[0];
    const pub = (process.env.IMMICH_PUBLIC || `http://${host}:2283`).replace(/\/$/, "");
    return json(res, 200, { url: pub + "/photos" });
  }
  fail(404, "No encontrado");
}
