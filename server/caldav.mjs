/* ============================================================
   Sotos — CalDAV y CardDAV: tu calendario y tus contactos en el celular y el computador
   iPhone/iPad/Mac, Android (DAVx⁵), Thunderbird, Outlook (con complemento) y GNOME/KDE.
   Dirección: http(s)://<servidor>/   (se descubre sola por /.well-known/caldav y /.well-known/carddav)
   usuario: tu correo · clave: una contraseña de aplicación (las mismas de la unidad de red)

   /cal/                         raíz: dice quién eres (current-user-principal)
   /cal/me/                      tu «principal»: dónde están tus calendarios y contactos
   /cal/me/calendars/<id>/       cada calendario personal y el de cada Mundo (w-<id>) · eventos <nombre>.ics
   /cal/me/contacts/default/     tu agenda de contactos · <nombre>.vcf
   Lo que cambia por aquí aparece al momento en la web (y al revés).
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import { db, now, rid } from "./db.mjs";
import { rateLimit, clientIp } from "./http.mjs";
import { davUser } from "./dav.mjs";
import { notify } from "./fs.mjs";

// nombre del recurso que eligió el cliente (p. ej. «A1B2-….ics») y su UID; el texto original para no perder lo que Sotos no entiende
for (const [t, cols] of [["events", ["dav_name TEXT", "uid TEXT", "ical TEXT", "ical_at INTEGER"]], ["contacts", ["dav_name TEXT", "uid TEXT", "vcard TEXT", "vcard_at INTEGER"]]])
  for (const c of cols) if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c.split(" ")[0])) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`);

const xml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const send = (res, status, body = "", headers = {}) => { res.writeHead(status, { "content-length": Buffer.byteLength(body), ...headers }); res.end(body); };
const readBody = (req, max = 2 * 1024 * 1024) => new Promise((ok, bad) => { const chunks = []; let n = 0; req.on("data", c => { n += c.length; if (n > max) { bad(Object.assign(new Error("too big"), { status: 413 })); req.destroy(); } else chunks.push(c); }); req.on("end", () => ok(Buffer.concat(chunks).toString("utf8"))); req.on("error", bad); });
const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/"';
const multistatus = (res, inner) => send(res, 207, `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus ${NS}>${inner}</d:multistatus>`, { "content-type": "application/xml; charset=utf-8" });
const resp = (href, props, missing = "") => `<d:response><d:href>${xml(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>${missing ? `<d:propstat><d:prop>${missing}</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>` : ""}</d:response>`;
const etagOf = (id, t) => `"${id}-${Number(t || 0).toString(36)}"`;
const BASE = { DAV: "1, 3, calendar-access, addressbook", "x-content-type-options": "nosniff" };

/* ---------------- fechas e iCalendar ---------------- */
const pad = (n, l = 2) => String(n).padStart(l, "0");
const utcStamp = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const localDate = (t) => { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }; // todo el día: medianoche local (TZ del servidor)
const DAY = 86400_000;
const offsetAt = (tz, t) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map(x => [x.type, x.value])); return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000; };
function zoned(y, mo, d, h, mi, s, tz) { const guess = Date.UTC(y, mo - 1, d, h, mi, s); try { let t = guess - offsetAt(tz, guess); t = guess - offsetAt(tz, t); return t; } catch { return new Date(y, mo - 1, d, h, mi, s).getTime(); } }
function parseDate(params, val) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(val.trim()); if (!m) return null;
  const [, y, mo, d, h, mi, s = "0", z] = m;
  if (h === undefined) return { t: new Date(+y, mo - 1, +d).getTime(), allDay: true };
  if (z) return { t: Date.UTC(+y, mo - 1, +d, +h, +mi, +s), allDay: false };
  const tz = /TZID=("?)([^;:"]+)\1/.exec(params)?.[2];
  return { t: tz ? zoned(+y, +mo, +d, +h, +mi, +s, tz) : new Date(+y, mo - 1, +d, +h, +mi, +s).getTime(), allDay: false };
}
// líneas de contenido: desdoblar, separar nombre;parámetros:valor
const unfold = (text) => text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter(Boolean);
const split = (line) => { let q = false, i = 0; for (; i < line.length; i++) { if (line[i] === '"') q = !q; else if (line[i] === ":" && !q) break; } const head = line.slice(0, i), [name, ...ps] = head.split(";"); return { name: name.toUpperCase(), params: ps.join(";"), value: line.slice(i + 1) }; };
const unesc = (v) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
const esc = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
const fold = (line) => { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let n = 74; while (Buffer.byteLength(s.slice(0, n)) > 74) n--; out.push(s.slice(0, n)); s = " " + s.slice(n); } out.push(s); return out.join("\r\n"); };
const block = (lines) => lines.filter(Boolean).map(fold).join("\r\n") + "\r\n";

