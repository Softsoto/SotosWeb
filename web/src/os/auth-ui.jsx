/* ============================================================
   Sotos OS — acceso: cuenta en la nube o invitado
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, Avatar } from "./ui.jsx";
import { api } from "./api.js";
import { SotosMark } from "./logo.jsx";
const { useState, useEffect } = React;

export function LoginScreen({ wallpaper, server, registration, lastUser, onAccount, onGuest }) {
  const [mode, setMode] = useState(server ? (lastUser ? "login" : "choose") : "guest");
  const [email, setEmail] = useState(lastUser?.email || "");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [now, setNow] = useState(new Date());
  const [ticket, setTicket] = useState(null), [code, setCode] = useState(""); // verificación en dos pasos
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = mode === "code" ? await api("POST", "auth/login2fa", { ticket, code })
        : mode === "register" ? await api("POST", "auth/register", { email, name, password: pw }) : await api("POST", "auth/login", { email, password: pw });
      if (r.need2fa) { setTicket(r.ticket); setCode(""); setMode("code"); setBusy(false); return; }
      if (r.usedRecovery) try { sessionStorage.setItem("sotos_recovery_left", String(r.recoveryLeft)); } catch {}
      await onAccount(r.user);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const guest = async () => { setBusy(true); try { await onGuest(); } catch (e) { setErr(e.message); setBusy(false); } };

  return (
    <div className="login" style={{ background: wallpaper.css }}>
      <div className="login-veil" />
      <div className="login-clock">
        <div className="lc-time">{now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div>
        <div className="lc-date" style={{ textTransform: "capitalize" }}>{now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</div>
      </div>
      <div className="login-card">
        {mode === "choose" && <>
          <div className="login-logo"><SotosMark size={84} variant="tile" /></div>
          <div className="login-user">Bienvenido a Sotos</div>
          <div className="login-sub">Tu ordenador en la nube</div>
          <button className="login-enter" onClick={() => setMode("login")}><Ic name="login" size={20} /> Iniciar sesión</button>
          {registration !== "closed" && <button className="login-alt" onClick={() => setMode("register")}>Crear una cuenta</button>}
          <button className="login-guest" onClick={guest} disabled={busy}>Probar como invitado · solo en este navegador</button>
        </>}
        {(mode === "login" || mode === "register") && (
          <form className="login-form" onSubmit={submit}>
            <div className="login-user" style={{ marginBottom: 6 }}>{mode === "login" ? (lastUser ? `Hola de nuevo, ${lastUser.name.split(" ")[0]}` : "Iniciar sesión") : "Crear cuenta"}</div>
            {mode === "register" && <input className="login-input" placeholder="Tu nombre" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required maxLength={60} />}
            <input className="login-input" type="email" placeholder="Correo" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus={!lastUser} />
            <input className="login-input" type="password" placeholder={mode === "register" ? "Contraseña (mín. 8 caracteres)" : "Contraseña"} autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={pw} onChange={e => setPw(e.target.value)} required minLength={mode === "register" ? 8 : 1} autoFocus={!!lastUser} />
            {err && <div className="login-err"><Ic name="error" size={16} /> {err}</div>}
            <button className="login-enter" type="submit" disabled={busy}>{busy ? <Ic name="progress_activity" size={20} /> : <Ic name="arrow_forward" size={20} />} {mode === "login" ? "Entrar" : "Crear cuenta"}</button>
            <button type="button" className="login-alt" onClick={() => { setErr(null); setMode(mode === "login" ? (registration !== "closed" ? "register" : "choose") : "login"); }}>
              {mode === "login" ? (registration !== "closed" ? "¿No tienes cuenta? Crea una" : "Volver") : "Ya tengo cuenta"}</button>
            <button type="button" className="login-guest" onClick={guest} disabled={busy}>Probar como invitado</button>
          </form>
        )}
        {mode === "code" && (
          <form className="login-form" onSubmit={submit}>
            <div className="login-logo" style={{ marginBottom: 4 }}><Ic name="phonelink_lock" size={44} /></div>
            <div className="login-user" style={{ marginBottom: 2 }}>Verificación en dos pasos</div>
            <div className="login-sub" style={{ marginBottom: 8 }}>Escribe el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de recuperación.</div>
            <input className="login-input code" inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" autoFocus value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9a-z-]/gi, "").slice(0, 9))} required />
            {err && <div className="login-err"><Ic name="error" size={16} /> {err}</div>}
            <button className="login-enter" type="submit" disabled={busy || code.length < 6}>{busy ? <Ic name="progress_activity" size={20} /> : <Ic name="verified_user" size={20} />} Verificar</button>
            <button type="button" className="login-alt" onClick={() => { setErr(null); setTicket(null); setPw(""); setMode("login"); }}>Volver</button>
          </form>
        )}
        {mode === "guest" && <>
          <div className="login-avatar"><Avatar profile={{ name: "Invitado" }} size={84} /></div>
          <div className="login-user">Invitado</div>
          <button className="login-enter" onClick={guest} disabled={busy} autoFocus><Ic name="arrow_forward" size={20} /> Entrar</button>
          <div className="login-sub">Tus archivos se guardan en este navegador</div>
          {err && <div className="login-err"><Ic name="error" size={16} /> {err}</div>}
        </>}
      </div>
    </div>
  );
}
