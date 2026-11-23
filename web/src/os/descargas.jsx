/* ============================================================
   Sotos — Descargas al servidor
   Pega un enlace: el servidor lo baja a tu carpeta Descargas, aunque cierres el navegador.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, toast, EmptyState } from "./ui.jsx";
import { api, onServer } from "./api.js";
import { fmtSize } from "./vfs.js";
import * as vfs from "./vfs.js";
const { useState, useEffect } = React;

const STATE = { esperando: "Esperando…", bajando: "Descargando", lista: "Lista", error: "Falló", cancelada: "Cancelada" };
export function DownloadsApp({ openApp, openItem }) {
  const cloud = vfs.getState().mode === "cloud";
  const [items, setItems] = useState([]), [url, setUrl] = useState(""), [busy, setBusy] = useState(false);
  const load = () => api("GET", "descargas").then(r => setItems(r.items)).catch(() => {});
  useEffect(() => { if (!cloud) return; load(); return onServer(["descargas"], (d) => setItems(l => { const i = l.findIndex(x => x.id === d.id); if (i < 0) return [d, ...l]; const n = [...l]; n[i] = d; return n; })); }, [cloud]);
  const start = async (e) => { e.preventDefault(); setBusy(true);
    try { const j = await api("POST", "descargas", { url }); setItems(l => [j, ...l.filter(x => x.id !== j.id)]); setUrl(""); toast("Descarga iniciada en el servidor", { icon: "cloud_download" }); }
    catch (er) { toast(er.message, { error: true }); } setBusy(false); };
  const cancel = async (j) => { await api("DELETE", "descargas/" + j.id).catch(e => toast(e.message, { error: true })); if (!["esperando", "bajando"].includes(j.state)) setItems(l => l.filter(x => x.id !== j.id)); };
  if (!cloud) return <div className="app"><EmptyState icon="cloud_off" text="Las descargas al servidor necesitan una cuenta de Sotos (no funcionan como invitado)." /></div>;
  return <div className="app"><div className="app-main scroll dl-app" style={{ display: "block" }}>
    <form className="dl-new" onSubmit={start}>
      <Ic name="link" size={20} />
      <input type="url" required placeholder="Pega el enlace del archivo (https://…)" value={url} onChange={e => setUrl(e.target.value)} aria-label="Enlace del archivo" />
      <button className="tb-btn primary" disabled={busy || !url.trim()}><Ic name="cloud_download" size={18} /> Descargar</button>
    </form>
    <div className="faint dl-hint">El servidor descarga el archivo a tu carpeta Descargas y te avisa al terminar. Puedes cerrar el navegador mientras tanto.</div>
    {!items.length ? <EmptyState icon="cloud_download" text="Aún no hay descargas. Pega un enlace arriba para empezar." /> :
      <div className="dl-list">{items.map(j => { const pct = j.size ? Math.min(100, Math.round(j.got / j.size * 100)) : null; const live = ["esperando", "bajando"].includes(j.state);
        return <div key={j.id} className={"dl-row " + j.state}>
          <Ic name={j.state === "lista" ? "check_circle" : j.state === "error" ? "error" : j.state === "cancelada" ? "cancel" : "downloading"} size={22} />
          <div className="dl-body">
            <b title={j.url}>{j.name || j.url}</b>
            {live && <div className="dl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}><i style={{ width: (pct ?? 30) + "%" }} className={pct == null ? "indet" : ""} /></div>}
            <span className="faint">{STATE[j.state]}{j.got ? ` · ${fmtSize(j.got)}${j.size ? " de " + fmtSize(j.size) : ""}` : ""}{pct != null && live ? ` · ${pct}%` : ""}{j.error ? ` · ${j.error}` : ""}</span>
          </div>
          {j.state === "lista" && j.nodeId && <button className="tb-btn" onClick={() => { const n = vfs.node(j.nodeId); n ? openItem?.(n) : openApp?.("files"); }}><Ic name="open_in_new" size={16} /> Abrir</button>}
          <button className="tb-btn icon" title={live ? "Cancelar" : "Quitar de la lista"} aria-label={live ? "Cancelar" : "Quitar de la lista"} onClick={() => cancel(j)}><Ic name={live ? "stop_circle" : "close"} size={18} /></button>
        </div>; })}</div>}
  </div></div>;
}
