/* ============================================================
   Sotos — correo real: IMAP (leer) y SMTP (enviar), sin dependencias
   Contraseña de correo cifrada (AES-256-GCM) en el servidor; nunca
   vuelve al navegador. Lector MIME propio (multipart, base64,
   quoted-printable, RFC 2047, juegos de caracteres).
   © 2026 Sebastian Sotomontes
   ============================================================ */
import tls from "node:tls";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import { db, now, secret } from "./db.mjs";
import { fail, json, readJson, rateLimit } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { userNode, blobPath } from "./fs.mjs";

db.exec(`CREATE TABLE IF NOT EXISTS mail_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL, name TEXT,
  imap_host TEXT NOT NULL, imap_port INTEGER NOT NULL, smtp_host TEXT NOT NULL, smtp_port INTEGER NOT NULL,
  username TEXT NOT NULL, pass_enc TEXT NOT NULL, created INTEGER NOT NULL)`);
if (!db.prepare("PRAGMA table_info(mail_accounts)").all().some(c => c.name === "smtp_tls")) db.exec("ALTER TABLE mail_accounts ADD COLUMN smtp_tls TEXT"); // "ssl" | "starttls"

export const PRESETS = {
  gmail:   { label: "Gmail", imap: ["imap.gmail.com", 993], smtp: ["smtp.gmail.com", 465], help: "Necesitas una «contraseña de aplicación» de Google (Cuenta → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones)." },
  outlook: { label: "Outlook / Hotmail", imap: ["outlook.office365.com", 993], smtp: ["smtp-mail.outlook.com", 587], help: "Si tu cuenta tiene verificación en 2 pasos, usa una contraseña de aplicación de Microsoft." },
  icloud:  { label: "iCloud", imap: ["imap.mail.me.com", 993], smtp: ["smtp.mail.me.com", 587], help: "Crea una «contraseña específica para apps» en appleid.apple.com." },
  yahoo:   { label: "Yahoo", imap: ["imap.mail.yahoo.com", 993], smtp: ["smtp.mail.yahoo.com", 465], help: "Genera una contraseña de aplicación en la seguridad de tu cuenta Yahoo." },
};

/* ---------------- cifrado de la contraseña ---------------- */
const key = () => crypto.createHash("sha256").update(secret("mail")).digest();
const enc = (s) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv); const out = Buffer.concat([c.update(s, "utf8"), c.final()]); return [iv, c.getAuthTag(), out].map(b => b.toString("base64")).join("."); };
const dec = (s) => { const [iv, tag, out] = s.split(".").map(x => Buffer.from(x, "base64")); const d = crypto.createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(out), d.final()]).toString("utf8"); };

/* ---------------- conexión de líneas sobre TLS / TCP ---------------- */
function connect(host, port, { secure = true, timeout = 20000 } = {}) {
  return new Promise((res, rej) => {
    const opts = { host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: process.env.SOTOS_MAIL_INSECURE !== "1" };
    const sock = secure ? tls.connect(opts) : net.connect(opts);
    const t = setTimeout(() => { sock.destroy(); rej(new Error(`Sin respuesta de ${host}:${port}`)); }, timeout);
    sock.once(secure ? "secureConnect" : "connect", () => { clearTimeout(t); res(sock); });
    sock.once("error", (e) => { clearTimeout(t); rej(new Error(`No se pudo conectar a ${host}:${port} (${e.code || e.message})`)); });
  });
}

