// Sotos — cambiar la contraseña de una cuenta desde el propio servidor (por ejemplo, si el administrador la olvidó)
// Uso, en una ventana de PowerShell o terminal del servidor:
//   node scripts/restablecer-clave.mjs correo@ejemplo.com
// Pide la contraseña nueva sin mostrarla en pantalla y cierra las sesiones abiertas de esa cuenta.
// © 2026 Sebastian Sotomontes
import crypto from "node:crypto"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.resolve(process.env.SOTOS_DATA || path.join(ROOT, "server/data"));
const email = String(process.argv[2] || "").trim().toLowerCase();
if (!email) { console.log("Uso: node scripts/restablecer-clave.mjs correo@ejemplo.com"); process.exit(1); }
const db = new DatabaseSync(path.join(DATA, "sotos.db")); db.exec("PRAGMA busy_timeout = 8000");
const u = db.prepare("SELECT id, name, role FROM users WHERE email = ?").get(email);
if (!u) { console.log("No hay ninguna cuenta con ese correo."); process.exit(1); }
const ask = (q) => new Promise((ok) => { // lectura sin eco
  process.stdout.write(q); const s = process.stdin; let v = ""; s.setRawMode?.(true); s.resume(); s.setEncoding("utf8");
  const on = (ch) => { for (const c of ch) { if (c === "\r" || c === "\n") { s.setRawMode?.(false); s.pause(); s.off("data", on); process.stdout.write("\n"); return ok(v); } if (c === "\u0003") process.exit(1); if (c === "\u007f" || c === "\b") v = v.slice(0, -1); else v += c; } };
  s.on("data", on);
});
console.log(`Cuenta: ${u.name} (${email}) · ${u.role === "admin" ? "administrador" : "usuario"}`);
const a = await ask("Contraseña nueva (mín. 8): "); const b = await ask("Repítela: ");
if (a.length < 8) { console.log("Debe tener al menos 8 caracteres."); process.exit(1); }
if (a !== b) { console.log("No coinciden."); process.exit(1); }
const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(a, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
db.prepare("UPDATE users SET pass = ? WHERE id = ?").run(`s1$${salt.toString("base64")}$${key.toString("base64")}`, u.id);
db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
console.log("Listo: contraseña cambiada y sesiones anteriores cerradas.");
