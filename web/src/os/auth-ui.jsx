/* ============================================================
   Sotos OS — acceso: cuenta en la nube o invitado
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, Avatar } from "./ui.jsx";
import { api } from "./api.js";
import { SotosMark } from "./logo.jsx";
import { getLang, setLang } from "./i18n.js";
const { useState, useEffect } = React;

export function LoginScreen({ wallpaper, server, registration, canRecover, resetToken, lastUser, onAccount, onGuest }) {
  const [mode, setMode] = useState(resetToken ? "reset" : server ? (lastUser ? "login" : "choose") : "guest");
  const [reset, setReset] = useState(null), [pw2, setPw2] = useState(""); // recuperar contraseña
  useEffect(() => { if (!resetToken) return; api("POST", "auth/reset-check", { token: resetToken }).then(setReset).catch(e => setReset({ error: e.message })); }, [resetToken]);
  const clearLink = () => { try { history.replaceState(null, "", location.pathname); } catch {} };
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
      if (mode === "forgot") { await api("POST", "auth/forgot", { email }); setMode("forgot-sent"); setBusy(false); return; }
      if (mode === "reset") { if (pw !== pw2) throw new Error("Las contraseñas no coinciden"); const r = await api("POST", "auth/reset", { token: resetToken, password: pw, code }); clearLink(); await onAccount(r.user); return; }
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
      <button className="login-lang no-translate" onClick={() => setLang(getLang() === "es" ? "en" : "es")} title="Idioma · Language">{getLang() === "es" ? "English" : "Español"}</button>
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
            {mode === "login" && <button type="button" className="login-alt" style={{ marginTop: 2, fontWeight: 500 }} onClick={() => { setErr(null); setMode("forgot"); }}>¿Olvidaste tu contraseña?</button>}
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
        {mode === "forgot" && (
          <form className="login-form" onSubmit={submit}>
            <div className="login-logo" style={{ marginBottom: 4 }}><Ic name="lock_reset" size={44} /></div>
            <div className="login-user" style={{ marginBottom: 2 }}>Recuperar contraseña</div>
            {canRecover ? <>
              <div className="login-sub" style={{ marginBottom: 8 }}>Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</div>
              <input className="login-input" type="email" placeholder="Correo" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              {err && <div className="login-err"><Ic name="error" size={16} /> {err}</div>}
              <button className="login-enter" type="submit" disabled={busy}>{busy ? <Ic name="progress_activity" size={20} /> : <Ic name="send" size={20} />} Enviar enlace</button>
            </> : <div className="login-sub" style={{ marginBottom: 8 }}>Este servidor no tiene configurado el envío de correos. Pide al administrador que cambie tu contraseña desde Administración → Usuarios.</div>}
            <button type="button" className="login-alt" onClick={() => { setErr(null); setMode("login"); }}>Volver</button>
          </form>
        )}
        {mode === "forgot-sent" && <div className="login-form">
          <div className="login-logo" style={{ marginBottom: 4 }}><Ic name="mark_email_read" size={44} /></div>
          <div className="login-user" style={{ marginBottom: 2 }}>Revisa tu correo</div>
          <div className="login-sub" style={{ marginBottom: 8 }}>Si {email} tiene una cuenta, te llegará un enlace en unos minutos. Sirve una sola vez durante 30 minutos. Mira también en correo no deseado.</div>
          <button className="login-alt" onClick={() => setMode("login")}>Volver a iniciar sesión</button>
        </div>}
        {mode === "reset" && (
          <form className="login-form" onSubmit={submit}>
            <div className="login-logo" style={{ marginBottom: 4 }}><Ic name="lock_reset" size={44} /></div>
            <div className="login-user" style={{ marginBottom: 2 }}>Elige una contraseña nueva</div>
            {!reset ? <div className="login-sub"><Ic name="progress_activity" size={20} /></div>
              : reset.error ? <><div className="login-err"><Ic name="error" size={16} /> {reset.error}</div>
                <button type="button" className="login-alt" onClick={() => { clearLink(); setErr(null); setMode("forgot"); }}>Pedir un enlace nuevo</button></>
              : <>
                <div className="login-sub" style={{ marginBottom: 8 }}>Para {reset.email}. Al cambiarla se cierran las sesiones abiertas en otros equipos.</div>
                <input className="login-input" type="password" placeholder="Contraseña nueva (mín. 8 caracteres)" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required minLength={8} autoFocus />
                <input className="login-input" type="password" placeholder="Repítela" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required minLength={8} />
                {reset.need2fa && <input className="login-input code" inputMode="numeric" autoComplete="one-time-code" placeholder="Código de verificación" value={code} onChange={e => setCode(e.target.value.replace(/[^0-9a-z-]/gi, "").slice(0, 9))} required />}
                {err && <div className="login-err"><Ic name="error" size={16} /> {err}</div>}
                <button className="login-enter" type="submit" disabled={busy}>{busy ? <Ic name="progress_activity" size={20} /> : <Ic name="check" size={20} />} Guardar y entrar</button>
              </>}
            <button type="button" className="login-alt" onClick={() => { clearLink(); setErr(null); setMode("login"); }}>Volver a iniciar sesión</button>
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
