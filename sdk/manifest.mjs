/* ============================================================
   Sotos SDK — manifiesto de una app (sotos-app.json)
   Lo usan el servidor (al instalar) y las herramientas del SDK (al empaquetar).
   Sin dependencias. © 2026 Sebastian Sotomontes · MIT
   ============================================================ */
export const ID = /^[a-z0-9][a-z0-9-]{1,29}$/;
export const PERMISSIONS = { "files.read": "Abrir los archivos que elijas", "files.write": "Guardar archivos donde elijas", "notify": "Mostrarte avisos", "storage": "Guardar sus propios datos en tu cuenta", "user": "Ver tu nombre e idioma" };
const RESERVED = new Set(["files", "admin", "settings", "store", "mail", "calendar", "contacts", "worlds", "docs", "sheets", "slides", "gallery", "music", "video", "browser", "terminal", "launchpad", "vault", "paint", "code", "whiteboard", "diagrams", "tasks", "games", "cine", "fotos", "whatsapp", "inbox", "trash", "editor",
  "lector", "solitario", "palabras", "rompecabezas", "ritmos", "afinador", "pixelart", "memes", "diario", "pelis", "pinball", "panel", "informes", "diagnostico", "pdfmeta", "audioext", "control", "nas"]);
export function validateManifest(m) {
  const err = (t) => { throw Object.assign(new Error("sotos-app.json: " + t), { status: 400 }); };
  if (!m || typeof m !== "object") err("no es un objeto JSON");
  if (!ID.test(m.id || "")) err("«id» debe tener 2-30 letras minúsculas, números o guiones (ej. «notas-md»)");
  if (RESERVED.has(m.id)) err(`el id «${m.id}» está reservado por Sotos`);
  if (!String(m.name || "").trim()) err("falta «name»");
  if (!/^\d+\.\d+\.\d+$/.test(m.version || "")) err("«version» debe ser como 1.0.0");
  const entry = String(m.entry || "index.html"); if (entry.includes("..") || entry.startsWith("/")) err("«entry» no válido");
  const perms = Array.isArray(m.permissions) ? m.permissions : []; for (const p of perms) if (!PERMISSIONS[p]) err(`permiso desconocido «${p}» (usa: ${Object.keys(PERMISSIONS).join(", ")})`);
  const opens = Array.isArray(m.opens) ? m.opens.map(x => String(x).toLowerCase().replace(/^\./, "")).filter(x => /^[a-z0-9]{1,10}$/.test(x)).slice(0, 30) : [];
  if (opens.length && !perms.includes("files.read")) err("para abrir archivos («opens») hace falta el permiso «files.read»");
  return { id: m.id, name: String(m.name).trim().slice(0, 40), version: m.version, entry, description: String(m.description || "").slice(0, 300), author: String(m.author || "").slice(0, 80),
    icon: /^[a-z0-9_]{2,40}$/.test(m.icon || "") ? m.icon : "extension", color: /^#[0-9a-f]{6}$/i.test(m.color || "") ? m.color : "#5a5689",
    category: String(m.category || "Herramientas").slice(0, 30), permissions: [...new Set(perms)], opens,
    size: { w: Math.max(320, Math.min(2000, Number(m.width) || 960)), h: Math.max(240, Math.min(1400, Number(m.height) || 680)) }, homepage: /^https:\/\//.test(m.homepage || "") ? m.homepage : null };
}
