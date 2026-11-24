/* ============================================================
   Sotos — carpetas con contraseña (lado del escritorio)
   El servidor decide (server/candados.mjs): sin la contraseña no entrega el contenido.
   Aquí: saber qué carpetas tienen contraseña y cuáles están abiertas, la pantalla para
   abrirlas, el menú (poner, cambiar, quitar, cerrar ya) y esconder su contenido en
   Archivos y en la búsqueda mientras están cerradas.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React, { useEffect, useState } from "react";
import { Ic, Modal, toast } from "./ui.jsx";
import { api } from "./api.js";
import * as vfs from "./vfs.js";

/* ---- estado compartido: nodeId → abierta (true) / cerrada (false) ---- */
let locks = new Map(), loaded = false;
const subs = new Set();
const emit = () => subs.forEach(f => f());
vfs.setWalkHide((n) => locks.has(n.id) && !locks.get(n.id)); // búsquedas y listas no entran en carpetas cerradas
export async function refreshLocks() {
  if (vfs.getState().mode !== "cloud") { locks = new Map(); loaded = true; emit(); return; }
  try { const r = await api("GET", "fs/locks"); locks = new Map(r.items.map(i => [i.nodeId, !!i.unlocked])); } catch {}
  loaded = true; emit();
}
// se cierran solas en el servidor a los 15 min sin uso: se vuelve a preguntar cada minuto
setInterval(() => { if (locks.size) refreshLocks(); }, 60_000);

export const hasLock = (id) => locks.has(id);
export const isOpen = (id) => locks.get(id) === true;
/** la carpeta con contraseña cerrada que contiene a id (incluida ella misma), o null */
export function closedAbove(id) {
  if (!locks.size) return null;
  for (const p of [...vfs.pathOf(id), vfs.node(id)].filter(Boolean)) if (locks.has(p.id) && !locks.get(p.id)) return p;
  return null;
}
export function useLocks() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(x => x + 1); subs.add(f); if (!loaded) refreshLocks(); return () => subs.delete(f); }, []);
  return { hasLock, isOpen, closedAbove };
}

/* ---- acciones ---- */
const dropLocalCopies = (folderId) => { const n = vfs.node(folderId); if (!n) return; const ids = []; vfs.walk(x => { if (!x.children) ids.push(x.id); }, n, { all: true }); ids.forEach(id => vfs.dropCache?.(id)); };
async function unlock(id, password) { await api("POST", `fs/locks/${id}/unlock`, { password }); await refreshLocks(); }
async function lockNow(id) { await api("POST", `fs/locks/${id}/lock`); dropLocalCopies(id); await refreshLocks(); }

/** opciones del menú contextual para una sola carpeta (solo con cuenta en la nube) */
export function lockMenuItems(nodes) {
  if (nodes.length !== 1 || nodes[0].type !== "folder" || vfs.getState().mode !== "cloud") return [];
  const n = nodes[0];
  if (n.id === vfs.ROOT || n.id === vfs.DESKTOP) return [];
  if (!hasLock(n.id)) return [{ id: "lock:set", label: "Poner contraseña…", icon: "lock" }];
  return [
    ...(isOpen(n.id) ? [{ id: "lock:now", label: "Cerrar con contraseña ahora", icon: "lock" }] : [{ id: "lock:open", label: "Abrir con contraseña…", icon: "lock_open" }]),
    { id: "lock:change", label: "Cambiar contraseña…", icon: "password" },
    { id: "lock:remove", label: "Quitar contraseña…", icon: "no_encryption" },
  ];
}
let dialog = null; const dsubs = new Set();
const setDialog = (d) => { dialog = d; dsubs.forEach(f => f()); };
export function runLockAction(action, node) {
  if (action === "lock:now") return lockNow(node.id).then(() => toast(`«${node.name}» quedó cerrada`, { icon: "lock" })).catch(e => toast(e.message, { error: true }));
  setDialog({ kind: action.slice(5), node });
}
export const askUnlock = (node) => new Promise(ok => setDialog({ kind: "open", node, done: ok }));

