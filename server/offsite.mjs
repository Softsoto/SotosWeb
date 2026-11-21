/* ============================================================
   Sotos — copia fuera del servidor (otro disco, un NAS o almacenamiento S3)
   Después de cada copia local se envía la última a un segundo lugar, para que una falla
   del disco (o un robo) no se lleve todo.

   · Carpeta: otro disco, una unidad USB o una carpeta de red montada. Cada copia es una
     carpeta con fecha; lo que no cambió se enlaza con la copia anterior (no ocupa de nuevo).
   · S3 compatible: Backblaze B2, Cloudflare R2, Wasabi, AWS S3, MinIO… El contenido de los
     archivos (que en Sotos nunca cambia una vez escrito) se sube una sola vez a objetos/;
     cada copia guarda su base de datos y la lista de lo que contiene en copias/<fecha>/.
   Se conservan las últimas N; el contenido que ya ninguna copia usa se borra.
   Las claves de acceso se guardan cifradas. Firma AWS v4 propia, sin dependencias.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting, secret } from "./db.mjs";
import { listBackups, BACKUP_DIR, afterBackup } from "./backup.mjs";
import { s3client as s3raw, sigV4 } from "./s3.mjs";
export { sigV4 };
const s3client = (c) => s3raw({ ...c, secret: dec(c.secret_enc) });

const LINKABLE = new Set(["blobs", "vault"]); // contenido inmutable (se sube una vez)
const key = () => crypto.createHash("sha256").update(secret("offsite")).digest();
const enc = (s) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv); const o = Buffer.concat([c.update(String(s), "utf8"), c.final()]); return [iv, c.getAuthTag(), o].map(b => b.toString("base64")).join("."); };
const dec = (s) => { const [iv, tag, o] = s.split(".").map(x => Buffer.from(x, "base64")); const d = crypto.createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(o), d.final()]).toString("utf8"); };

export const offsiteConfig = () => getSetting("offsite", null);
export function publicOffsite() {
  const c = offsiteConfig(); const st = getSetting("offsiteStatus", null);
  return { config: c ? { kind: c.kind, keep: c.keep, folder: c.folder, s3: c.s3 && { endpoint: c.s3.endpoint, region: c.s3.region, bucket: c.s3.bucket, prefix: c.s3.prefix, accessKey: c.s3.accessKey, hasSecret: !!c.s3.secret_enc } } : null, status: st, running: !!running };
}
export function saveOffsite(b) {
  if (!b) { setSetting("offsite", null); return; }
  const old = offsiteConfig(); const keep = Math.max(1, Math.min(90, Math.round(Number(b.keep) || 7)));
  if (b.kind === "folder") {
    const folder = path.resolve(String(b.folder || "").trim()); if (!String(b.folder || "").trim()) throw Object.assign(new Error("Escribe la carpeta de destino"), { status: 400 });
    if (path.resolve(folder).startsWith(path.resolve(BACKUP_DIR)) || BACKUP_DIR.startsWith(folder + path.sep)) throw Object.assign(new Error("Elige una carpeta distinta de la de las copias locales"), { status: 400 });
    setSetting("offsite", { kind: "folder", folder, keep }); return;
  }
  if (b.kind === "s3") {
    const s = b.s3 || {}; const endpoint = String(s.endpoint || "").trim().replace(/\/+$/, ""), bucket = String(s.bucket || "").trim();
    if (!/^https?:\/\/[^\s/]+$/i.test(endpoint)) throw Object.assign(new Error("Dirección del servicio no válida (ej.: https://s3.us-west-004.backblazeb2.com)"), { status: 400 });
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(bucket)) throw Object.assign(new Error("Nombre de bucket no válido"), { status: 400 });
    const secret_enc = s.secret ? enc(s.secret) : old?.s3?.secret_enc; if (!s.accessKey || !secret_enc) throw Object.assign(new Error("Faltan la clave de acceso y la clave secreta"), { status: 400 });
    setSetting("offsite", { kind: "s3", keep, s3: { endpoint, region: String(s.region || "auto").trim() || "auto", bucket, prefix: String(s.prefix || "sotos").replace(/^\/+|\/+$/g, ""), accessKey: String(s.accessKey).trim(), secret_enc } }); return;
  }
  throw Object.assign(new Error("Elige un destino"), { status: 400 });
}

/* ---------------- envío ---------------- */
function walkFiles(dir, rel = "", out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name), r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walkFiles(p, r, out); else if (e.isFile()) out.push({ rel: r, abs: p, size: fs.statSync(p).size }); }
  return out;
}
let running = null;
export function runOffsite(log = () => {}) {
  if (running) return running;
  running = (async () => {
    const c = offsiteConfig(); if (!c) throw new Error("No hay un destino configurado");
    const b = listBackups().find(x => x.complete); if (!b) throw new Error("Todavía no hay una copia local completa");
    const src = path.join(BACKUP_DIR, b.name), files = walkFiles(src), t0 = Date.now(); let sent = 0, bytes = 0, reused = 0;
    if (c.kind === "folder") {
      fs.mkdirSync(c.folder, { recursive: true });
      const prev = fs.readdirSync(c.folder).filter(n => /^\d{4}-\d{2}-\d{2}_/.test(n) && fs.existsSync(path.join(c.folder, n, "copia.json")) && n !== b.name).sort().pop();
      const dst = path.join(c.folder, b.name), tmp = dst + ".enviando"; fs.rmSync(tmp, { recursive: true, force: true });
      for (const f of files) {
        if (f.rel === "copia.json") continue;
        const to = path.join(tmp, f.rel); fs.mkdirSync(path.dirname(to), { recursive: true });
        const old = prev && LINKABLE.has(f.rel.split("/")[0]) ? path.join(c.folder, prev, f.rel) : null;
        if (old && fs.existsSync(old) && fs.statSync(old).size === f.size) { try { fs.linkSync(old, to); reused++; continue; } catch {} }
        fs.copyFileSync(f.abs, to); sent++; bytes += f.size;
      }
      fs.copyFileSync(path.join(src, "copia.json"), path.join(tmp, "copia.json")); // al final: marca la copia como completa
      fs.rmSync(dst, { recursive: true, force: true }); fs.renameSync(tmp, dst);
      const all = fs.readdirSync(c.folder).filter(n => /^\d{4}-\d{2}-\d{2}_[\d-]+$/.test(n)).sort().reverse();
      for (const old of all.slice(c.keep)) fs.rmSync(path.join(c.folder, old), { recursive: true, force: true });
    } else {
      const s3 = s3client(c.s3), P = c.s3.prefix ? c.s3.prefix + "/" : "";
      log("Revisando lo que ya está en el almacenamiento…");
      const have = await s3.list(P + "objetos/");
      const manifest = { name: b.name, created: b.started, files: [] };
      for (const f of files) {
        if (f.rel === "copia.json") continue;
        if (LINKABLE.has(f.rel.split("/")[0])) { const k = P + "objetos/" + f.rel; manifest.files.push(f.rel);
          if (have.get(k) === f.size) { reused++; continue; } await s3.put(k, f.abs); sent++; bytes += f.size; if (sent % 50 === 0) log(`${sent} archivo(s) enviados…`); }
        else { await s3.put(P + `copias/${b.name}/${f.rel}`, f.abs); sent++; bytes += f.size; }
      }
      await s3.putText(P + `copias/${b.name}/lista.json`, JSON.stringify(manifest));
      await s3.put(P + `copias/${b.name}/copia.json`, path.join(src, "copia.json")); // al final: marca la copia como completa
      // rotación y limpieza del contenido que ya ninguna copia usa
      const snaps = [...new Set([...(await s3.list(P + "copias/")).keys()].map(k => k.slice((P + "copias/").length).split("/")[0]))].sort().reverse();
      for (const old of snaps.slice(c.keep)) for (const k of (await s3.list(P + `copias/${old}/`)).keys()) await s3.del(k);
      const used = new Set(); for (const s of snaps.slice(0, c.keep)) { try { for (const r of JSON.parse(await s3.get(P + `copias/${s}/lista.json`)).files) used.add(P + "objetos/" + r); } catch {} }
      if (used.size) for (const k of (await s3.list(P + "objetos/")).keys()) if (!used.has(k)) await s3.del(k);
    }
    const st = { ok: true, at: Date.now(), backup: b.name, sent, reused, bytes, secs: Math.round((Date.now() - t0) / 1000), kind: c.kind };
    setSetting("offsiteStatus", st); console.log(`[copias] fuera del servidor: ${b.name} · ${sent} enviados, ${reused} ya estaban`); return st;
  })().catch(e => { setSetting("offsiteStatus", { ok: false, at: Date.now(), error: e.message }); console.error("[copias] fuera del servidor falló:", e.message); throw e; })
    .finally(() => { running = null; });
  return running;
}
/** prueba el destino: escribe, lee y borra un archivo pequeño */
export async function testOffsite() {
  const c = offsiteConfig(); if (!c) throw new Error("No hay un destino configurado");
  if (c.kind === "folder") { fs.mkdirSync(c.folder, { recursive: true }); const f = path.join(c.folder, ".sotos-prueba"); fs.writeFileSync(f, "ok"); const ok = fs.readFileSync(f, "utf8") === "ok"; fs.rmSync(f); if (!ok) throw new Error("No se pudo leer lo escrito"); return { ok: true }; }
  const s3 = s3client(c.s3), k = (c.s3.prefix ? c.s3.prefix + "/" : "") + ".sotos-prueba";
  await s3.putText(k, "ok", "text/plain"); const back = await s3.get(k); await s3.del(k);
  if (back !== "ok") throw new Error("Se escribió, pero no se pudo leer"); return { ok: true };
}
// cada copia local termina enviándose al destino (si hay uno)
afterBackup.push(() => offsiteConfig() && runOffsite());
