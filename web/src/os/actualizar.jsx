/* ============================================================
   Sotos — actualizar con un botón
   UpdateDialog: qué versión hay, «Actualizar», el avance en vivo y, al terminar, recarga sola
   cuando Sotos vuelve con la versión nueva.
   UpdatePrompt: aviso al administrador al entrar, con «Actualizar» y «Más tarde».
   openUpdate(): abre la ventana desde cualquier parte (notificación, Panel de control, Administración).
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React, { useEffect, useRef, useState } from "react";
import { Ic, Modal, toast } from "./ui.jsx";
import { api } from "./api.js";

export const openUpdate = () => window.dispatchEvent(new CustomEvent("sotos-update"));
const SKIP_KEY = "sotos_update_later";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/** espera a que el servidor vuelva con la versión nueva (máx. ~4 minutos) */
async function waitForVersion(v) {
  for (let k = 0; k < 120; k++) {
    await sleep(2000);
    try { const h = await fetch("/api/health", { cache: "no-store" }); if (h.ok) { const j = await h.json(); if (!v || j.version === v) return true; } } catch {}
  }
  return false;
}

export function UpdateDialog({ onClose }) {
  const [u, setU] = useState(null), [phase, setPhase] = useState("check"), [log, setLog] = useState([]), [err, setErr] = useState(null), [notes, setNotes] = useState(false);
  const logRef = useRef(null);
  const load = () => { setPhase("check"); setErr(null); api("GET", "admin/update?force=1").then(r => { setU(r); setPhase("ready"); }).catch(e => { setU({ error: e.message }); setPhase("ready"); }); };
  useEffect(load, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const go = async () => {
    setPhase("running"); setLog([]); setErr(null);
    try {
      const r = await fetch("/api/admin/update", { method: "POST", headers: { "x-sotos": "1" } });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || `El servidor respondió ${r.status}`);
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", version = null;
      while (true) {
        const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
          if (m.log) setLog(l => [...l, m.log]); if (m.error) throw new Error(m.error); if (m.done) version = m.version || u?.latest; }
      }
      if (!version) throw new Error("La conexión se cortó antes de terminar. Revisa el registro del servidor y vuelve a intentarlo.");
      setPhase("restart"); setLog(l => [...l, "Esperando a que Sotos vuelva…"]);
      if (await waitForVersion(version)) { setLog(l => [...l, `Listo: Sotos ${version}. Recargando…`]); await sleep(600); location.reload(); return; }
      throw new Error("Sotos se actualizó pero todavía no volvió a arrancar. Si usas Docker, revisa que el contenedor tenga «restart: unless-stopped».");
    } catch (e) { setErr(e.message); setPhase("ready"); }
  };

  const busy = phase === "running" || phase === "restart";
  const can = u && !u.error && u.newer && u.ok;
  const actions = busy ? null : <>
    <button className="tb-btn" onClick={onClose}>{can ? "Más tarde" : "Cerrar"}</button>
    {can ? <button className="tb-btn primary" onClick={go}><Ic name="system_update_alt" /> {err ? "Reintentar" : "Actualizar"}</button>
      : phase === "ready" && <button className="tb-btn" onClick={load}><Ic name="refresh" /> Buscar de nuevo</button>}
  </>;
  return (
    <Modal title="Actualizar Sotos" icon="system_update_alt" width={470} onClose={busy ? () => {} : onClose} actions={actions}>
      <div className="upd">
        {phase === "check" && <div className="upd-head"><span className="spin-soft"><Ic name="sync" size={28} /></span><div><b>Buscando la última versión…</b></div></div>}
        {phase !== "check" && u && <div className="upd-head">
          <Ic name={u.error ? "cloud_off" : u.newer ? "release_alert" : "verified"} size={30} className={u.newer && !u.error ? "upd-ico new" : "upd-ico"} />
          <div>
            <b>{u.error ? "No se pudo buscar la versión nueva" : u.newer ? `Sotos ${u.latest} está lista para instalar` : `Tienes la última versión (${u.current})`}</b>
            <div className="faint">{u.error ? u.error : u.newer ? `Tienes la ${u.current}.` : "No hay nada que hacer."}</div>
          </div>
        </div>}
        {u?.newer && !u.ok && <div className="upd-warn"><Ic name="info" size={18} /><span>{u.reason}</span></div>}
        {can && !busy && !log.length && <div className="faint upd-small">Antes se hace una copia de seguridad. Tus archivos, cuentas y configuración no se tocan, y si la versión nueva no arranca te quedas con la actual. Tarda uno o dos minutos y la página se recarga sola.</div>}
        {u?.newer && u.notes && !busy && <>
          <button className="login-alt upd-small" style={{ padding: 0 }} onClick={() => setNotes(s => !s)}>{notes ? "Ocultar novedades" : "Ver qué trae"}</button>
          {notes && <pre className="admin-update-notes">{u.notes}</pre>}</>}
        {busy && <div className="upd-bar"><span /></div>}
        {!!log.length && <pre ref={logRef} className="admin-update-log">{log.join("\n")}</pre>}
        {err && <div className="upd-warn bad"><Ic name="error" size={18} /><span>{err}</span></div>}
      </div>
    </Modal>
  );
}

/** aviso al entrar (solo administradores), una vez por versión si eligen «Más tarde» */
export function UpdatePrompt({ user }) {
  const [u, setU] = useState(null);
  useEffect(() => {
    if (user?.role !== "admin") return;
    const t = setTimeout(() => api("GET", "admin/update").then(r => {
      let later = null; try { later = localStorage.getItem(SKIP_KEY); } catch {}
      if (r?.newer && r.ok && later !== r.latest) setU(r);
    }).catch(() => {}), 4000);
    return () => clearTimeout(t);
  }, [user?.id, user?.role]);
  if (!u) return null;
  const later = () => { try { localStorage.setItem(SKIP_KEY, u.latest); } catch {} setU(null); };
  return (
    <div className="upd-prompt" role="status">
      <Ic name="system_update_alt" size={22} />
      <div className="upd-prompt-txt"><b>Sotos {u.latest} está disponible</b><span className="faint">Tienes la {u.current}</span></div>
      <button className="tb-btn" onClick={later}>Más tarde</button>
      <button className="tb-btn primary" onClick={() => { setU(null); openUpdate(); }}>Actualizar</button>
    </div>
  );
}
