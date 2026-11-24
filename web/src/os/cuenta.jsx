/* ============================================================
   Sotos — panel de la cuenta (clic en tu foto)
   Correo, contraseña, foto y verificación en dos pasos a un clic. Si el administrador decidió
   que solo él cambia los datos de las cuentas, el panel lo dice y deja todo en solo lectura.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, Avatar, toast } from "./ui.jsx";
import { api } from "./api.js";
import * as vfs from "./vfs.js";
const { useState, useEffect, useRef } = React;

export function AccountPanel({ profile, anchor = "top-right", onClose, onApp, onLogout }) {
  const user = vfs.getState().user; const ref = useRef(null);
  const [policy, setPolicy] = useState(null), [form, setForm] = useState(null), [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(user?.email || ""), [f, setF] = useState({ email: "", pw: "", cur: "", next: "", again: "" });
  useEffect(() => { if (user) api("GET", "auth/me").then(r => setPolicy(r.accountEdit || "self")).catch(() => setPolicy("self")); }, []);
  useEffect(() => {
    const out = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest(".acct-trigger")) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => document.addEventListener("mousedown", out), 0); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, []);
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const locked = !!user && policy === "admin" && user.role !== "admin";
  const go = (tab) => { onApp("settings", { openTab: tab, nonce: Date.now() }); onClose(); };
  const saveEmail = async (e) => { e.preventDefault(); setBusy(true);
    try { const r = await api("PUT", "auth/email", { email: f.email, password: f.pw }); setEmail(r.email); toast("Correo de la cuenta actualizado", { icon: "mark_email_read" }); setForm(null); setF(s => ({ ...s, email: "", pw: "" })); }
    catch (er) { toast(er.message, { error: true }); } setBusy(false); };
  const savePw = async (e) => { e.preventDefault(); if (f.next !== f.again) return toast("Las contraseñas nuevas no coinciden", { error: true }); setBusy(true);
    try { await api("POST", "auth/password", { current: f.cur, next: f.next }); toast("Contraseña cambiada. Se cerraron tus otras sesiones.", { icon: "lock_reset" }); setForm(null); setF(s => ({ ...s, cur: "", next: "", again: "" })); }
    catch (er) { toast(er.message, { error: true }); } setBusy(false); };
  return (
    <div ref={ref} className={"acct-panel " + anchor} role="dialog" aria-label="Tu cuenta">
      <div className="acct-head">
        <Avatar profile={profile} size={56} />
        <div className="acct-who"><b>{profile?.name || "Invitado"}</b><span>{user ? email : "Solo en este navegador"}</span>
          {user && <span className="acct-role">{user.role === "admin" ? "Administrador" : "Usuario"}</span>}</div>
      </div>
      {!user ? (
        <div className="acct-note"><Ic name="info" size={18} /><span>Estás como invitado: tus archivos viven solo en este navegador. Inicia sesión con una cuenta para tener correo, contraseña y tus archivos en la nube.</span></div>
      ) : locked ? (
        <div className="acct-note warn" role="alert"><Ic name="admin_panel_settings" size={18} /><span>Solo el administrador puede modificar tu correo, tu contraseña, tu nombre y tu foto. Si necesitas un cambio, pídeselo a quien administra este Sotos.</span></div>
      ) : form === "email" ? (
        <form className="acct-form" onSubmit={saveEmail}>
          <label>Correo nuevo<input type="email" required autoFocus value={f.email} onChange={set("email")} autoComplete="email" /></label>
          <label>Tu contraseña<input type="password" required value={f.pw} onChange={set("pw")} autoComplete="current-password" /></label>
          <div className="acct-actions"><button type="button" className="tb-btn" onClick={() => setForm(null)}>Cancelar</button><button className="tb-btn primary" disabled={busy}>Guardar correo</button></div>
        </form>
      ) : form === "ses" ? (
        <Sessions onBack={() => setForm(null)} />
      ) : form === "pw" ? (
        <form className="acct-form" onSubmit={savePw}>
          <label>Contraseña actual<input type="password" required autoFocus value={f.cur} onChange={set("cur")} autoComplete="current-password" /></label>
          <label>Nueva (mín. 8 caracteres)<input type="password" required minLength={8} value={f.next} onChange={set("next")} autoComplete="new-password" /></label>
          <label>Repítela<input type="password" required minLength={8} value={f.again} onChange={set("again")} autoComplete="new-password" /></label>
          <div className="acct-actions"><button type="button" className="tb-btn" onClick={() => setForm(null)}>Cancelar</button><button className="tb-btn primary" disabled={busy}>Cambiar contraseña</button></div>
        </form>
      ) : (
        <div className="acct-list">
          <button onClick={() => setForm("email")}><Ic name="alternate_email" size={18} /><span>Cambiar correo</span></button>
          <button onClick={() => setForm("pw")}><Ic name="password" size={18} /><span>Cambiar contraseña</span></button>
          <button onClick={() => go("perfil")}><Ic name="account_circle" size={18} /><span>Foto y nombre</span></button>
          <button onClick={() => go("cuenta")}><Ic name="mobile_lock_portrait" size={18} /><span>Verificación en dos pasos y dispositivos</span></button>
          <button onClick={() => setForm("ses")}><Ic name="devices" size={18} /><span>Sesiones abiertas</span></button>
        </div>
      )}
      <div className="acct-foot">
        <button className="tb-btn" onClick={() => go("perfil")}><Ic name="tune" size={16} /> Ajustes</button>
        <button className="tb-btn" onClick={() => { onClose(); onLogout(); }}><Ic name="logout" size={16} /> {user ? "Cerrar sesión" : "Iniciar sesión"}</button>
      </div>
    </div>
  );
}
/** dónde está abierta la cuenta; se puede cerrar cada sesión o todas las demás */
const agentName = (ua) => { const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const s = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone o iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : ua ? "otro sistema" : "dispositivo desconocido"; return `${b} en ${s}`; };
export function Sessions({ onBack }) {
  const [items, setItems] = useState(null);
  const load = () => api("GET", "auth/sessions").then(r => setItems(r.items)).catch(e => toast(e.message, { error: true }));
  useEffect(() => { load(); }, []);
  const close = async (body) => { try { const r = await api("POST", "auth/sessions-close", body); toast(r.closed === 1 ? "Sesión cerrada" : `${r.closed} sesión(es) cerrada(s)`, { icon: "logout" }); load(); } catch (e) { toast(e.message, { error: true }); } };
  return <div className="acct-form">
    {!items ? <div className="faint">Cargando…</div> : <div className="acct-sessions">{items.map(s => <div key={s.id} className="acct-ses">
      <Ic name={/Android|iPhone|iPad/.test(s.agent) ? "mobile_2" : "computer"} size={20} />
      <span><b>{agentName(s.agent)}</b>{s.current ? "Esta sesión" : "Desde " + new Date(s.created).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}</span>
      {!s.current && <button className="tb-btn" onClick={() => close({ id: s.id })}>Cerrar</button>}</div>)}</div>}
    <div className="acct-actions"><button type="button" className="tb-btn" onClick={onBack}>Atrás</button>
      {items?.length > 1 && <button type="button" className="tb-btn danger" onClick={() => close({ others: true })}>Cerrar las demás</button>}</div>
  </div>;
}