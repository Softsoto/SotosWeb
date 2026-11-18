/* ============================================================
   Sotos — Cine (Jellyfin): tus películas, series, videos y música como en un servicio de streaming
   Jellyfin (GPL-2.0) corre en su propio contenedor (scripts/jellyfin-dev.ps1). Sotos:
   · completa su configuración inicial con una cuenta administradora propia,
   · crea una cuenta de Jellyfin por persona, que solo ve SUS videos y su música,
   · la publica dentro de Sotos en /jellyfin (mismo origen) y entra sin pedir otra contraseña.
   JELLYFIN_URL   dirección interna de Jellyfin, p. ej. http://127.0.0.1:8096 (con BaseUrl /jellyfin)
   JELLYFIN_MEDIA ruta de la biblioteca DENTRO del contenedor (por defecto /media)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import { db, now, secret } from "./db.mjs";
import { fail, json } from "./http.mjs";
import { requireUser, currentUser } from "./auth.mjs";
import { enableLibrary, onLibraryChange } from "./library.mjs";

const JF = (process.env.JELLYFIN_URL || "").replace(/\/$/, "");
const MEDIA = process.env.JELLYFIN_MEDIA || "/media";
const BASE = "/jellyfin";
export const jellyfinEnabled = () => !!JF;
db.exec(`CREATE TABLE IF NOT EXISTS jellyfin_users (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, jf_id TEXT NOT NULL, pw TEXT NOT NULL, created INTEGER NOT NULL)`);
if (!db.prepare("PRAGMA table_info(jellyfin_users)").all().some(c => c.name === "libs")) db.exec("ALTER TABLE jellyfin_users ADD COLUMN libs TEXT");
const key = () => crypto.createHash("sha256").update("sotos-jellyfin:" + secret("jellyfin_key")).digest();
const enc = (t) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv); const d = Buffer.concat([c.update(t, "utf8"), c.final()]); return [iv, d, c.getAuthTag()].map(x => x.toString("base64")).join("."); };
const dec = (s) => { const [iv, d, tag] = s.split(".").map(x => Buffer.from(x, "base64")); const c = crypto.createDecipheriv("aes-256-gcm", key(), iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString("utf8"); };
const AUTH = (token) => `MediaBrowser Client="Sotos", Device="Servidor de Sotos", DeviceId="sotos-server", Version="3.1"${token ? `, Token="${token}"` : ""}`;

async function jf(method, p, body, token) {
  const r = await fetch(JF + BASE + p, { method, headers: { authorization: AUTH(token), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const t = await r.text(); if (!r.ok) throw Object.assign(new Error(`Jellyfin ${r.status} ${p}: ${t.slice(0, 200)}`), { status: r.status });
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}

// ---- cuenta administradora de Sotos dentro de Jellyfin (asistente inicial automático)
let adminTok = null, setupP = null;
async function admin() {
  if (adminTok) return adminTok;
  return setupP || (setupP = (async () => {
    const pw = secret("jellyfin_admin");
    const info = await jf("GET", "/System/Info/Public");
    if (!info.StartupWizardCompleted) {
      await jf("POST", "/Startup/Configuration", { UICulture: "es", MetadataCountryCode: "CO", PreferredMetadataLanguage: "es" });
      await jf("GET", "/Startup/User");
      await jf("POST", "/Startup/User", { Name: "sotos-admin", Password: pw });
      await jf("POST", "/Startup/RemoteAccess", { EnableRemoteAccess: true, EnableAutomaticPortMapping: false });
      await jf("POST", "/Startup/Complete");
    }
    const a = await jf("POST", "/Users/AuthenticateByName", { Username: "sotos-admin", Pw: pw });
    adminTok = a.AccessToken; return adminTok;
  })().finally(() => { setupP = null; }));
}

// ---- cuenta de Jellyfin de cada persona, con sus dos bibliotecas
async function ensureUser(u) {
  const tok = await admin();
  let row = db.prepare("SELECT * FROM jellyfin_users WHERE user_id = ?").get(u.id);
  if (!row) {
    const pw = crypto.randomBytes(18).toString("base64url");
    const name = `sotos-${u.id.slice(0, 12)}`;
    const existing = (await jf("GET", "/Users", null, tok)).find(x => x.Name === name);
    const jfUser = existing || await jf("POST", "/Users/New", { Name: name, Password: pw }, tok);
    if (existing) await jf("POST", `/Users/${existing.Id}/Password`, { NewPw: pw, ResetPassword: false }, tok).catch(() => {});
    db.prepare("INSERT OR REPLACE INTO jellyfin_users(user_id,jf_id,pw,created) VALUES(?,?,?,?)").run(u.id, jfUser.Id, enc(pw), now());
    row = db.prepare("SELECT * FROM jellyfin_users WHERE user_id = ?").get(u.id);
  }
  // bibliotecas propias: «Videos de Ana» y «Música de Ana» apuntando a su carpeta (los nombres son únicos en todo Jellyfin)
  const folders = await jf("GET", "/Library/VirtualFolders", null, tok);
  let libs = row.libs ? JSON.parse(row.libs) : null;
  if (!libs || libs.some(([n, , p]) => !folders.some(f => f.Name === n && (f.Locations || []).includes(p)) && folders.some(f => f.Name === n))) {
    const first = String(u.name || "").split(" ")[0] || "Sotos"; const taken = new Set(folders.map(f => f.Name));
    const uniq = (b) => { let n = b, k = 2; while (taken.has(n)) n = `${b} (${k++})`; taken.add(n); return n; };
    libs = [[uniq(`Videos de ${first}`), "homevideos", `${MEDIA}/${u.id}/Videos`], [uniq(`Música de ${first}`), "music", `${MEDIA}/${u.id}/Musica`]];
    db.prepare("UPDATE jellyfin_users SET libs = ? WHERE user_id = ?").run(JSON.stringify(libs), u.id);
  }
  for (const [name, type, p] of libs) if (!folders.some(f => f.Name === name))
    await jf("POST", `/Library/VirtualFolders?name=${encodeURIComponent(name)}&collectionType=${type}&refreshLibrary=true`, { LibraryOptions: { PathInfos: [{ Path: p }], PreferredMetadataLanguage: "es", MetadataCountryCode: "CO", EnableRealtimeMonitor: false } }, tok);
  const all = await jf("GET", "/Library/VirtualFolders", null, tok);
  const mine = all.filter(f => libs.some(([n]) => n === f.Name)).map(f => f.ItemId);
  const user = await jf("GET", `/Users/${row.jf_id}`, null, tok);
  await jf("POST", `/Users/${row.jf_id}/Policy`, { ...user.Policy, IsAdministrator: false, EnableAllFolders: false, EnabledFolders: mine, EnableContentDeletion: false, EnableRemoteControlOfOtherUsers: false, EnableSharedDeviceControl: false, AuthenticationProviderId: user.Policy.AuthenticationProviderId, PasswordResetProviderId: user.Policy.PasswordResetProviderId }, tok);
  await jf("POST", `/Users/${row.jf_id}/Configuration`, { ...user.Configuration, AudioLanguagePreference: "spa", SubtitleLanguagePreference: "spa", SubtitleMode: "Default", PlayDefaultAudioTrack: false }, tok).catch(() => {});
  return row;
}

// cuando cambia la biblioteca de alguien, Jellyfin vuelve a escanear (en Docker Desktop no detecta cambios solo)
let refreshT = null;
onLibraryChange(() => { if (!JF) return; clearTimeout(refreshT); refreshT = setTimeout(() => admin().then(t => jf("POST", "/Library/Refresh", null, t)).catch(e => console.error("[jellyfin]", e.message)), 3000); });

export async function handleJellyfin(req, res, parts) {
  const [a] = parts;
  if (a === "status") return json(res, 200, { enabled: !!JF });
  const u = requireUser(req);
  if (!JF) fail(503, "Cine (Jellyfin) no está activado en este servidor");
  if (a === "session" && req.method === "POST") {
    enableLibrary(u.id, "jellyfin");
    const row = await ensureUser(u);
    const s = await jf("POST", "/Users/AuthenticateByName", { Username: `sotos-${u.id.slice(0, 12)}`, Pw: dec(row.pw) });
    const info = await jf("GET", "/System/Info/Public");
    return json(res, 200, { base: BASE, serverId: info.Id, userId: s.User.Id, token: s.AccessToken });
  }
  fail(404, "No encontrado");
}

/* ---- Jellyfin publicado dentro de Sotos (mismo origen): solo para quien tiene sesión en Sotos ---- */
export function proxyJellyfin(req, res) {
  if (!JF) { res.writeHead(404); return res.end(); }
  if (!currentUser(req)) { res.writeHead(401, { "content-type": "text/plain; charset=utf-8" }); return res.end("Inicia sesión en Sotos"); }
  const t = new URL(JF);
  const headers = { ...req.headers, host: t.host }; delete headers.cookie; // la sesión de Sotos no se le pasa a Jellyfin
  const up = http.request({ hostname: t.hostname, port: t.port || 80, path: req.url, method: req.method, headers }, (r) => {
    const h = { ...r.headers }; delete h["x-frame-options"]; delete h["content-security-policy"];
    res.writeHead(r.statusCode, h); r.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) { res.writeHead(502, { "content-type": "text/plain; charset=utf-8" }); res.end("Jellyfin no responde"); } else res.destroy(); });
  req.pipe(up);
}
/** WebSocket de Jellyfin (avisos en vivo, reproducción remota) */
export function upgradeJellyfin(req, socket, head) {
  if (!JF || !currentUser(req)) { socket.destroy(); return; }
  const t = new URL(JF); const up = net.connect(Number(t.port || 80), t.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`, ...Object.entries({ ...req.headers, host: t.host }).filter(([k]) => k !== "cookie").map(([k, v]) => `${k}: ${v}`), "", ""];
    up.write(lines.join("\r\n")); if (head?.length) up.write(head); up.pipe(socket); socket.pipe(up);
  });
  up.on("error", () => socket.destroy()); socket.on("error", () => up.destroy());
}