/* ---- ventanas (montadas una vez en el escritorio) ---- */
export function LockDialogs() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(x => x + 1); dsubs.add(f); return () => dsubs.delete(f); }, []);
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [cur, setCur] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { setPw(""); setPw2(""); setCur(""); }, [dialog]);
  if (!dialog) return null;
  const { kind, node, done } = dialog;
  const close = (ok) => { setDialog(null); done?.(!!ok); };
  const T = { set: ["Poner contraseña", "lock"], open: ["Carpeta con contraseña", "lock"], change: ["Cambiar contraseña", "password"], remove: ["Quitar contraseña", "no_encryption"] }[kind];
  const valid = kind === "set" ? pw.length >= 4 && pw === pw2 : kind === "change" ? cur && pw.length >= 4 && pw === pw2 : !!pw;
  const go = async () => {
    if (!valid || busy) return; setBusy(true);
    try {
      if (kind === "set") { await api("POST", "fs/locks", { nodeId: node.id, password: pw }); dropLocalCopies(node.id); await refreshLocks(); toast(`«${node.name}» ahora pide contraseña`, { icon: "lock" }); }
      else if (kind === "open") { await unlock(node.id, pw); toast(`«${node.name}» abierta por 15 minutos`, { icon: "lock_open" }); }
      else if (kind === "change") { await api("PUT", `fs/locks/${node.id}`, { password: cur, next: pw }); toast("Contraseña cambiada", { icon: "password" }); }
      else if (kind === "remove") { await api("DELETE", `fs/locks/${node.id}`, { password: pw }); await refreshLocks(); toast(`«${node.name}» ya no pide contraseña`, { icon: "no_encryption" }); }
      close(true);
    } catch (e) { toast(e.message, { error: true }); }
    setBusy(false);
  };
  const field = (v, s, ph, auto) => <input className="lock-input" type="password" autoFocus={auto} autoComplete="new-password" placeholder={ph} value={v} onChange={e => s(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />;
  return (
    <Modal title={`${T[0]}: «${node.name}»`} icon={T[1]} width={400} onClose={() => close(false)}
      actions={<><button className="tb-btn" onClick={() => close(false)}>Cancelar</button><button className="tb-btn primary" disabled={!valid || busy} onClick={go}>{busy ? "…" : kind === "set" ? "Poner contraseña" : kind === "open" ? "Abrir" : kind === "change" ? "Cambiar" : "Quitar"}</button></>}>
      <div className="lock-form">
        {kind === "set" && <div className="faint">Sin la contraseña no se podrá abrir, ver, descargar, compartir ni cambiar nada de lo que hay dentro, desde ningún lado. Al escribirla queda abierta 15 minutos.</div>}
        {kind === "change" && field(cur, setCur, "Contraseña actual", true)}
        {field(pw, setPw, kind === "change" ? "Contraseña nueva (mínimo 4)" : kind === "set" ? "Contraseña (mínimo 4)" : "Contraseña", kind !== "change")}
        {(kind === "set" || kind === "change") && field(pw2, setPw2, "Repítela")}
        {(kind === "set" || kind === "change") && pw2 && pw !== pw2 && <div className="lock-err">No coinciden</div>}
      </div>
    </Modal>
  );
}

/** lo que se ve en Archivos al entrar a una carpeta con contraseña cerrada */
export function LockGate({ folder }) {
  const [pw, setPw] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => { if (!pw || busy) return; setBusy(true); try { await unlock(folder.id, pw); setPw(""); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  return (
    <div className="lock-gate">
      <div className="lock-gate-ico"><Ic name="lock" size={34} /></div>
      <b>«{folder.name}» tiene contraseña</b>
      <span className="faint">Escríbela para ver lo que hay dentro. Se vuelve a cerrar sola a los 15 minutos sin uso.</span>
      <div className="lock-gate-row">
        <input className="lock-input" type="password" autoFocus placeholder="Contraseña" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} onMouseDown={e => e.stopPropagation()} />
        <button className="tb-btn primary" disabled={!pw || busy} onClick={go}><Ic name="lock_open" /> Abrir</button>
      </div>
    </div>
  );
}
