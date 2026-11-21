/* ============================================================
   Sotos OS — cuentas y sesiones
   © 2026 Sebastian Sotomontes

   - contraseñas con scrypt + sal (N=2^15)
   - sesión = token aleatorio en cookie HttpOnly; en BD solo su SHA-256
   - registro/login con límite de intentos por IP y por correo
   ============================================================ */
import crypto from "node:crypto";
import { db, now, rid, getSetting, secret } from "./db.mjs";
import { fail, json, readJson, cookies, clientIp, rateLimit, jwtSign, jwtVerify } from "./http.mjs";
import { totpEnabled, totpSetup, totpEnable, totpDisable, totpCheck, recoveryLeft } from "./totp.mjs";
import { sysMailConfig, sendSystemMail, publicUrl } from "./mail.mjs";

// recuperar contraseña: enlace de un solo uso, 30 minutos; en la BD solo su SHA-256
db.exec("CREATE TABLE IF NOT EXISTS password_resets (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, expires INTEGER NOT NULL)");
export const canRecover = () => !!(sysMailConfig() && publicUrl());
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);

const SESSION_DAYS = 30;
// foto de perfil: uno de los avatares por defecto ("def:perro"…) o una imagen subida (data URL pequeña)
export const AVATARS = ["perro", "gato", "persona", "balon", "musica"];
if (!db.prepare("PRAGMA table_info(users)").all().some(c => c.name === "avatar")) db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
{ const pick = db.prepare("UPDATE users SET avatar = ? WHERE id = ?"); for (const r of db.prepare("SELECT id FROM users WHERE avatar IS NULL").all()) pick.run("def:" + AVATARS[crypto.randomInt(AVATARS.length)], r.id); }
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
export async function checkPassword(pw, stored) {
  const [v, s, h] = String(stored).split("$"); if (v !== "s1") return false;
  const k = await scrypt(pw, Buffer.from(s, "base64")); const want = Buffer.from(h, "base64");
  return k.length === want.length && crypto.timingSafeEqual(k, want);
}
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, quota: u.quota, role: u.role || "user", avatar: u.avatar || null, twoFactor: !!u.totp_on, hiddenApps: (() => { try { return JSON.parse(u.hidden_apps || "[]"); } catch { return []; } })() });

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
  if (sub === "me" && req.method === "GET") return json(res, 200, { user: publicUser(currentUser(req)), registration: registration(), canRecover: canRecover() });
  if (sub === "2fa" && req.method === "GET") { const u = requireUser(req); return json(res, 200, { enabled: totpEnabled(u.id), recoveryLeft: totpEnabled(u.id) ? recoveryLeft(u.id) : 0 }); }
  if (sub === "avatar" && req.method === "PUT") {
    const u = requireUser(req); const { avatar, password } = await readJson(req, 600 * 1024);
    rateLimit("perfil:" + u.id, 10, 900_000);
    if (!(await verifyPassword(u.id, password))) fail(403, "Contraseña incorrecta"); // cambiar el perfil pide permiso
    const v = String(avatar || "");
    if (!(v.startsWith("def:") && AVATARS.includes(v.slice(4))) && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) fail(400, "Imagen no válida");
    if (v.length > 400 * 1024) fail(413, "La imagen es muy grande");
    db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(v, u.id); return json(res, 200, { ok: true, avatar: v });
  }
  if (sub === "name" && req.method === "PUT") {
    const u = requireUser(req); const { name, password } = await readJson(req, 4096);
    rateLimit("perfil:" + u.id, 10, 900_000);
    if (!(await verifyPassword(u.id, password))) fail(403, "Contraseña incorrecta");
    const nm = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60); if (!nm) fail(400, "Escribe tu nombre");
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(nm, u.id); return json(res, 200, { ok: true, name: nm });
  }
  if (req.method !== "POST") fail(405, "Método no permitido");
  const ip = clientIp(req);

  if (sub === "register") {
    if (registration() === "closed") fail(403, "El registro está cerrado");
    if (getSetting("installed") === null && !db.prepare("SELECT 1 FROM users LIMIT 1").get()) fail(409, "Sotos aún no está instalado: termina el asistente en /instalar"); // nadie se adueña del servidor por el registro
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
    db.prepare("INSERT INTO users(id,email,name,pass,quota,created,role,avatar) VALUES(?,?,?,?,?,?,?,?)").run(id, em, nm, await hashPassword(password), defaultQuota(), now(), first ? "admin" : "user", "def:" + AVATARS[crypto.randomInt(AVATARS.length)]);
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
    // verificación en dos pasos: todavía no hay sesión; se entrega un pase de 5 minutos para el código
    if (u.totp_on) return json(res, 200, { need2fa: true, ticket: jwtSign({ u: u.id, k: "2fa" }, secret("auth_2fa"), 300) });
    startSession(req, res, u.id);
    return json(res, 200, { user: publicUser(u) });
  }
  if (sub === "forgot") { // pide el enlace; la respuesta es la misma exista o no la cuenta
    const { email } = await readJson(req, 4096); const em = String(email || "").trim().toLowerCase();
    rateLimit("forgot:" + ip, 10, 3600_000); rateLimit("forgot:" + em, 3, 3600_000);
    if (!canRecover()) fail(409, "Este servidor no tiene configurado el correo. Pide al administrador que cambie tu contraseña.");
    const u = db.prepare("SELECT id, name, email, disabled FROM users WHERE email = ?").get(em);
    if (u && !u.disabled) {
      const token = crypto.randomBytes(32).toString("base64url");
      db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(u.id);
      db.prepare("INSERT INTO password_resets(hash,user_id,created,expires) VALUES(?,?,?,?)").run(sha(token), u.id, now(), now() + 30 * 60_000);
      const link = `${publicUrl()}/?restablecer=${token}`, site = getSetting("siteName", "Sotos");
      sendSystemMail({ to: u.email, subject: `Cambia tu contraseña de ${site}`,
        text: `Hola ${u.name}:\n\nAlguien (ojalá tú) pidió cambiar la contraseña de tu cuenta de ${site}. Para elegir una nueva abre este enlace en los próximos 30 minutos:\n\n${link}\n\nSi no fuiste tú, ignora este correo: tu contraseña sigue igual.\n\n— ${site}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;color:#2b2622"><h2 style="font-weight:600">Cambia tu contraseña</h2><p>Hola ${esc(u.name)}:</p><p>Alguien (ojalá tú) pidió cambiar la contraseña de tu cuenta de <b>${esc(site)}</b>. El enlace sirve una sola vez durante 30 minutos.</p><p><a href="${esc(link)}" style="display:inline-block;background:#c4532f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Elegir una contraseña nueva</a></p><p style="color:#776d63;font-size:13px">Si no fuiste tú, ignora este correo: tu contraseña sigue igual.</p></div>` })
        .catch(e => console.error("[sotos] no se pudo enviar el correo de recuperación:", e.message));
    } else await hashPassword("x"); // mismo tiempo exista o no
    return json(res, 200, { ok: true });
  }
  if (sub === "reset-check") { // ¿el enlace sigue vivo? y ¿pide código de dos pasos?
    const { token } = await readJson(req, 4096); rateLimit("reset:" + ip, 30, 3600_000);
    const r = db.prepare("SELECT r.user_id, r.expires, u.email, u.totp_on FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.hash = ?").get(sha(String(token || "")));
    if (!r || r.expires < now()) fail(410, "El enlace caducó o ya se usó. Pide uno nuevo.");
    return json(res, 200, { email: r.email, need2fa: !!r.totp_on });
  }
  if (sub === "reset") {
    const { token, password, code } = await readJson(req, 8192); rateLimit("reset:" + ip, 30, 3600_000);
    const r = db.prepare("SELECT * FROM password_resets WHERE hash = ?").get(sha(String(token || "")));
    if (!r || r.expires < now()) fail(410, "El enlace caducó o ya se usó. Pide uno nuevo.");
    if (String(password || "").length < 8) fail(400, "La contraseña debe tener al menos 8 caracteres");
    if (String(password).length > 200) fail(400, "Contraseña demasiado larga");
    if (totpEnabled(r.user_id)) { rateLimit("2fa:" + r.user_id, 6, 900_000); if (!totpCheck(r.user_id, code)) fail(401, "Código de verificación incorrecto"); }
    db.prepare("UPDATE users SET pass = ? WHERE id = ?").run(await hashPassword(password), r.user_id);
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(r.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(r.user_id); // cierra todas las sesiones abiertas
    startSession(req, res, r.user_id);
    return json(res, 200, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(r.user_id)) });
  }
  if (sub === "login2fa") {
    const { ticket, code } = await readJson(req, 4096);
    let t; try { t = jwtVerify(String(ticket || ""), secret("auth_2fa")); } catch { fail(401, "El inicio de sesión caducó. Vuelve a escribir tu contraseña."); }
    if (t.k !== "2fa") fail(401, "Pase no válido");
    rateLimit("2fa:" + t.u, 6, 900_000); rateLimit("2fa-ip:" + ip, 20, 900_000);
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(t.u); if (!u || u.disabled) fail(403, "Cuenta no disponible");
    const r = totpCheck(u.id, code); if (!r) fail(401, "Código incorrecto");
    startSession(req, res, u.id);
    return json(res, 200, { user: publicUser(u), usedRecovery: r === "recovery", recoveryLeft: recoveryLeft(u.id) });
  }
  if (sub === "2fa-setup") {
    const u = requireUser(req); const { password } = await readJson(req, 4096); rateLimit("pw:" + u.id, 8, 900_000);
    if (!(await checkPassword(String(password || ""), u.pass))) fail(403, "Contraseña incorrecta");
    if (u.totp_on) fail(409, "La verificación en dos pasos ya está activa");
    return json(res, 200, totpSetup(u));
  }
  if (sub === "2fa-enable") {
    const u = requireUser(req); const { code } = await readJson(req, 4096); rateLimit("2fa:" + u.id, 8, 900_000);
    const codes = totpEnable(u.id, code); if (!codes) fail(400, "Ese código no coincide. Revisa la hora del celular y escribe el código actual.");
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id); startSession(req, res, u.id); // cierra las demás sesiones
    return json(res, 200, { recoveryCodes: codes });
  }
  if (sub === "2fa-disable") {
    const u = requireUser(req); const { password, code } = await readJson(req, 4096); rateLimit("pw:" + u.id, 8, 900_000);
    if (!(await checkPassword(String(password || ""), u.pass))) fail(403, "Contraseña incorrecta");
    if (!totpCheck(u.id, code)) fail(400, "Código incorrecto");
    totpDisable(u.id); return json(res, 200, { ok: true });
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

setInterval(() => { db.prepare("DELETE FROM sessions WHERE expires < ?").run(now()); db.prepare("DELETE FROM password_resets WHERE expires < ?").run(now()); }, 3600_000).unref();
