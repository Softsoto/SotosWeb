/* ============================================================
   Sotos — servicio de WhatsApp (opcional)
   Una sesión de WhatsApp por cuenta de Sotos, con Baileys (cliente
   NO oficial del protocolo de WhatsApp Web: WhatsApp puede suspender
   números que lo usan). Solo escucha en 127.0.0.1 y exige el secreto
   compartido con el servidor de Sotos (cabecera x-wa-secret).
   Guarda por cuenta: credenciales de la sesión y una base SQLite con
   chats, contactos y mensajes recientes.
     WA_PORT    puerto (8790)
     WA_SECRET  secreto compartido (obligatorio)
     WA_DATA    carpeta de datos (./data)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import makeWASocket, {
  Browsers, BufferJSON, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion,
  getContentType, isJidBroadcast, isJidGroup, isJidStatusBroadcast, jidNormalizedUser,
  normalizeMessageContent, useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WA_PORT || 8790);
const SECRET = process.env.WA_SECRET || "";
const DATA = path.resolve(process.env.WA_DATA || path.join(here, "data"));
if (SECRET.length < 24) { console.error("[wa] falta WA_SECRET (24+ caracteres)"); process.exit(1); }
const logger = pino({ level: "silent" });
const MAX_MEDIA = 64 * 1024 * 1024;
let waVersion; fetchLatestBaileysVersion().then(v => { waVersion = v.version; }).catch(() => {});

/* ---------------- almacén por cuenta ---------------- */
function openStore(dir) {
  const db = new DatabaseSync(path.join(dir, "chats.db"));
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS chats (jid TEXT PRIMARY KEY, name TEXT, unread INTEGER DEFAULT 0, ts INTEGER DEFAULT 0, archived INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS contacts (jid TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS messages (jid TEXT NOT NULL, id TEXT NOT NULL, from_me INTEGER, ts INTEGER, sender TEXT, kind TEXT, text TEXT, raw TEXT,
      PRIMARY KEY (jid, id));
    CREATE INDEX IF NOT EXISTS messages_ts ON messages(jid, ts);
    CREATE TABLE IF NOT EXISTS lids (lid TEXT PRIMARY KEY, pn TEXT);`);
  // mensajes guardados antes de reconocer un tipo nuevo: se vuelven a clasificar
  for (const r of db.prepare("SELECT jid, id, raw FROM messages WHERE kind = 'other'").all()) { const d = describe(JSON.parse(r.raw, BufferJSON.reviver)); if (d && d.kind !== "other") db.prepare("UPDATE messages SET kind = ?, text = ? WHERE jid = ? AND id = ?").run(d.kind, d.text, r.jid, r.id); }
  return db;
}
const KINDS = { conversation: "text", extendedTextMessage: "text", imageMessage: "image", videoMessage: "video", audioMessage: "audio",
  documentMessage: "document", documentWithCaptionMessage: "document", stickerMessage: "sticker", locationMessage: "location",
  liveLocationMessage: "location", contactMessage: "contact", contactsArrayMessage: "contact", pollCreationMessage: "poll",
  pollCreationMessageV3: "poll", reactionMessage: "reaction",
  // mensajes de empresas y respuestas a botones: se muestran como texto
  templateMessage: "text", interactiveMessage: "text", buttonsMessage: "text", listMessage: "text", buttonsResponseMessage: "text",
  listResponseMessage: "text", templateButtonReplyMessage: "text", interactiveResponseMessage: "text" };
const bizText = (c) => c.hydratedTemplate?.hydratedContentText || c.hydratedFourRowTemplate?.hydratedContentText || c.body?.text || c.header?.title
  || c.contentText || c.description || c.selectedDisplayText || c.title || c.singleSelectReply?.selectedRowId || "";
function describe(msg) {
  const m = normalizeMessageContent(msg.message); if (!m) return null;
  const type = getContentType(m); if (!type || type === "protocolMessage" || type === "senderKeyDistributionMessage") return null;
  const kind = KINDS[type] || "other"; const c = m[type] || {};
  const text = typeof c === "string" ? c : c.text || c.caption || c.fileName || c.name || c.displayName || bizText(c) || (kind === "location" ? `${c.degreesLatitude},${c.degreesLongitude}` : "") || "";
  return { kind, text: String(text).slice(0, 8000), mime: c.mimetype || null, seconds: c.seconds || null, size: Number(c.fileLength || 0) || null, file: c.fileName || null,
    react: kind === "reaction" ? { to: c.key?.id, emoji: c.text } : null };
}
const tsOf = (msg) => Number(msg.messageTimestamp?.low ?? msg.messageTimestamp ?? 0) * 1000 || Date.now();
const okJid = (j) => j && !isJidBroadcast(j) && !isJidStatusBroadcast(j) && !j.endsWith("@newsletter");

/* ---------------- sesiones ---------------- */
const sessions = new Map(); // user → { sock, db, state, qr, me, subs:Set<res> }
function emit(s, type, data) { const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; for (const r of s.subs) { try { r.write(line); } catch {} } }
// nombre visible: contacto, nombre del chat, o el del número real si el chat usa un ID interno de WhatsApp (LID)
function nameOf(s, jid) {
  if (!jid) return "";
  const byJid = (j) => s.db.prepare("SELECT name FROM contacts WHERE jid = ?").get(j)?.name || s.db.prepare("SELECT name FROM chats WHERE jid = ?").get(j)?.name;
  const c = byJid(jid); if (c) return c;
  if (jid.endsWith("@lid")) { const pn = s.db.prepare("SELECT pn FROM lids WHERE lid = ?").get(jid)?.pn; if (pn) return byJid(pn) || "+" + pn.split("@")[0]; return "Contacto sin nombre"; }
  return "+" + jid.split("@")[0].split(":")[0];
}
// en segundo plano: la lista sale de inmediato y, si se resuelven nombres, se avisa con "chats"
async function resolveLids(s, jids) {
  const map = s.sock?.signalRepository?.lidMapping; if (!map || s.resolving) return;
  const todo = jids.filter(j => j.endsWith("@lid") && !s.db.prepare("SELECT 1 FROM lids WHERE lid = ?").get(j) && !(s.lidMiss ||= new Set()).has(j));
  if (!todo.length) return; s.resolving = true; let found = 0;
  const one = (lid) => Promise.race([map.getPNForLID(lid), new Promise(r => setTimeout(() => r(null), 5000))]).then(pn => {
    if (pn && s.db) { s.db.prepare("INSERT OR REPLACE INTO lids(lid,pn) VALUES(?,?)").run(lid, jidNormalizedUser(pn)); found++; } else s.lidMiss.add(lid); }).catch(() => s.lidMiss.add(lid));
  try { for (let i = 0; i < Math.min(todo.length, 200); i += 6) await Promise.all(todo.slice(i, i + 6).map(one)); } finally { s.resolving = false; }
  if (found) emit(s, "chats", {});
}
function saveMessage(s, msg, { live = false } = {}) {
  const jid = msg.key?.remoteJid; if (!okJid(jid)) return null;
  const d = describe(msg); if (!d) return null;
  const id = msg.key.id, ts = tsOf(msg), fromMe = msg.key.fromMe ? 1 : 0;
  const sender = fromMe ? null : (msg.key.participant || jid);
  if (!fromMe && msg.pushName && sender) s.db.prepare("INSERT INTO contacts(jid,name) VALUES(?,?) ON CONFLICT(jid) DO UPDATE SET name = COALESCE(contacts.name, excluded.name)").run(jidNormalizedUser(sender), msg.pushName);
  if (d.kind === "reaction") { emit(s, "reaction", { jid, to: d.react.to, emoji: d.react.emoji, fromMe: !!fromMe }); return null; }
  s.db.prepare("INSERT OR REPLACE INTO messages(jid,id,from_me,ts,sender,kind,text,raw) VALUES(?,?,?,?,?,?,?,?)")
    .run(jid, id, fromMe, ts, sender, d.kind, d.text, JSON.stringify(msg, BufferJSON.replacer));
  s.db.prepare("INSERT INTO chats(jid,ts,unread) VALUES(?,?,?) ON CONFLICT(jid) DO UPDATE SET ts = MAX(chats.ts, excluded.ts), unread = chats.unread + excluded.unread")
    .run(jid, ts, live && !fromMe ? 1 : 0);
  const out = { jid, id, fromMe: !!fromMe, ts, sender, senderName: sender ? nameOf(s, jidNormalizedUser(sender)) : null, ...d };
  if (live) emit(s, "message", out);
  return out;
}
async function start(user) {
  let s = sessions.get(user); if (s && s.sock && s.state !== "closed") return s;
  const dir = path.join(DATA, user); fs.mkdirSync(path.join(dir, "auth"), { recursive: true });
  s = s || { subs: new Set(), state: "connecting", qr: null, me: null, retries: 0 };
  if (!s.db) s.db = openStore(dir);
  s.retries = s.retries || 0; sessions.set(user, s);
  const { state, saveCreds } = await useMultiFileAuthState(path.join(dir, "auth"));
  const sock = makeWASocket({ auth: state, version: waVersion, logger, browser: Browsers.windows("Sotos"), markOnlineOnConnect: false, syncFullHistory: false,
    getMessage: async (key) => { const r = s.db.prepare("SELECT raw FROM messages WHERE jid = ? AND id = ?").get(key.remoteJid, key.id); return r ? JSON.parse(r.raw, BufferJSON.reviver).message : undefined; } });
  s.sock = sock; s.state = "connecting"; emit(s, "status", { state: s.state });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (s.sock !== sock && connection !== "close") return; // eventos de un socket anterior
    if (connection === "close" && s.sock !== sock) return;
    if (qr) { s.state = "qr"; s.qr = await QRCode.toDataURL(qr, { margin: 1, width: 300 }); emit(s, "status", { state: "qr", qr: s.qr }); }
    if (connection === "open") {
      s.state = "open"; s.qr = null; s.retries = 0; s.me = { id: jidNormalizedUser(sock.user?.id), name: sock.user?.name || null };
      emit(s, "status", { state: "open", me: s.me });
      sock.groupFetchAllParticipating().then(gs => { for (const g of Object.values(gs)) s.db.prepare("INSERT INTO chats(jid,name) VALUES(?,?) ON CONFLICT(jid) DO UPDATE SET name = excluded.name").run(g.id, g.subject); emit(s, "chats", {}); }).catch(() => {});
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      s.sock = null;
      if (code === DisconnectReason.loggedOut) { s.state = "off"; s.me = null; fs.rmSync(path.join(dir, "auth"), { recursive: true, force: true }); emit(s, "status", { state: "off", reason: "Se cerró la sesión desde el celular" }); return; }
      if (s.stopping) { s.state = "off"; emit(s, "status", { state: "off" }); return; }
      s.state = "connecting"; emit(s, "status", { state: "connecting" });
      const wait = Math.min(30000, 2000 * 2 ** s.retries++); setTimeout(() => start(user).catch(() => {}), wait);
    }
  });
  sock.ev.on("messaging-history.set", ({ chats = [], contacts = [], messages = [] }) => {
    for (const c of contacts) if (c.id && (c.name || c.notify || c.verifiedName)) s.db.prepare("INSERT OR REPLACE INTO contacts(jid,name) VALUES(?,?)").run(c.id, c.name || c.notify || c.verifiedName);
    for (const c of chats) if (okJid(c.id)) s.db.prepare("INSERT INTO chats(jid,name,unread,ts,archived) VALUES(?,?,?,?,?) ON CONFLICT(jid) DO UPDATE SET name = COALESCE(excluded.name, chats.name), unread = excluded.unread, ts = MAX(chats.ts, excluded.ts), archived = excluded.archived")
      .run(c.id, c.name || null, c.unreadCount || 0, Number(c.conversationTimestamp?.low ?? c.conversationTimestamp ?? 0) * 1000, c.archived ? 1 : 0);
    for (const m of messages) saveMessage(s, m);
    emit(s, "chats", {});
  });
  sock.ev.on("contacts.upsert", (cs) => { for (const c of cs) if (c.id && (c.name || c.notify)) s.db.prepare("INSERT OR REPLACE INTO contacts(jid,name) VALUES(?,?)").run(c.id, c.name || c.notify); });
  sock.ev.on("contacts.update", (cs) => { for (const c of cs) if (c.id && (c.name || c.notify)) s.db.prepare("INSERT OR REPLACE INTO contacts(jid,name) VALUES(?,?)").run(c.id, c.name || c.notify); });
  sock.ev.on("chats.upsert", (cs) => { for (const c of cs) if (okJid(c.id)) s.db.prepare("INSERT INTO chats(jid,name,unread) VALUES(?,?,?) ON CONFLICT(jid) DO UPDATE SET name = COALESCE(excluded.name, chats.name)").run(c.id, c.name || null, c.unreadCount || 0); emit(s, "chats", {}); });
  sock.ev.on("chats.update", (cs) => { for (const c of cs) if (okJid(c.id)) { if (c.unreadCount != null) s.db.prepare("UPDATE chats SET unread = ? WHERE jid = ?").run(c.unreadCount, c.id); if (c.name) s.db.prepare("UPDATE chats SET name = ? WHERE jid = ?").run(c.name, c.id); } emit(s, "chats", {}); });
  sock.ev.on("groups.update", (gs) => { for (const g of gs) if (g.id && g.subject) s.db.prepare("INSERT INTO chats(jid,name) VALUES(?,?) ON CONFLICT(jid) DO UPDATE SET name = excluded.name").run(g.id, g.subject); });
  sock.ev.on("messages.upsert", ({ messages, type }) => { for (const m of messages) saveMessage(s, m, { live: type === "notify" }); });
  sock.ev.on("messages.update", (ups) => { for (const u of ups) if (u.update?.status != null) emit(s, "ack", { jid: u.key.remoteJid, id: u.key.id, status: u.update.status }); });
  return s;
}

/* ---------------- HTTP (solo para el servidor de Sotos) ---------------- */
const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
const body = (req, max = 70 * 1024 * 1024) => new Promise((ok, bad) => { const parts = []; let n = 0; req.on("data", c => { n += c.length; if (n > max) { bad(new Error("Demasiado grande")); req.destroy(); } else parts.push(c); }); req.on("end", () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : {}); } catch (e) { bad(e); } }); req.on("error", bad); });
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

http.createServer(async (req, res) => {
  try {
    if (!safeEq(req.headers["x-wa-secret"] || "", SECRET)) return send(res, 401, { error: "No autorizado" });
    const url = new URL(req.url, "http://x"); const user = url.searchParams.get("user") || "";
    if (!/^[a-z0-9]{6,40}$/i.test(user)) return send(res, 400, { error: "Usuario no válido" });
    const route = url.pathname.replace(/^\/+/, "");
    const dirExists = fs.existsSync(path.join(DATA, user, "auth", "creds.json"));
    let s = sessions.get(user);
    // al primer uso tras reiniciar el servicio, se reanuda la sesión que ya estaba vinculada
    if (!s && dirExists && route !== "logout") s = await start(user);

    if (route === "status" && req.method === "GET") return send(res, 200, { state: s?.state || "off", qr: s?.state === "qr" ? s.qr : null, me: s?.me || null });
    if (route === "start" && req.method === "POST") { s = await start(user); s.stopping = false; return send(res, 200, { state: s.state, qr: s.qr }); }
    if (route === "logout" && req.method === "POST") {
      if (s?.sock) { s.stopping = true; const k = s.sock; try { await k.logout(); } catch {} try { k.end(undefined); } catch {} }
      if (s) { s.state = "off"; s.qr = null; s.me = null; emit(s, "status", { state: "off" }); }
      try { s?.db?.close(); } catch {} if (s) { s.db = null; s.sock = null; }
      fs.rmSync(path.join(DATA, user), { recursive: true, force: true });
      return send(res, 200, { ok: true });
    }
    if (route === "events" && req.method === "GET") {
      // escuchar NO vincula: la sesión solo arranca con /start (cuando la persona acepta el aviso)
      if (!s) { s = { subs: new Set(), state: "off", qr: null, me: null }; sessions.set(user, s); }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(`event: status\ndata: ${JSON.stringify({ state: s.state, qr: s.state === "qr" ? s.qr : null, me: s.me })}\n\n`);
      s.subs.add(res); const ping = setInterval(() => res.write(": ping\n\n"), 25000);
      req.on("close", () => { clearInterval(ping); s.subs.delete(res); });
      return;
    }
    if (!s || !s.db) return send(res, 409, { error: "WhatsApp no está vinculado" });
    if (route === "chats" && req.method === "GET") {
      const rows = s.db.prepare(`SELECT c.jid, c.name, c.unread, c.archived, c.ts, m.text, m.kind, m.from_me
        FROM chats c LEFT JOIN messages m ON m.jid = c.jid AND m.ts = (SELECT MAX(ts) FROM messages WHERE jid = c.jid)
        ORDER BY c.ts DESC LIMIT 300`).all();
      resolveLids(s, rows.filter(r => !r.name).map(r => r.jid)).catch(() => {});
      return send(res, 200, { chats: rows.filter(r => okJid(r.jid)).map(r => ({ jid: r.jid, name: r.name || nameOf(s, r.jid), group: !!isJidGroup(r.jid), unread: r.unread || 0, archived: !!r.archived, ts: r.ts || 0,
        last: r.kind ? { text: r.text, kind: r.kind, fromMe: !!r.from_me } : null })) });
    }
    if (route === "messages" && req.method === "GET") {
      const jid = url.searchParams.get("jid"); const before = Number(url.searchParams.get("before") || 0) || Date.now() + 1e9;
      const rows = s.db.prepare("SELECT * FROM messages WHERE jid = ? AND ts < ? ORDER BY ts DESC LIMIT 60").all(jid, before).reverse();
      return send(res, 200, { name: nameOf(s, jid), group: !!isJidGroup(jid), messages: rows.map(r => { const d = describe(JSON.parse(r.raw, BufferJSON.reviver)) || {}; return { jid, id: r.id, fromMe: !!r.from_me, ts: r.ts, sender: r.sender, senderName: r.sender && isJidGroup(jid) ? nameOf(s, jidNormalizedUser(r.sender)) : null, kind: r.kind, text: r.text, ...d }; }) });
    }
    if (route === "media" && req.method === "GET") {
      const r = s.db.prepare("SELECT raw, kind FROM messages WHERE jid = ? AND id = ?").get(url.searchParams.get("jid"), url.searchParams.get("id"));
      if (!r) return send(res, 404, { error: "No encontrado" });
      const msg = JSON.parse(r.raw, BufferJSON.reviver); const d = describe(msg);
      if (d.size && d.size > MAX_MEDIA) return send(res, 413, { error: "Archivo demasiado grande" });
      const buf = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: s.sock?.updateMediaMessage });
      res.writeHead(200, { "content-type": d.mime?.split(";")[0] || "application/octet-stream", "content-length": buf.length, "cache-control": "private, max-age=86400" });
      return res.end(buf);
    }
    if (!s.sock || s.state !== "open") return send(res, 409, { error: "WhatsApp se está conectando, prueba en un momento" });
    if (route === "read" && req.method === "POST") {
      const { jid } = await body(req, 4096);
      const last = s.db.prepare("SELECT id, sender, from_me FROM messages WHERE jid = ? AND from_me = 0 ORDER BY ts DESC LIMIT 20").all(jid);
      if (last.length) await s.sock.readMessages(last.map(m => ({ remoteJid: jid, id: m.id, participant: isJidGroup(jid) ? m.sender : undefined, fromMe: false }))).catch(() => {});
      s.db.prepare("UPDATE chats SET unread = 0 WHERE jid = ?").run(jid); emit(s, "chats", {});
      return send(res, 200, { ok: true });
    }
    if (route === "send" && req.method === "POST") {
      const b = await body(req);
      const jid = String(b.jid || ""); if (!/@(s\.whatsapp\.net|g\.us|lid)$/.test(jid)) return send(res, 400, { error: "Chat no válido" });
      let content;
      if (b.media) {
        const data = Buffer.from(String(b.media.data || ""), "base64"); const mime = String(b.media.mime || "application/octet-stream"); const name = String(b.media.name || "archivo").slice(0, 200);
        if (!data.length || data.length > MAX_MEDIA) return send(res, 400, { error: "Archivo vacío o de más de 64 MB" });
        content = mime.startsWith("image/") ? { image: data, mimetype: mime, caption: b.text || undefined }
          : mime.startsWith("video/") ? { video: data, mimetype: mime, caption: b.text || undefined }
          : mime.startsWith("audio/") ? { audio: data, mimetype: mime }
          : { document: data, mimetype: mime, fileName: name, caption: b.text || undefined };
      } else {
        const text = String(b.text || "").trim(); if (!text) return send(res, 400, { error: "Mensaje vacío" });
        content = { text: text.slice(0, 65000) };
      }
      const sent = await s.sock.sendMessage(jid, content);
      const out = sent ? saveMessage(s, sent) : null; emit(s, "chats", {});
      return send(res, 200, { ok: true, message: out });
    }
    if (route === "check" && req.method === "POST") {
      // nuevo chat: comprobar que el número tiene WhatsApp
      const { phone } = await body(req, 1024); const digits = String(phone || "").replace(/\D/g, "");
      if (digits.length < 8) return send(res, 400, { error: "Escribe el número con el indicativo del país" });
      const [r] = await s.sock.onWhatsApp(digits + "@s.whatsapp.net").catch(() => []);
      return r?.exists ? send(res, 200, { jid: r.jid }) : send(res, 404, { error: "Ese número no tiene WhatsApp" });
    }
    return send(res, 404, { error: "No encontrado" });
  } catch (e) { console.error("[wa]", e); try { send(res, 500, { error: e.message || "Error de WhatsApp" }); } catch {} }
}).listen(PORT, "127.0.0.1", () => console.log(`[wa] servicio de WhatsApp en 127.0.0.1:${PORT}`));
