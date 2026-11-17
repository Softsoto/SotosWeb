/* ============================================================
   Sotos — copia de seguridad de la cuenta (como downloadBackup/import de inevio)
   Un .zip con todos tus archivos (con sus carpetas) y una carpeta _sotos/ con
   contactos (.vcf), calendario (.ics), tareas (.json) y ajustes.
   Importar no borra nada: los archivos van a una carpeta nueva.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import * as vfs from "./vfs.js";
import { api } from "./api.js";

const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "h");

export async function makeBackup(onProgress) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip(), cloud = vfs.getState().mode === "cloud";
  const files = []; vfs.walk(n => { if (!n.children && !(n.online && !n.size)) files.push(n); });
  let i = 0;
  const add = async (node, folder) => { for (const c of node.children || []) { if (c.children) await add(c, folder.folder(c.name)); else if (!(c.online && !c.size)) { folder.file(c.name, await vfs.read(c.id)); i++; onProgress && onProgress(i, files.length); } } };
  await add(vfs.getState().root, zip.folder("Archivos"));
  const meta = zip.folder("_sotos");
  const { toVcf } = await import("./contacts.jsx");
  const contacts = cloud ? (await api("GET", "contacts").catch(() => ({ items: [] }))).items : JSON.parse(localStorage.getItem("sotos_contacts") || "[]");
  meta.file("contactos.vcf", toVcf(contacts));
  const { toIcs } = await import("./calendar.jsx");
  const events = cloud ? (await api("GET", "calendar?from=0&to=99999999999999").catch(() => ({ events: [] }))).events.filter(e => e.mine !== false) : (JSON.parse(localStorage.getItem("sotos_calendar") || "{}").events || []);
  meta.file("calendario.ics", toIcs(events));
  const tasks = cloud ? await api("GET", "tasks").catch(() => null) : JSON.parse(localStorage.getItem("sotos_tasks") || "null");
  if (tasks) meta.file("tareas.json", JSON.stringify({ lists: tasks.lists.filter(l => !l.worldId), tasks: tasks.tasks.filter(t => tasks.lists.some(l => l.id === t.listId && !l.worldId)) }, null, 1));
  meta.file("ajustes.json", localStorage.getItem("sotos") || "{}");
  meta.file("LEEME.txt", `Copia de seguridad de Sotos — ${new Date().toLocaleString("es-CO")}\nArchivos/: todos tus archivos con sus carpetas.\n_sotos/: contactos (.vcf), calendario (.ics), tareas y ajustes.\nSotos © 2026 Sebastian Sotomontes\n`);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function downloadBackup(onProgress) {
  const blob = await makeBackup(onProgress);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Sotos copia ${stamp()}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return blob.size;
}

/** importa una copia: archivos a “/Copia restaurada …”, contactos, eventos y tareas (sin borrar nada) */
export async function importBackup(file, onProgress) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file), cloud = vfs.getState().mode === "cloud";
  const root = vfs.getState().root;
  const dest = vfs.mkdir(root.id, vfs.uniqueName(root, `Copia restaurada ${stamp()}`));
  const dirs = new Map([["", dest]]);
  const dirFor = (p) => { if (dirs.has(p)) return dirs.get(p); const i = p.lastIndexOf("/"); const par = dirFor(i < 0 ? "" : p.slice(0, i)); const id = vfs.mkdir(par, p.slice(i + 1)); dirs.set(p, id); return id; };
  const entries = Object.values(zip.files).filter(e => !e.dir && e.name.startsWith("Archivos/"));
  let n = 0;
  for (const e of entries) {
    const rel = e.name.slice(9).split("/").filter(s => s && s !== ".." && s !== ".").join("/"); if (!rel) continue;
    const i = rel.lastIndexOf("/");
    await vfs.create(dirFor(i < 0 ? "" : rel.slice(0, i)), rel.slice(i + 1), await e.async("blob"));
    n++; onProgress && onProgress(n, entries.length);
  }
  const res = { files: n, contacts: 0, events: 0, tasks: 0 };
  const vcf = zip.file("_sotos/contactos.vcf");
  if (vcf) {
    const { fromVcf } = await import("./contacts.jsx");
    const list = fromVcf(await vcf.async("string"));
    const existing = cloud ? (await api("GET", "contacts")).items : JSON.parse(localStorage.getItem("sotos_contacts") || "[]");
    const seen = new Set(existing.map(c => (c.email || c.name).toLowerCase()));
    for (const c of list) { if (seen.has((c.email || c.name).toLowerCase())) continue;
      if (cloud) await api("POST", "contacts", c).catch(() => {}); else { const l = JSON.parse(localStorage.getItem("sotos_contacts") || "[]"); l.push({ ...c, id: vfs.newId(), created: Date.now(), updated: Date.now() }); localStorage.setItem("sotos_contacts", JSON.stringify(l)); }
      res.contacts++; }
  }
  const ics = zip.file("_sotos/calendario.ics");
  if (ics) {
    const { fromIcs } = await import("./calendar.jsx");
    for (const ev of fromIcs(await ics.async("string"))) {
      if (cloud) await api("POST", "calendar/events", ev).catch(() => {}); else { const d = JSON.parse(localStorage.getItem("sotos_calendar") || '{"calendars":[{"id":"personal","name":"Personal","color":"#2f5d8a"}],"events":[]}'); d.events.push({ ...ev, id: vfs.newId(), calendarId: d.calendars[0].id }); localStorage.setItem("sotos_calendar", JSON.stringify(d)); }
      res.events++; }
  }
  const tj = zip.file("_sotos/tareas.json");
  if (tj && cloud) {
    const t = JSON.parse(await tj.async("string"));
    for (const l of t.lists || []) { const r = await api("POST", "tasks/lists", { name: l.name + " (copia)" }).catch(() => null); if (!r) continue;
      for (const x of (t.tasks || []).filter(x => x.listId === l.id)) { await api("POST", "tasks/items", { listId: r.id, title: x.title, notes: x.notes, due: x.due, priority: x.priority }).catch(() => {}); res.tasks++; } }
  }
  return { ...res, folderId: dest };
}
