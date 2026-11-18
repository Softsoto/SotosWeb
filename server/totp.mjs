/* ============================================================
   Sotos — verificación en dos pasos (TOTP, RFC 6238)
   Códigos de 6 dígitos cada 30 s, compatibles con Google Authenticator,
   Microsoft Authenticator, Authy, 1Password, Bitwarden…
   El secreto se guarda cifrado (AES-256-GCM) y los códigos de recuperación
   solo como huella SHA-256.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import { db, secret } from "./db.mjs";

for (const [c, t] of [["totp_secret", "TEXT"], ["totp_on", "INTEGER"], ["totp_recovery", "TEXT"], ["totp_last", "INTEGER"]])
  if (!db.prepare("PRAGMA table_info(users)").all().some(x => x.name === c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${t}`);

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32enc = (buf) => { let bits = 0, val = 0, out = ""; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(val << (5 - bits)) & 31]; return out; };
const b32dec = (s) => { let bits = 0, val = 0; const out = []; for (const ch of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const key = () => crypto.createHash("sha256").update("sotos-totp:" + secret("totp_key")).digest();
const enc = (t) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv); const d = Buffer.concat([c.update(t, "utf8"), c.final()]); return [iv, d, c.getAuthTag()].map(x => x.toString("base64")).join("."); };
const dec = (s) => { const [iv, d, tag] = s.split(".").map(x => Buffer.from(x, "base64")); const c = crypto.createDecipheriv("aes-256-gcm", key(), iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString("utf8"); };
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

/** código de un paso de tiempo */
export function hotp(secretB32, counter) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", b32dec(secretB32)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
export const totpNow = (secretB32, t = Date.now()) => hotp(secretB32, Math.floor(t / 30_000));

export const totpEnabled = (uid) => !!db.prepare("SELECT totp_on FROM users WHERE id = ?").get(uid)?.totp_on;

/** empieza la activación: secreto nuevo (todavía no activo hasta confirmar un código) */
export function totpSetup(user) {
  const s = b32enc(crypto.randomBytes(20));
  db.prepare("UPDATE users SET totp_secret = ?, totp_on = 0 WHERE id = ?").run(enc(s), user.id);
  const label = encodeURIComponent("Sotos:" + user.email);
  return { secret: s.replace(/(.{4})/g, "$1 ").trim(), uri: `otpauth://totp/${label}?secret=${s}&issuer=Sotos&algorithm=SHA1&digits=6&period=30` };
}

/** comprueba un código (±30 s de margen) sin aceptar el mismo dos veces; o un código de recuperación (se gasta) */
export function totpCheck(uid, code, { allowRecovery = true } = {}) {
  const r = db.prepare("SELECT totp_secret, totp_recovery, totp_last FROM users WHERE id = ?").get(uid); if (!r?.totp_secret) return false;
  const c = String(code || "").replace(/\s+/g, "");
  if (/^\d{6}$/.test(c)) {
    const s = dec(r.totp_secret), step = Math.floor(Date.now() / 30_000);
    for (const d of [0, -1, 1]) {
      if (step + d <= (r.totp_last || 0)) continue; // ya usado (evita repetir un código interceptado)
      if (crypto.timingSafeEqual(Buffer.from(hotp(s, step + d)), Buffer.from(c))) { db.prepare("UPDATE users SET totp_last = ? WHERE id = ?").run(step + d, uid); return true; }
    }
    return false;
  }
  if (allowRecovery && /^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(c)) {
    const list = JSON.parse(r.totp_recovery || "[]"); const h = sha(c.replace("-", "").toLowerCase());
    if (list.includes(h)) { db.prepare("UPDATE users SET totp_recovery = ? WHERE id = ?").run(JSON.stringify(list.filter(x => x !== h)), uid); return "recovery"; }
  }
  return false;
}

/** activa tras confirmar el primer código; devuelve 10 códigos de recuperación (se muestran una sola vez) */
export function totpEnable(uid, code) {
  if (totpCheck(uid, code, { allowRecovery: false }) !== true) return null;
  const codes = Array.from({ length: 10 }, () => { const x = crypto.randomBytes(5).toString("hex").slice(0, 8); return x.slice(0, 4) + "-" + x.slice(4); });
  db.prepare("UPDATE users SET totp_on = 1, totp_recovery = ? WHERE id = ?").run(JSON.stringify(codes.map(c => sha(c.replace("-", "")))), uid);
  return codes;
}
export const totpDisable = (uid) => db.prepare("UPDATE users SET totp_on = 0, totp_secret = NULL, totp_recovery = NULL, totp_last = NULL WHERE id = ?").run(uid);
export const recoveryLeft = (uid) => JSON.parse(db.prepare("SELECT totp_recovery FROM users WHERE id = ?").get(uid)?.totp_recovery || "[]").length;
