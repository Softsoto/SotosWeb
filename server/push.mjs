/* ============================================================
   Sotos — notificaciones aunque Sotos esté cerrado (Web Push)
   Estándares: VAPID (RFC 8292) para identificar al servidor y cifrado
   aes128gcm (RFC 8291): el servicio de notificaciones del navegador (Google,
   Mozilla, Microsoft, Apple) transporta el aviso pero no puede leerlo.
   Se envía solo cuando la persona no tiene Sotos abierto (si lo tiene,
   el aviso ya le llega en vivo dentro del escritorio).
   SOTOS_PUSH_CONTACT  contacto del servidor para los servicios de push (mailto: o https:)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import { db, now, secret } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { isOnline } from "./fs.mjs";
import { setOnNotification } from "./social.mjs";

db.exec(`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, agent TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs(user_id);`);
const b64u = (b) => Buffer.from(b).toString("base64url");
const CONTACT = process.env.SOTOS_PUSH_CONTACT || "https://github.com/Softsoto/SotosWeb";

// llave VAPID del servidor: sale de un secreto propio (siempre la misma, así las suscripciones no caducan)
let vapid;
function vapidKeys() {
  if (vapid) return vapid;
  const ecdh = crypto.createECDH("prime256v1"); ecdh.setPrivateKey(Buffer.from(secret("vapid"), "hex"));
  const pub = ecdh.getPublicKey(); // 65 bytes sin comprimir
  const priv = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(ecdh.getPrivateKey()), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: "jwk" });
  return (vapid = { pub, priv });
}
function vapidHeader(endpoint) {
  const { pub, priv } = vapidKeys(); const aud = new URL(endpoint).origin;
  const data = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" })) + "." + b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT }));
  const sig = crypto.sign("sha256", Buffer.from(data), { key: priv, dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64u(sig)}, k=${b64u(pub)}`;
}
const hkdf = (salt, ikm, info, len) => { const prk = crypto.createHmac("sha256", salt).update(ikm).digest(); return crypto.createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len); };

/** cifra el mensaje para una suscripción (RFC 8291, un solo registro) */
export function encryptPayload(payload, p256dh, authSecret) {
  const uaPub = Buffer.from(p256dh, "base64url"), auth = Buffer.from(authSecret, "base64url");
  const as = crypto.createECDH("prime256v1"); as.generateKeys(); const asPub = as.getPublicKey();
  const shared = as.computeSecret(uaPub);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16), nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, body]);
}

export async function pushToUser(uid, data) {
  const subs = db.prepare("SELECT * FROM push_subs WHERE user_id = ?").all(uid); let sent = 0;
  for (const s of subs) {
    try {
      const r = await fetch(s.endpoint, { method: "POST", signal: AbortSignal.timeout(15_000),
        headers: { "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: "86400", urgency: "normal", authorization: vapidHeader(s.endpoint) },
        body: encryptPayload(JSON.stringify(data), s.p256dh, s.auth) });
      if (r.status === 404 || r.status === 410) db.prepare("DELETE FROM push_subs WHERE endpoint = ?").run(s.endpoint); // el navegador la dio de baja
      else if (r.ok) sent++;
      else console.error("[push]", r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.error("[push]", e.message); }
  }
  return sent;
}

// cada aviso nuevo: si la persona no tiene Sotos abierto, le llega al dispositivo
setOnNotification((uid, n) => { if (!isOnline(uid)) pushToUser(uid, { title: n.title, body: n.body, link: n.link, kind: n.kind, id: n.id }).catch(() => {}); });

const ALLOWED_PUSH = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|notify\.windows\.com|push\.apple\.com|microsoft\.com)(:\d+)?\//i;
export async function handlePush(req, res, parts) {
  const [a] = parts;
  if (a === "key" && req.method === "GET") return json(res, 200, { key: b64u(vapidKeys().pub) });
  const u = requireUser(req);
  if (a === "subscribe" && req.method === "POST") {
    const { subscription } = await readJson(req, 8192); const ep = String(subscription?.endpoint || ""), k = subscription?.keys || {};
    // solo servicios de push conocidos (evita que el servidor haga peticiones a direcciones arbitrarias)
    if (!ALLOWED_PUSH.test(ep) && !(process.env.SOTOS_TEST === "1" && ep.startsWith("http://127.0.0.1"))) fail(400, "Servicio de notificaciones no reconocido");
    if (!k.p256dh || !k.auth) fail(400, "Suscripción incompleta");
    db.prepare("INSERT INTO push_subs(endpoint,user_id,p256dh,auth,agent,created) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth")
      .run(ep, u.id, String(k.p256dh), String(k.auth), String(req.headers["user-agent"] || "").slice(0, 200), now());
    return json(res, 201, { ok: true });
  }
  if (a === "unsubscribe" && req.method === "POST") { const { endpoint } = await readJson(req, 4096); db.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").run(String(endpoint || ""), u.id); return json(res, 200, { ok: true }); }
  if (a === "test" && req.method === "POST") { const n = await pushToUser(u.id, { title: "Las notificaciones funcionan", body: "Así te avisará Sotos cuando no lo tengas abierto.", kind: "system" }); return json(res, 200, { sent: n }); }
  if (!a && req.method === "GET") return json(res, 200, { devices: db.prepare("SELECT COUNT(*) n FROM push_subs WHERE user_id = ?").get(u.id).n });
  fail(404, "No encontrado");
}
