/* ============================================================
   Sotos — actualizaciones desde el panel de administración
   Una vez al día se mira si hay una versión nueva publicada en GitHub y se avisa a los
   administradores. «Actualizar ahora» hace una copia de seguridad, descarga el paquete,
   comprueba su huella SHA-256, reemplaza la aplicación (nunca los datos ni la configuración)
   y reinicia Sotos.
   No se actualiza solo: una copia de desarrollo (con .git) se actualiza con git, y una
   instalación en Docker cambiando la imagen.
   SOTOS_UPDATE_REPO  repositorio de GitHub de donde salen las versiones (Softsoto/SotosWeb)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { db, DATA_DIR, getSetting, setSetting } from "./db.mjs";
import { addNotification } from "./social.mjs";
import { runBackup } from "./backup.mjs";
import { restart } from "./setup.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPO = process.env.SOTOS_UPDATE_REPO || "Softsoto/SotosWeb";
export const currentVersion = () => { try { return fs.readFileSync(path.join(ROOT, "VERSION"), "utf8").trim(); } catch { return "0.0.0"; } };
const cmp = (a, b) => { const x = String(a).replace(/^v/, "").split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
const KEEP = new Set(["data", ".env", "sotos.env"]); // dentro de server/: no se tocan

function updatable() {
  if (fs.existsSync(path.join(ROOT, ".git"))) return { ok: false, reason: "Esta es una copia de desarrollo: actualízala con git pull." };
  if (fs.existsSync("/.dockerenv")) return { ok: false, reason: "Sotos corre en Docker: actualiza la imagen (docker compose pull o vuelve a construirla)." };
  try { fs.accessSync(path.join(ROOT, "server"), fs.constants.W_OK); } catch { return { ok: false, reason: "La carpeta de Sotos no tiene permiso de escritura." }; }
  return { ok: true };
}

let cache = null;
export async function checkUpdate(force = false) {
  if (!force && cache && Date.now() - cache.at < 6 * 3600_000) return cache.data;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: "application/vnd.github+json", "user-agent": "Sotos-updater" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  const rel = await r.json(); const latest = String(rel.tag_name || "").replace(/^v/, "");
  const asset = (rel.assets || []).find(a => /^sotos-[\d.]+\.tar\.gz$/.test(a.name));
  const data = { current: currentVersion(), latest, newer: cmp(latest, currentVersion()) > 0, name: rel.name, notes: String(rel.body || "").slice(0, 6000), url: rel.html_url, published: rel.published_at,
    asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size, digest: asset.digest || null } : null, ...updatable() };
  cache = { at: Date.now(), data }; return data;
}

const sh = (cmd, args, cwd, env) => new Promise((ok, bad) => execFile(cmd, args, { cwd, env, windowsHide: true, timeout: 600_000 }, (e, o, er) => e ? bad(new Error(String(er || e.message).trim().split("\n").filter(l => /Error|error/.test(l)).pop() || String(er || e.message).trim().split("\n").pop())) : ok(o)));
function copyInto(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src)) copyInto(path.join(src, e), path.join(dst, e)); }
  else fs.copyFileSync(src, dst);
}

// lo que nunca se toca al actualizar: datos, configuración y lanzadores creados por el instalador
const LEAVE = new Set(["data", "node_modules", ".env", "sotos.env", "iniciar-sotos.cmd", "iniciar-sotos.sh", "abrir-sotos.vbs", ".git"]);
const appEntries = (dir) => fs.readdirSync(dir).filter(e => !LEAVE.has(e));
/** reemplaza la aplicación por la del paquete (todo lo que traiga, no una lista fija), guarda la anterior en «backup»,
 *  comprueba que la nueva arranca y, si no, deja todo como estaba */
