/* ============================================================
   Sotos OS — cuentas y sesiones
   © 2026 Sebastian Sotomontes

   - contraseñas con scrypt + sal (N=2^15)
   - sesión = token aleatorio en cookie HttpOnly; en BD solo su SHA-256
   - registro/login con límite de intentos por IP y por correo
   ============================================================ */
import crypto from "node:crypto";
import { db, now, rid, getSetting } from "./db.mjs";
import { fail, json, readJson, cookies, clientIp, rateLimit } from "./http.mjs";

const SESSION_DAYS = 30;
const ENV_QUOTA_MB = Number(process.env.SOTOS_QUOTA_MB || 2048);
export const defaultQuota = () => Number(getSetting("defaultQuotaMb", ENV_QUOTA_MB)) * 1024 * 1024;
const COOKIE = "sotos_sid";
// Secure solo bajo HTTPS (directo o detrás de Caddy); por IP en la red local va sin Secure o el navegador la rechaza
const isHttps = (req) => !!req.socket.encrypted || (process.env.TRUST_PROXY && req.headers["x-forwarded-proto"] === "https");
const ENV_REGISTRATION = (process.env.SOTOS_REGISTRATION || "open").toLowerCase(); // open | closed
export const registration = () => getSetting("registration", ENV_REGISTRATION);

const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k)));
export async function hashPassword(pw) { const salt = crypto.randomBytes(16); return `s1$${salt.toString("base64")}$${(await scrypt(pw, salt)).toString("base64")}`; }
/** comprueba la contraseña de una cuenta (para confirmar acciones delicadas) */
export async function verifyPassword(userId, pw) { const r = db.prepare("SELECT pass FROM users WHERE id = ?").get(userId); return !!r && checkPassword(String(pw || ""), r.pass); }
async function checkPassword(pw, stored) {
  const [v, s, h] = String(stored).split("$"); if (v !== "s1") return false;
  const k = await scrypt(pw, Buffer.from(s, "base64")); const want = Buffer.from(h, "base64");
  return k.length === want.length && crypto.timingSafeEqual(k, want);
}
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, quota: u.quota, role: u.role || "user", hiddenApps: (() => { try { return JSON.parse(u.hidden_apps || "[]"); } catch { return []; } })() });

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const exp = now() + SESSION_DAYS * 86400_000;
  db.prepare("INSERT INTO sessions(hash,user_id,created,expires,agent) VALUES(?,?,?,?,?)").run(sha(token), userId, now(), exp, String(req.headers["user-agent"] || "").slice(0, 200));
  res.setHeader("set-cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? "; Secure" : ""}`);
}

/** usuario de la sesión o null */
export function currentUser(req) {
  const t = cookies(req)[COOKIE]; if (!t) return null;
  const row = db.prepare("SELECT u.* , s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ?").get(sha(t));
  if (!row || row.expires < now() || row.disabled) return null;
  // última actividad (como mucho una escritura por minuto)
  if (!row.last_seen || now() - row.last_seen > 60_000) { db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(now(), row.id); row.last_seen = now(); }
  return row;
}
export function requireUser(req) { const u = currentUser(req); if (!u) fail(401, "Inicia sesión"); return u; }

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export async function handleAuth(req, res, sub) {
  if (sub === "me" && req.method === "GET") return json(res, 200, { user: publicUser(currentUser(req)), registration: registration() });
  if (req.method !== "POST") fail(405, "Método no permitido");
  const ip = clientIp(req);

  if (sub === "register") {
    if (registration() === "closed") fail(403, "El registro está cerrado");
    // 5 cuentas nuevas por hora e IP en producción; en desarrollo no estorba a las pruebas
    rateLimit("reg:" + ip, Number(process.env.SOTOS_REG_LIMIT || (process.env.NODE_ENV === "production" ? 5 : 500)), 3600_000);
    const { email, name, password } = await readJson(req, 8192);
    const em = String(email || "").trim().toLowerCase();
    if (!EMAIL.test(em)) fail(400, "Correo no válido");
    const nm = String(name || "").trim().slice(0, 60); if (!nm) fail(400, "Escribe tu nombre");
    if (String(password || "").length < 8) fail(400, "La contraseña debe tener al menos 8 caracteres");
    if (String(password).length > 200) fail(400, "Contraseña demasiado larga");
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(em)) fail(409, "Ya existe una cuenta con ese correo");
    const id = rid(12);
    const first = !db.prepare("SELECT 1 FROM users LIMIT 1").get(); // la primera cuenta administra el servidor
    db.prepare("INSERT INTO users(id,email,name,pass,quota,created,role) VALUES(?,?,?,?,?,?,?)").run(id, em, nm, await hashPassword(password), defaultQuota(), now(), first ? "admin" : "user");
    startSession(req, res, id);
    return json(res, 201, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
  }
  if (sub === "login") {
    const { email, password } = await readJson(req, 8192);
    const em = String(email || "").trim().toLowerCase();
    rateLimit("login:" + ip, 20, 900_000); rateLimit("login:" + em, 8, 900_000);
    const u = db.prepare("SELECT * FROM users WHERE email = ?").get(em);
    // misma cantidad de trabajo exista o no el usuario (evita adivinar correos por tiempo)
    const ok = u ? await checkPassword(String(password || ""), u.pass) : (await hashPassword("x"), false);
    if (!ok) fail(401, "Correo o contraseña incorrectos");
    if (u.disabled) fail(403, "Esta cuenta está desactivada. Habla con el administrador.");
    startSession(req, res, u.id);
    return json(res, 200, { user: publicUser(u) });
  }
  if (sub === "logout") {
    const t = cookies(req)[COOKIE]; if (t) db.prepare("DELETE FROM sessions WHERE hash = ?").run(sha(t));
    res.setHeader("set-cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`);
    return json(res, 200, { ok: true });
  }
  if (sub === "password") {
    const u = requireUser(req); const { current, next } = await readJson(req, 8192);
    rateLimit("pw:" + u.id, 8, 900_000);
    if (!(await checkPassword(String(current || ""), u.pass))) fail(401, "La contraseña actual no es correcta");
    if (String(next || "").length < 8) fail(400, "La nueva contraseña debe tener al menos 8 caracteres");
    db.prepare("UPDATE users SET pass = ? WHERE id = ?").run(await hashPassword(next), u.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id); startSession(req, res, u.id); // cierra las demás sesiones
    return json(res, 200, { ok: true });
  }
  fail(404, "No encontrado");
}

setInterval(() => db.prepare("DELETE FROM sessions WHERE expires < ?").run(now()), 3600_000).unref();