/* ---------------- IMAP ---------------- */
// tokenizador de respuestas IMAP (listas, cadenas, literales {n}, átomos con [..])
function tokenize(buf) {
  let i = 0; const s = buf;
  const ws = () => { while (i < s.length && s[i] === 32) i++; };
  const list = () => { const out = []; for (;;) { ws(); if (i >= s.length) return out; const c = s[i]; if (c === 41) { i++; return out; } out.push(item()); } };
  const item = () => {
    const c = s[i];
    if (c === 40) { i++; return list(); }
    if (c === 34) { i++; let out = []; while (i < s.length && s[i] !== 34) { if (s[i] === 92) i++; out.push(s[i++]); } i++; return Buffer.from(out).toString("utf8"); }
    if (c === 123) { const end = s.indexOf(125, i); const n = parseInt(s.slice(i + 1, end).toString(), 10); i = end + 3; const lit = s.slice(i, i + n); i += n; return lit; }
    const st = i; let depth = 0;
    while (i < s.length) { const ch = s[i]; if (ch === 91) depth++; else if (ch === 93) depth--; else if (depth === 0 && (ch === 32 || ch === 40 || ch === 41 || ch === 13)) break; i++; }
    const atom = s.slice(st, i).toString("utf8"); return atom === "NIL" ? null : atom;
  };
  const out = []; while (i < s.length) { ws(); if (s[i] === 13 || i >= s.length) break; out.push(item()); }
  return out;
}
class Imap {
  constructor(sock) { this.sock = sock; this.buf = Buffer.alloc(0); this.seq = 0; this.waiters = []; this.units = [];
    sock.on("data", d => { this.buf = Buffer.concat([this.buf, d]); this.pump(); }); sock.on("error", () => {}); sock.on("close", () => { this.closed = true; this.waiters.forEach(w => w.rej(new Error("La conexión IMAP se cerró"))); }); }
  // corta respuestas completas (líneas con literales incluidos)
  pump() {
    for (;;) {
      let pos = 0, found = false;
      for (;;) { const nl = this.buf.indexOf("\r\n", pos); if (nl < 0) break; const m = /\{(\d+)\}$/.exec(this.buf.slice(Math.max(pos, nl - 20), nl).toString("latin1"));
        if (m) { const need = nl + 2 + Number(m[1]); if (this.buf.length < need) break; pos = need; continue; } pos = nl + 2; found = true; break; }
      if (!found) return;
      const unit = this.buf.slice(0, pos); this.buf = this.buf.slice(pos); this.units.push(unit); this.flush();
    }
  }
  flush() { while (this.units.length && this.waiters.length) { const u = this.units.shift(); this.waiters[0].onUnit(u); } }
  greeting() { return new Promise((res, rej) => { setTimeout(() => rej(new Error("El servidor IMAP no saludó (¿puerto o seguridad equivocados?)")), 20000); this.waiters.push({ rej, onUnit: (u) => { this.waiters.shift(); /^\* (OK|PREAUTH)/.test(u.toString()) ? res() : rej(new Error("El servidor IMAP rechazó la conexión")); } }); this.flush(); }); }
  cmd(text) {
    const tag = "S" + (++this.seq); const lines = [];
    return new Promise((res0, rej0) => {
      const timer = setTimeout(() => { rej0(new Error("El servidor de correo no responde")); this.sock.destroy(); }, 60000);
      const res = (v) => { clearTimeout(timer); res0(v); }, rej = (e) => { clearTimeout(timer); rej0(e); };
      this.waiters.push({ rej, onUnit: (u) => {
        const str = u.toString("latin1");
        if (str.startsWith(tag + " ")) { this.waiters.shift(); const ok = str.startsWith(tag + " OK"); ok ? res(lines) : rej(Object.assign(new Error(str.slice(tag.length + 1).trim().replace(/^(NO|BAD)\s*/, "") || "Comando IMAP rechazado"), { imap: true })); this.flush(); }
        else lines.push(u);
      } });
      this.sock.write(`${tag} ${text}\r\n`); this.flush();
    });
  }
  close() { try { this.sock.write(`Z LOGOUT\r\n`); } catch {} setTimeout(() => this.sock.destroy(), 200); }
}
const q = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
async function imapOpen(acc) {
  const sock = await connect(acc.imap_host, acc.imap_port, { secure: true });
  const im = new Imap(sock); await im.greeting();
  try { await im.cmd(`LOGIN ${q(acc.username)} ${q(acc.pass)}`); } catch (e) { im.close(); throw new Error("Usuario o contraseña de correo incorrectos" + (e.message ? ` (${e.message.slice(0, 120)})` : "")); }
  return im;
}
// nombres de bandeja en UTF-7 modificado (RFC 3501)
const decUtf7 = (s) => s.replace(/&([^-]*)-/g, (_, b) => b === "" ? "&" : Buffer.from(b.replace(/,/g, "/"), "base64").swap16().toString("utf16le"));
const encUtf7 = (s) => s.replace(/&/g, "&-").replace(/[^\x20-\x7e]+/g, m => "&" + Buffer.from(m, "utf16le").swap16().toString("base64").replace(/=+$/, "").replace(/\//g, ",") + "-");

/* ---------------- MIME ---------------- */
function decodeWords(s) {
  if (!s) return "";
  return String(s).replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, e, t) => {
    const bytes = e.toUpperCase() === "B" ? Buffer.from(t, "base64") : Buffer.from(t.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
    return charset(bytes, cs);
  });
}
function charset(bytes, cs = "utf-8") { const name = String(cs || "utf-8").toLowerCase().replace(/^(ascii|us-ascii)$/, "utf-8"); try { return new TextDecoder(name).decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); } }
function parseHeaders(raw) {
  const h = {}; for (const line of raw.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) { const i = line.indexOf(":"); if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim(); h[k] = h[k] ? h[k] + ", " + v : v; } }
  return h;
}
const param = (v, name) => { const m = new RegExp(`${name}\\*?=(?:"([^"]*)"|([^;\\s]*))`, "i").exec(v || ""); if (!m) return null; let x = m[1] ?? m[2]; const star = /^([^']*)'[^']*'(.*)$/.exec(x); if (star && new RegExp(`${name}\\*=`, "i").test(v)) { try { x = charset(Buffer.from(decodeURIComponent(star[2].replace(/%(?![0-9a-f]{2})/gi, "%25")), "latin1"), star[1]); } catch {} } return decodeWords(x); };
function body(buf, encoding) { const e = String(encoding || "").toLowerCase();
  if (e === "base64") return Buffer.from(buf.toString("latin1").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  if (e === "quoted-printable") return Buffer.from(buf.toString("latin1").replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
  return buf; }
export function parseMessage(raw) {
  const out = { text: "", html: "", attachments: [] }; let partNo = 0;
  const walk = (buf) => {
    const sep = buf.indexOf("\r\n\r\n") >= 0 ? buf.indexOf("\r\n\r\n") : buf.indexOf("\n\n");
    const head = parseHeaders(buf.slice(0, sep < 0 ? buf.length : sep).toString("latin1")), content = sep < 0 ? Buffer.alloc(0) : buf.slice(sep + (buf[sep] === 13 ? 4 : 2));
    const ct = head["content-type"] || "text/plain", type = ct.split(";")[0].trim().toLowerCase();
    if (type.startsWith("multipart/")) {
      const b = param(ct, "boundary"); if (!b) return head;
      const marker = Buffer.from("--" + b); let pos = content.indexOf(marker);
      while (pos >= 0) { const start = content.indexOf("\n", pos) + 1; const next = content.indexOf(marker, start); if (next < 0 || start <= 0) break;
        let end = next; if (content[end - 1] === 10) end--; if (content[end - 1] === 13) end--; walk(content.slice(start, end)); if (content.slice(next + marker.length, next + marker.length + 2).toString() === "--") break; pos = next; }
      return head;
    }
    const disp = head["content-disposition"] || "", name = param(disp, "filename") || param(ct, "name");
    const data = body(content, head["content-transfer-encoding"]);
    const id = ++partNo;
    if (name || /^attachment/i.test(disp) || !/^text\/(plain|html)$/.test(type)) { if (type !== "message/rfc822" || name) out.attachments.push({ part: id, name: name || `adjunto-${id}`, type, size: data.length, cid: (head["content-id"] || "").replace(/[<>]/g, ""), data }); }
    else if (type === "text/html" && !out.html) out.html = charset(data, param(ct, "charset"));
    else if (type === "text/plain" && !out.text) out.text = charset(data, param(ct, "charset"));
    return head;
  };
  const head = walk(raw);
  out.subject = decodeWords(head.subject || ""); out.from = decodeWords(head.from || ""); out.to = decodeWords(head.to || ""); out.cc = decodeWords(head.cc || "");
  out.date = head.date ? Date.parse(head.date) || null : null; out.messageId = head["message-id"] || null; out.replyTo = decodeWords(head["reply-to"] || "");
  // imágenes incrustadas (cid:) → data: para verlas sin pedir nada afuera
  const inline = new Set();
  for (const a of out.attachments) if (a.cid && out.html && a.size < 3e6 && out.html.includes(`cid:${a.cid}`)) { out.html = out.html.split(`cid:${a.cid}`).join(`data:${a.type};base64,${a.data.toString("base64")}`); inline.add(a); }
  out.attachments = out.attachments.filter(a => !inline.has(a)); // las imágenes que ya se ven dentro del mensaje no son adjuntos
  return out;
}

/* ---------------- SMTP ---------------- */
async function smtpSend(acc, { from, to, raw }) {
  const implicit = acc.smtp_tls ? acc.smtp_tls === "ssl" : acc.smtp_port === 465;
  let sock = await connect(acc.smtp_host, acc.smtp_port, { secure: implicit });
  let buf = "";
  const read = () => new Promise((res, rej) => {
    const timer = setTimeout(() => { sock.off("data", onData); rej(new Error("El servidor de envío no responde (¿la seguridad SSL/STARTTLS y el puerto coinciden?)")); }, 30000);
    const onData = (d) => { buf += d.toString("utf8"); const lines = buf.split("\r\n"); for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { const all = lines.slice(0, i + 1).join("\n"); buf = lines.slice(i + 1).join("\r\n"); clearTimeout(timer); sock.off("data", onData); sock.off("error", onErr); return res({ code: +lines[i].slice(0, 3), text: all }); } };
    const onErr = (e) => { clearTimeout(timer); sock.off("data", onData); rej(e); }; sock.on("data", onData); sock.on("error", onErr); onData(Buffer.alloc(0));
  });
  const say = async (line, expect) => { if (line != null) sock.write(line + "\r\n"); const r = await read(); if (expect && !expect.includes(r.code)) throw new Error(`El servidor de envío respondió: ${r.text.split("\n").pop().slice(0, 160)}`); return r; };
  try {
    await say(null, [220]);
    let ehlo = await say("EHLO sotos.local", [250]);
    if (!implicit) { if (!/STARTTLS/i.test(ehlo.text)) throw new Error("El servidor no ofrece conexión segura (STARTTLS)");
      await say("STARTTLS", [220]); sock = tls.connect({ socket: sock, servername: acc.smtp_host, rejectUnauthorized: process.env.SOTOS_MAIL_INSECURE !== "1" }); await new Promise((r, j) => { sock.once("secureConnect", r); sock.once("error", j); }); ehlo = await say("EHLO sotos.local", [250]); }
    if (/AUTH[^\n]*PLAIN/i.test(ehlo.text)) await say("AUTH PLAIN " + Buffer.from(`\0${acc.username}\0${acc.pass}`).toString("base64"), [235]);
    else { await say("AUTH LOGIN", [334]); await say(Buffer.from(acc.username).toString("base64"), [334]); await say(Buffer.from(acc.pass).toString("base64"), [235]); }
    await say(`MAIL FROM:<${from}>`, [250]);
    for (const r of to) await say(`RCPT TO:<${r}>`, [250, 251]);
    await say("DATA", [354]);
    sock.write(raw.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..") + "\r\n.\r\n"); await say(null, [250]);
    await say("QUIT").catch(() => {});
  } finally { setTimeout(() => sock.destroy(), 200); }
}
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const word = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const addr = (name, email) => name ? `${word(name)} <${email}>` : email;
const wrap = (s) => s.replace(/(.{76})/g, "$1\r\n");
function buildMessage({ from, name, to, cc, subject, text, html, attachments, inReplyTo }) {
  const boundary = "sotos-" + crypto.randomBytes(12).toString("hex"), alt = "alt-" + crypto.randomBytes(8).toString("hex");
  const head = [`From: ${addr(name, from)}`, `To: ${to.join(", ")}`, cc.length ? `Cc: ${cc.join(", ")}` : null, `Subject: ${word(subject || "(sin asunto)")}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`, `Message-ID: <${crypto.randomUUID()}@sotos>`, inReplyTo ? `In-Reply-To: ${inReplyTo}` : null, inReplyTo ? `References: ${inReplyTo}` : null,
    "MIME-Version: 1.0", "X-Mailer: Sotos (sotomontes.com)"].filter(Boolean);
  const altPart = [`Content-Type: multipart/alternative; boundary="${alt}"`, "", `--${alt}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", wrap(b64(text || "")),
    ...(html ? [`--${alt}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", wrap(b64(html))] : []), `--${alt}--`].join("\r\n");
  if (!attachments.length) return [...head, altPart].join("\r\n");
  const parts = attachments.map(a => [`--${boundary}`, `Content-Type: ${a.type || "application/octet-stream"}; name="${word(a.name)}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${word(a.name)}"`, "", wrap(a.data.toString("base64"))].join("\r\n"));
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, altPart, ...parts, `--${boundary}--`, ""].join("\r\n");
}

/* ---------------- API ---------------- */
const account = (uid) => { const a = db.prepare("SELECT * FROM mail_accounts WHERE user_id = ?").get(uid); if (!a) return null; return { ...a, pass: dec(a.pass_enc) }; };
const needAcc = (uid) => account(uid) || fail(409, "Configura tu cuenta de correo primero");
const BOX_ROLE = (name, flags) => /\\Inbox/i.test(flags) || /^inbox$/i.test(name) ? "inbox" : /\\Sent/i.test(flags) ? "sent" : /\\Drafts/i.test(flags) ? "drafts" : /\\Trash/i.test(flags) ? "trash" : /\\Junk/i.test(flags) ? "junk" : /\\Archive|\\All/i.test(flags) ? "archive" : null;
async function listBoxes(im) {
  const lines = await im.cmd('LIST "" "*"'); const out = [];
  for (const l of lines) { const t = tokenize(l); if (t[1] !== "LIST") continue; const flags = (t[2] || []).join(" "), name = Buffer.isBuffer(t[4]) ? t[4].toString() : t[4];
    if (/\\Noselect/i.test(flags) || name == null) continue; out.push({ id: name, name: decUtf7(name).replace(/^\[(Gmail|Google Mail)\]\//i, ""), role: BOX_ROLE(name, flags) }); }
  const order = ["inbox", "sent", "drafts", "archive", "junk", "trash"];
  return out.sort((a, b) => (order.indexOf(a.role) + 1 || 99) - (order.indexOf(b.role) + 1 || 99) || a.name.localeCompare(b.name));
}
const fetchVal = (list, key) => { for (let i = 0; i < list.length - 1; i++) if (typeof list[i] === "string" && list[i].toUpperCase().startsWith(key)) return list[i + 1]; return undefined; };

export async function handleMail(req, res, parts) {
  const u = requireUser(req);
  const [a, id, sub] = parts;
  const url = new URL(req.url, "http://x");
  if (a === "presets" && req.method === "GET") return json(res, 200, { presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, { label: v.label, help: v.help, imap: v.imap, smtp: v.smtp }])) });
  if (a === "account") {
    if (req.method === "GET") { const acc = db.prepare("SELECT email, name, imap_host, imap_port, smtp_host, smtp_port, smtp_tls, username FROM mail_accounts WHERE user_id = ?").get(u.id); return json(res, 200, { account: acc || null }); }
    if (req.method === "DELETE") { db.prepare("DELETE FROM mail_accounts WHERE user_id = ?").run(u.id); return json(res, 200, { ok: true }); }
    if (req.method === "PUT") {
      rateLimit("mailcfg:" + u.id, 12, 600_000);
      const b = await readJson(req, 8192); const p = PRESETS[b.preset] || null;
      const acc = { email: String(b.email || "").trim(), name: String(b.name || u.name).slice(0, 80), imap_host: String(b.imapHost || p?.imap[0] || "").trim(), imap_port: Number(b.imapPort || p?.imap[1] || 993),
        smtp_host: String(b.smtpHost || p?.smtp[0] || "").trim(), smtp_port: Number(b.smtpPort || p?.smtp[1] || 465), smtp_tls: ["ssl", "starttls"].includes(b.smtpTls) ? b.smtpTls : null, username: String(b.username || b.email || "").trim(), pass: String(b.password || "") };
      if (!/^[^\s@]+@[^\s@]+$/.test(acc.email) || !acc.imap_host || !acc.smtp_host || !acc.pass) fail(400, "Completa correo, servidores y contraseña");
      const im = await imapOpen(acc).catch(e => fail(400, e.message)); const boxes = await listBoxes(im).catch(() => []); im.close();
      db.prepare("INSERT INTO mail_accounts(user_id,email,name,imap_host,imap_port,smtp_host,smtp_port,smtp_tls,username,pass_enc,created) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, name=excluded.name, imap_host=excluded.imap_host, imap_port=excluded.imap_port, smtp_host=excluded.smtp_host, smtp_port=excluded.smtp_port, smtp_tls=excluded.smtp_tls, username=excluded.username, pass_enc=excluded.pass_enc")
        .run(u.id, acc.email, acc.name, acc.imap_host, acc.imap_port, acc.smtp_host, acc.smtp_port, acc.smtp_tls, acc.username, enc(acc.pass), now());
      return json(res, 200, { ok: true, boxes: boxes.length });
    }
  }
  if (a === "boxes" && req.method === "GET") { const acc = needAcc(u.id); const im = await imapOpen(acc); try { return json(res, 200, { boxes: await listBoxes(im) }); } finally { im.close(); } }

  if (a === "messages") {
    const acc = needAcc(u.id); const box = url.searchParams.get("box") || "INBOX";
    const im = await imapOpen(acc);
    try {
      const sel = await im.cmd(`SELECT ${q(box)}`);
      if (!id && req.method === "GET") {
        const total = Number((sel.map(l => l.toString()).find(l => / EXISTS/.test(l)) || "").match(/\* (\d+) EXISTS/)?.[1] || 0);
        const page = Math.max(0, Number(url.searchParams.get("page") || 0)), size = 40;
        const search = url.searchParams.get("q");
        let seqs;
        if (search) { const r = await im.cmd(`SEARCH CHARSET UTF-8 OR OR SUBJECT ${q(search)} FROM ${q(search)} BODY ${q(search)}`).catch(() => im.cmd(`SEARCH OR SUBJECT ${q(search)} FROM ${q(search)}`));
          seqs = (r.map(l => l.toString()).find(l => l.startsWith("* SEARCH")) || "").slice(9).trim().split(/\s+/).filter(Boolean).map(Number).sort((x, y) => y - x).slice(page * size, page * size + size); }
        else { const hi = total - page * size, lo = Math.max(1, hi - size + 1); seqs = hi >= 1 ? Array.from({ length: hi - lo + 1 }, (_, i) => hi - i) : []; }
        if (!seqs.length) return json(res, 200, { total, items: [] });
        const lines = await im.cmd(`FETCH ${seqs.join(",")} (UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])`);
        const items = [];
        for (const l of lines) { const t = tokenize(l); if (t[2] !== "FETCH") continue; const f = t[3];
          const hdr = parseHeaders((fetchVal(f, "BODY[HEADER") || Buffer.alloc(0)).toString("latin1")); const flags = fetchVal(f, "FLAGS") || [];
          items.push({ uid: Number(fetchVal(f, "UID")), from: decodeWords(hdr.from || ""), to: decodeWords(hdr.to || ""), subject: decodeWords(hdr.subject || "") || "(sin asunto)",
            date: Date.parse(hdr.date || fetchVal(f, "INTERNALDATE") || "") || null, size: Number(fetchVal(f, "RFC822.SIZE") || 0), seen: flags.includes("\\Seen"), flagged: flags.includes("\\Flagged"),
            attach: /attachment|"name"/i.test(JSON.stringify(fetchVal(f, "BODYSTRUCTURE") || "")) });
        }
        items.sort((x, y) => (y.date || 0) - (x.date || 0));
        return json(res, 200, { total, items });
      }
      const uid = Number(id); if (!(uid > 0)) fail(400, "Mensaje no válido");
      if (!sub && req.method === "GET") {
        const lines = await im.cmd(`UID FETCH ${uid} (FLAGS BODY.PEEK[])`);
        const t = lines.map(tokenize).find(x => x[2] === "FETCH"); if (!t) fail(404, "Mensaje no encontrado");
        const raw = fetchVal(t[3], "BODY[]"); const m = parseMessage(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw || "")));
        await im.cmd(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`).catch(() => {});
        return json(res, 200, { uid, subject: m.subject, from: m.from, to: m.to, cc: m.cc, replyTo: m.replyTo, date: m.date, messageId: m.messageId, text: m.text, html: m.html,
          attachments: m.attachments.map(x => ({ part: x.part, name: x.name, type: x.type, size: x.size })) });
      }
      if (sub === "attachment" && req.method === "GET") {
        const lines = await im.cmd(`UID FETCH ${uid} (BODY.PEEK[])`); const t = lines.map(tokenize).find(x => x[2] === "FETCH");
        const m = parseMessage(fetchVal(t?.[3] || [], "BODY[]") || Buffer.alloc(0)); const part = m.attachments.find(x => x.part === Number(url.searchParams.get("part")));
        if (!part) fail(404, "Adjunto no encontrado");
        res.writeHead(200, { "content-type": part.type || "application/octet-stream", "content-length": part.data.length, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(part.name)}`, "x-content-type-options": "nosniff", "cache-control": "private, no-store" });
        return res.end(part.data);
      }
      if (sub === "flags" && req.method === "POST") { const b = await readJson(req, 1024);
        if (b.seen !== undefined) await im.cmd(`UID STORE ${uid} ${b.seen ? "+" : "-"}FLAGS.SILENT (\\Seen)`);
        if (b.flagged !== undefined) await im.cmd(`UID STORE ${uid} ${b.flagged ? "+" : "-"}FLAGS.SILENT (\\Flagged)`); return json(res, 200, { ok: true }); }
      if (sub === "move" && req.method === "POST") { const { to } = await readJson(req, 1024); if (!to) fail(400, "Elige la carpeta");
        await im.cmd(`UID MOVE ${uid} ${q(to)}`).catch(async () => { await im.cmd(`UID COPY ${uid} ${q(to)}`); await im.cmd(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`); await im.cmd("EXPUNGE"); });
        return json(res, 200, { ok: true }); }
      if (!sub && req.method === "DELETE") {
        const trash = (await listBoxes(im)).find(b => b.role === "trash");
        if (trash && trash.id !== box) await im.cmd(`UID MOVE ${uid} ${q(trash.id)}`).catch(async () => { await im.cmd(`UID COPY ${uid} ${q(trash.id)}`); await im.cmd(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`); await im.cmd("EXPUNGE"); });
        else { await im.cmd(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`); await im.cmd("EXPUNGE"); }
        return json(res, 200, { ok: true, to: trash?.name || null }); }
    } finally { im.close(); }
  }

  if (a === "send" && req.method === "POST") {
    rateLimit("mailsend:" + u.id, 60, 3600_000);
    const acc = needAcc(u.id); const b = await readJson(req, 4 * 1024 * 1024);
    const list = (v) => String(v || "").split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => (s.match(/<([^>]+)>/)?.[1] || s));
    const to = list(b.to), cc = list(b.cc), bcc = list(b.bcc);
    if (!to.length) fail(400, "Escribe al menos un destinatario");
    if ([...to, ...cc, ...bcc].some(x => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x))) fail(400, "Hay una dirección de correo no válida");
    const attachments = [];
    for (const nid of (b.attachments || []).slice(0, 20)) { const n = userNode(u.id, String(nid)); if (!n || n.children) continue; const p = blobPath(u.id, n.id); if (!fs.existsSync(p)) continue;
      const data = fs.readFileSync(p); if (attachments.reduce((s, x) => s + x.data.length, 0) + data.length > 20 * 1024 * 1024) fail(413, "Los adjuntos superan 20 MB"); attachments.push({ name: n.name, type: "application/octet-stream", data }); }
    const raw = buildMessage({ from: acc.email, name: acc.name, to, cc, subject: String(b.subject || "").slice(0, 300), text: String(b.text || ""), html: b.html ? String(b.html) : null, attachments, inReplyTo: b.inReplyTo || null });
    await smtpSend(acc, { from: acc.email, to: [...to, ...cc, ...bcc], raw }).catch(e => fail(502, e.message));
    return json(res, 200, { ok: true });
  }
  fail(404, "No encontrado");
}