export async function installPackage(top, backup, log = () => {}) {
  fs.rmSync(backup, { recursive: true, force: true }); fs.mkdirSync(backup, { recursive: true });
  const swap = (from, to, list) => { for (const e of list) { const s = path.join(from, e), d = path.join(to, e); if (!fs.existsSync(s)) continue;
    if (e === "server") { fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(s)) if (!KEEP.has(f)) { fs.rmSync(path.join(d, f), { recursive: true, force: true }); copyInto(path.join(s, f), path.join(d, f)); } }
    else { fs.rmSync(d, { recursive: true, force: true }); copyInto(s, d); } } };
  const oldList = appEntries(ROOT), newList = appEntries(top);
  swap(ROOT, backup, oldList);                                                        // 1) copia de la versión actual
  for (const e of oldList) if (!newList.includes(e) && e !== "server") fs.rmSync(path.join(ROOT, e), { recursive: true, force: true }); // lo que ya no existe
  swap(top, ROOT, newList);                                                           // 2) la versión nueva
  try { await sh(process.execPath, [path.join(ROOT, "server", "index.mjs")], ROOT, { ...process.env, SOTOS_SMOKE: "1" }); } // 3) ¿arranca?
  catch (e) {
    log("La versión nueva no arrancó: se vuelve a la anterior…");
    for (const e2 of newList) if (!oldList.includes(e2) && e2 !== "server") fs.rmSync(path.join(ROOT, e2), { recursive: true, force: true });
    swap(backup, ROOT, oldList);
    throw new Error("La versión nueva no arrancó y se dejó la anterior (" + String(e.message).slice(0, 200) + ")");
  }
}

let running = null;
export function applyUpdate(log) {
  if (running) throw new Error("Ya hay una actualización en curso");
  running = (async () => {
    const info = await checkUpdate(true);
    if (!info.ok) throw new Error(info.reason);
    if (!info.newer) throw new Error("Ya tienes la última versión");
    if (!info.asset) throw new Error("La versión publicada no trae el paquete de Sotos");
    log("Haciendo una copia de seguridad antes de actualizar…"); await runBackup("antes de actualizar a " + info.latest);
    const dir = path.join(DATA_DIR, "actualizaciones"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, info.asset.name);
    log(`Descargando ${info.asset.name} (${(info.asset.size / 1048576).toFixed(1)} MB)…`);
    const r = await fetch(info.asset.url, { signal: AbortSignal.timeout(600_000) }); if (!r.ok) throw new Error("No se pudo descargar el paquete");
    const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(file, buf);
    const sum = crypto.createHash("sha256").update(buf).digest("hex");
    if (info.asset.digest && info.asset.digest !== "sha256:" + sum) throw new Error("La huella del paquete no coincide: no se instaló nada");
    log("Huella SHA-256 verificada. Descomprimiendo…");
    const x = path.join(dir, "x"); fs.mkdirSync(x); await sh("tar", ["-xzf", file, "-C", x]);
    const top = fs.readdirSync(x).map(n => path.join(x, n)).find(p => fs.existsSync(path.join(p, "VERSION")));
    if (!top) throw new Error("El paquete no tiene el formato esperado");
    log("Instalando la versión nueva (tus datos y tu configuración no se tocan)…");
    await installPackage(top, path.join(dir, "anterior"), log);
    fs.rmSync(dir, { recursive: true, force: true });
    setSetting("updatedTo", { version: info.latest, at: Date.now() });
    log(`Sotos ${info.latest} instalado. Reiniciando…`);
    return info.latest;
  })().finally(() => { running = null; });
  return running;
}

// aviso diario a los administradores cuando hay una versión nueva (una vez por versión)
if (process.env.SOTOS_TEST !== "1") {
  const tick = async () => { try { const u = await checkUpdate(true); if (u.newer && getSetting("updateNotified") !== u.latest) { setSetting("updateNotified", u.latest);
    for (const a of db.prepare("SELECT id FROM users WHERE role = 'admin'").all()) addNotification(a.id, { kind: "system", title: `Sotos ${u.latest} está disponible`, body: u.ok ? "Puedes actualizar desde Administración → Servidor." : u.reason, link: { app: "admin" } }); } } catch {} };
  setTimeout(tick, 5 * 60_000).unref(); setInterval(tick, 24 * 3600_000).unref();
}
export { restart };