function parseEvent(text) {
  const lines = unfold(text); let inEv = false, depth = 0, alarm = false; const e = {};
  for (const l of lines) {
    const { name, params, value } = split(l);
    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") { if (inEv) depth++; else { inEv = true; continue; } }
    if (!inEv) continue;
    if (name === "END" && value.toUpperCase() === "VEVENT") { if (depth) depth--; else break; }
    if (name === "BEGIN" && value.toUpperCase() === "VALARM") alarm = true;
    else if (name === "END" && value.toUpperCase() === "VALARM") alarm = false;
    else if (alarm) { if (name === "TRIGGER" && e.remind == null) { const m = /^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(value.trim()); if (m) e.remind = ((+m[1] || 0) * 7 * 1440) + ((+m[2] || 0) * 1440) + ((+m[3] || 0) * 60) + (+m[4] || 0); } }
    else if (name === "UID") e.uid = value.trim();
    else if (name === "SUMMARY") e.title = unesc(value);
    else if (name === "LOCATION") e.location = unesc(value);
    else if (name === "DESCRIPTION") e.notes = unesc(value);
    else if (name === "DTSTART") { const p = parseDate(params, value); if (p) { e.start = p.t; e.allDay = p.allDay; } }
    else if (name === "DTEND") { const p = parseDate(params, value); if (p) e.end = p.allDay ? p.t - DAY : p.t; }
    else if (name === "DURATION") e.duration = value.trim();
  }
  if (!e.start) return null;
  if (e.end == null && e.duration) { const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(e.duration); if (m) e.end = e.start + (((+m[1] || 0) * 7 + (+m[2] || 0)) * DAY) + ((+m[3] || 0) * 3600_000) + ((+m[4] || 0) * 60_000) + ((+m[5] || 0) * 1000) - (e.allDay ? DAY : 0); }
  if (e.end == null || e.end < e.start) e.end = e.allDay ? e.start : e.start + 3600_000;
  return e;
}
function eventIcs(e) {
  // si el cliente lo creó y nadie lo cambió desde la web, se devuelve tal cual (repeticiones, invitados…)
  if (e.ical && e.ical_at === e.updated) return e.ical;
  return block(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sotos//Calendario//ES", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${e.uid || e.id + "@sotos"}`, `DTSTAMP:${utcStamp(e.updated)}`, `CREATED:${utcStamp(e.created)}`, `LAST-MODIFIED:${utcStamp(e.updated)}`,
    e.all_day ? `DTSTART;VALUE=DATE:${localDate(e.start)}` : `DTSTART:${utcStamp(e.start)}`,
    e.all_day ? `DTEND;VALUE=DATE:${localDate(e.end + DAY)}` : `DTEND:${utcStamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`, e.location ? `LOCATION:${esc(e.location)}` : null, e.notes ? `DESCRIPTION:${esc(e.notes)}` : null,
    ...(e.remind != null ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.remind}M`, "END:VALARM"] : []),
    "END:VEVENT", "END:VCALENDAR"]);
}

/* ---------------- vCard ---------------- */
function parseCard(text) {
  const c = { emails: [], phones: [] };
  for (const l of unfold(text)) {
    const { name: n0, value } = split(l); const name = n0.replace(/^ITEM\d+\./, "");
    if (name === "UID") c.uid = value.trim();
    else if (name === "FN") c.name = unesc(value);
    else if (name === "N" && !c.n) { const [last, first] = value.split(";").map(unesc); c.n = [first, last].filter(Boolean).join(" "); }
    else if (name === "EMAIL") c.emails.push(value.trim());
    else if (name === "TEL") c.phones.push(value.trim());
    else if (name === "ORG") c.company = unesc(value.split(";")[0]);
    else if (name === "NOTE") c.notes = unesc(value);
  }
  c.name = (c.name || c.n || c.emails[0] || c.phones[0] || "").trim().slice(0, 120);
  return c.name ? c : null;
}
function contactVcf(c) {
  if (c.vcard && c.vcard_at === c.updated) return c.vcard;
  const parts = c.name.trim().split(/\s+/); const last = parts.length > 1 ? parts.pop() : "";
  return block(["BEGIN:VCARD", "VERSION:3.0", "PRODID:-//Sotos//Contactos//ES", `UID:${c.uid || c.id + "@sotos"}`, `FN:${esc(c.name)}`, `N:${esc(last)};${esc(parts.join(" "))};;;`,
    c.email ? `EMAIL;TYPE=INTERNET:${c.email}` : null, c.phone ? `TEL;TYPE=CELL:${c.phone}` : null, c.company ? `ORG:${esc(c.company)}` : null, c.notes ? `NOTE:${esc(c.notes)}` : null,
    `REV:${utcStamp(c.updated)}`, "END:VCARD"]);
}

/* ---------------- colecciones ---------------- */
const myWorlds = (uid) => db.prepare("SELECT w.id, w.name, w.color FROM world_members m JOIN worlds w ON w.id = m.world_id WHERE m.user_id = ?").all(uid);
function calendarsOf(uid) {
  if (!db.prepare("SELECT 1 FROM calendars WHERE user_id = ?").get(uid)) db.prepare("INSERT INTO calendars(id,user_id,name,color,created) VALUES(?,?,?,?,?)").run(rid(8), uid, "Personal", "#2f5d8a", now());
  return [...db.prepare("SELECT id, name, color FROM calendars WHERE user_id = ? ORDER BY created").all(uid).map(c => ({ key: c.id, name: c.name, color: c.color, where: "calendar_id = ?", arg: c.id, cal: c.id, world: null })),
    ...myWorlds(uid).map(w => ({ key: "w-" + w.id, name: `${w.name} (Mundo)`, color: w.color, where: "world_id = ?", arg: w.id, cal: null, world: w.id }))];
}
const calEvents = (c) => db.prepare(`SELECT * FROM events WHERE ${c.where}`).all(c.arg);
const ctag = (rows) => `${rows.length}-${Math.max(0, ...rows.map(r => r.updated || 0)).toString(36)}`;
const evName = (e) => e.dav_name || e.id + ".ics";
const ctName = (c) => c.dav_name || c.id + ".vcf";
const tell = (uid, wid, ev) => { if (wid) for (const m of db.prepare("SELECT user_id FROM world_members WHERE world_id = ?").all(wid)) notify(m.user_id, ev, {}); else notify(uid, ev, {}); };

function principalProps(uid, u) {
  return `<d:displayname>${xml(u.name)}</d:displayname><d:resourcetype><d:principal/></d:resourcetype>
<d:current-user-principal><d:href>/cal/me/</d:href></d:current-user-principal><d:principal-URL><d:href>/cal/me/</d:href></d:principal-URL>
<c:calendar-home-set><d:href>/cal/me/calendars/</d:href></c:calendar-home-set><card:addressbook-home-set><d:href>/cal/me/contacts/</d:href></card:addressbook-home-set>
<c:calendar-user-address-set><d:href>mailto:${xml(u.email)}</d:href></c:calendar-user-address-set>`;
}
const privs = `<d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege><d:privilege><d:write-content/></d:privilege><d:privilege><d:bind/></d:privilege><d:privilege><d:unbind/></d:privilege></d:current-user-privilege-set>`;
function calProps(c, rows) {
  return `<d:displayname>${xml(c.name)}</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
<cs:getctag>${ctag(rows)}</cs:getctag><d:getetag>"${ctag(rows)}"</d:getetag><ic:calendar-color>${xml(c.color)}FF</ic:calendar-color>
<d:supported-report-set><d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report><d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report></d:supported-report-set>${privs}`;
}
function bookProps(rows) {
  return `<d:displayname>Contactos de Sotos</d:displayname><d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>
<cs:getctag>${ctag(rows)}</cs:getctag><d:getetag>"${ctag(rows)}"</d:getetag>
<d:supported-report-set><d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report><d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report></d:supported-report-set>${privs}`;
}
const evResp = (base, e, withData) => resp(base + encodeURIComponent(evName(e)), `<d:getetag>${etagOf(e.id, e.updated)}</d:getetag><d:getcontenttype>text/calendar; charset=utf-8; component=vevent</d:getcontenttype><d:resourcetype/>${withData ? `<c:calendar-data>${xml(eventIcs(e))}</c:calendar-data>` : ""}`);
const ctResp = (base, c, withData) => resp(base + encodeURIComponent(ctName(c)), `<d:getetag>${etagOf(c.id, c.updated)}</d:getetag><d:getcontenttype>text/vcard; charset=utf-8</d:getcontenttype><d:resourcetype/>${withData ? `<card:address-data>${xml(contactVcf(c))}</card:address-data>` : ""}`);
const hrefsIn = (body) => [...body.matchAll(/<(?:[a-z0-9]+:)?href[^>]*>([^<]+)<\/(?:[a-z0-9]+:)?href>/gi)].map(m => { try { return decodeURIComponent(m[1].trim().replace(/^https?:\/\/[^/]+/, "")); } catch { return m[1].trim(); } });
const ifMatch = (req, etag) => { const im = req.headers["if-match"], inm = req.headers["if-none-match"]; if (im && im !== "*" && im !== etag) return false; if (inm === "*" && etag) return false; return true; };

/* ---------------- servidor ---------------- */
export async function handleCalDav(req, res) {
  const url = new URL(req.url, "http://x"); const p = url.pathname;
  if (p === "/.well-known/caldav" || p === "/.well-known/carddav") return send(res, 301, "", { Location: "/cal/", ...BASE });
  if (req.method === "OPTIONS") return send(res, 200, "", { ...BASE, Allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT" });
  rateLimit("caldav:" + clientIp(req), 3000, 60_000);
  const u = davUser(req);
  if (!u) { rateLimit("dav-fail:" + clientIp(req), 30, 900_000); req.resume(); return send(res, 401, "Usa tu correo y una contraseña de aplicación de Sotos", { ...BASE, "WWW-Authenticate": 'Basic realm="Sotos", charset="UTF-8"' }); }
  const parts = p.replace(/^\/cal\/?/, "").split("/").filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  const body = ["PROPFIND", "REPORT", "PUT", "PROPPATCH"].includes(req.method) ? await readBody(req) : (req.resume(), "");
  const depth = String(req.headers.depth ?? "0");

  // raíz y principal
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "me")) {
    if (req.method !== "PROPFIND") return send(res, 405, "", BASE);
    const href = parts.length ? "/cal/me/" : "/cal/";
    return multistatus(res, resp(href, parts.length ? principalProps(u.id, u) : `<d:resourcetype><d:collection/></d:resourcetype><d:current-user-principal><d:href>/cal/me/</d:href></d:current-user-principal>`));
  }
  if (parts[0] !== "me") return send(res, 404, "", BASE);
  const kind = parts[1];

  /* -------- calendarios -------- */
  if (kind === "calendars") {
    const cals = calendarsOf(u.id);
    if (parts.length === 2) { // hogar de calendarios
      if (req.method !== "PROPFIND") return send(res, 405, "", BASE);
      let out = resp("/cal/me/calendars/", `<d:displayname>Calendarios</d:displayname><d:resourcetype><d:collection/></d:resourcetype>${privs}`);
      if (depth !== "0") for (const c of cals) out += resp(`/cal/me/calendars/${encodeURIComponent(c.key)}/`, calProps(c, calEvents(c)));
      return multistatus(res, out);
    }
    const c = cals.find(x => x.key === parts[2]); if (!c) return send(res, 404, "", BASE);
    const base = `/cal/me/calendars/${encodeURIComponent(c.key)}/`;
    if (parts.length === 3) {
      if (req.method === "PROPFIND") { const rows = calEvents(c); let out = resp(base, calProps(c, rows)); if (depth !== "0") for (const e of rows) out += evResp(base, e, false); return multistatus(res, out); }
      if (req.method === "REPORT") {
        const rows = calEvents(c);
        if (/calendar-multiget/i.test(body)) { const want = new Set(hrefsIn(body).map(h => h.split("/").pop())); return multistatus(res, rows.filter(e => want.has(evName(e))).map(e => evResp(base, e, true)).join("")); }
        const range = /<(?:[a-z0-9]+:)?time-range[^>]*start="([^"]+)"[^>]*?(?:end="([^"]+)")?/i.exec(body); const s = range ? parseDate("", range[1])?.t : null, en = range?.[2] ? parseDate("", range[2])?.t : null;
        return multistatus(res, rows.filter(e => (s == null || e.end + (e.all_day ? DAY : 0) >= s) && (en == null || e.start < en)).map(e => evResp(base, e, /calendar-data/i.test(body))).join(""));
      }
      if (req.method === "PROPPATCH") return multistatus(res, resp(base, "")); // color y nombre: se aceptan sin cambiar nada
      return send(res, 405, "", BASE);
    }
    const name = parts[3]; const e = calEvents(c).find(x => evName(x) === name);
    if (req.method === "GET" || req.method === "HEAD") { if (!e) return send(res, 404, "", BASE); const t = eventIcs(e); res.writeHead(200, { "content-type": "text/calendar; charset=utf-8", etag: etagOf(e.id, e.updated), "content-length": Buffer.byteLength(t), ...BASE }); return res.end(req.method === "HEAD" ? "" : t); }
    if (req.method === "DELETE") { if (!e) return send(res, 404, "", BASE); if (!ifMatch(req, etagOf(e.id, e.updated))) return send(res, 412, "", BASE); db.prepare("DELETE FROM events WHERE id = ?").run(e.id); tell(u.id, c.world, "calendar"); return send(res, 204, "", BASE); }
    if (req.method === "PUT") {
      if (!ifMatch(req, e ? etagOf(e.id, e.updated) : null)) return send(res, 412, "", BASE);
      const ev = parseEvent(body); if (!ev) return send(res, 415, "Solo eventos (VEVENT) con fecha de inicio", BASE);
      const t = now(), title = (ev.title || "(sin título)").slice(0, 200), remind = ev.remind == null ? null : Math.min(10080, ev.remind);
      const vals = [title, ev.start, ev.end, ev.allDay ? 1 : 0, (ev.location || "").slice(0, 200) || null, (ev.notes || "").slice(0, 5000) || null, remind];
      if (e) { db.prepare("UPDATE events SET title=?, start=?, end=?, all_day=?, location=?, notes=?, remind=?, reminded=0, uid=COALESCE(?, uid), ical=?, ical_at=?, updated=? WHERE id=?").run(...vals, ev.uid || null, body, t, t, e.id); tell(u.id, c.world, "calendar"); return send(res, 204, "", { ...BASE, etag: etagOf(e.id, t) }); }
      const id = rid(10);
      db.prepare("INSERT INTO events(id,calendar_id,world_id,user_id,title,start,end,all_day,location,notes,remind,reminded,created,updated,dav_name,uid,ical,ical_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)")
        .run(id, c.cal, c.world, u.id, ...vals, t, t, name.slice(0, 200), ev.uid || null, body, t);
      tell(u.id, c.world, "calendar"); return send(res, 201, "", { ...BASE, etag: etagOf(id, t) });
    }
    return send(res, 405, "", BASE);
  }

  /* -------- contactos -------- */
  if (kind === "contacts") {
    const rows = () => db.prepare("SELECT * FROM contacts WHERE user_id = ?").all(u.id);
    if (parts.length === 2) {
      if (req.method !== "PROPFIND") return send(res, 405, "", BASE);
      let out = resp("/cal/me/contacts/", `<d:displayname>Contactos</d:displayname><d:resourcetype><d:collection/></d:resourcetype>${privs}`);
      if (depth !== "0") out += resp("/cal/me/contacts/default/", bookProps(rows()));
      return multistatus(res, out);
    }
    if (parts[2] !== "default") return send(res, 404, "", BASE);
    const base = "/cal/me/contacts/default/";
    if (parts.length === 3) {
      if (req.method === "PROPFIND") { const r = rows(); let out = resp(base, bookProps(r)); if (depth !== "0") for (const c of r) out += ctResp(base, c, false); return multistatus(res, out); }
      if (req.method === "REPORT") {
        const r = rows();
        if (/addressbook-multiget/i.test(body)) { const want = new Set(hrefsIn(body).map(h => h.split("/").pop())); return multistatus(res, r.filter(c => want.has(ctName(c))).map(c => ctResp(base, c, true)).join("")); }
        return multistatus(res, r.map(c => ctResp(base, c, /address-data/i.test(body))).join(""));
      }
      if (req.method === "PROPPATCH") return multistatus(res, resp(base, ""));
      return send(res, 405, "", BASE);
    }
    const name = parts[3]; const c = rows().find(x => ctName(x) === name);
    if (req.method === "GET" || req.method === "HEAD") { if (!c) return send(res, 404, "", BASE); const t = contactVcf(c); res.writeHead(200, { "content-type": "text/vcard; charset=utf-8", etag: etagOf(c.id, c.updated), "content-length": Buffer.byteLength(t), ...BASE }); return res.end(req.method === "HEAD" ? "" : t); }
    if (req.method === "DELETE") { if (!c) return send(res, 404, "", BASE); if (!ifMatch(req, etagOf(c.id, c.updated))) return send(res, 412, "", BASE); db.prepare("DELETE FROM contacts WHERE id = ?").run(c.id); notify(u.id, "contacts", {}); return send(res, 204, "", BASE); }
    if (req.method === "PUT") {
      if (!ifMatch(req, c ? etagOf(c.id, c.updated) : null)) return send(res, 412, "", BASE);
      const v = parseCard(body); if (!v) return send(res, 415, "Tarjeta sin nombre", BASE);
      const t = now(), vals = [v.name, v.emails[0]?.toLowerCase().slice(0, 200) || null, v.phones[0]?.slice(0, 60) || null, (v.company || "").slice(0, 120) || null, (v.notes || "").slice(0, 5000) || null];
      if (c) { db.prepare("UPDATE contacts SET name=?, email=?, phone=?, company=?, notes=?, uid=COALESCE(?, uid), vcard=?, vcard_at=?, updated=? WHERE id=?").run(...vals, v.uid || null, body, t, t, c.id); notify(u.id, "contacts", {}); return send(res, 204, "", { ...BASE, etag: etagOf(c.id, t) }); }
      const id = rid(10);
      db.prepare("INSERT INTO contacts(id,user_id,name,email,phone,company,notes,created,updated,dav_name,uid,vcard,vcard_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, u.id, ...vals, t, t, name.slice(0, 200), v.uid || null, body, t);
      notify(u.id, "contacts", {}); return send(res, 201, "", { ...BASE, etag: etagOf(id, t) });
    }
    return send(res, 405, "", BASE);
  }
  return send(res, 404, "", BASE);
}
