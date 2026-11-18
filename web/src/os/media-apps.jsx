/* ============================================================
   Sotos — Cine (Jellyfin) y Fotos (Immich) dentro de Sotos
   Cada persona entra con su propia cuenta, creada por Sotos, y solo ve sus archivos.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, EmptyState } from "./ui.jsx";
import { api } from "./api.js";
import { useVfs } from "./vfs.js";
const { useState, useEffect } = React;

function ServiceCard({ icon, title, text, script }) {
  return <div className="app" style={{ display: "grid", placeItems: "center", padding: 24 }}>
    <div style={{ maxWidth: 460, textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
      <Ic name={icon} size={46} style={{ color: "var(--accent)" }} />
      <h2 style={{ margin: 0 }}>{title}</h2>
      <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>{text}</div>
      {script && <div className="faint" style={{ fontSize: 12 }}>Quien administra el servidor lo activa con <code>{script}</code> (necesita Docker).</div>}
    </div>
  </div>;
}

export function CineApp() {
  const mode = useVfs(s => s.mode);
  const [st, setSt] = useState("cargando"), [err, setErr] = useState(null), [src, setSrc] = useState(null);
  useEffect(() => {
    if (mode !== "cloud") return setSt("invitado");
    (async () => {
      try {
        const s = await api("GET", "jellyfin/status"); if (!s.enabled) return setSt("apagado");
        setSt("preparando");
        const r = await api("POST", "jellyfin/session");
        // la interfaz de Jellyfin se sirve en /jellyfin (mismo origen): se le deja la sesión lista
        const addr = location.origin + r.base;
        let cred = {}; try { cred = JSON.parse(localStorage.getItem("jellyfin_credentials") || "{}"); } catch {}
        const servers = (cred.Servers || []).filter(x => x.Id !== r.serverId);
        servers.unshift({ Id: r.serverId, Name: "Sotos", ManualAddress: addr, LocalAddress: addr, LastConnectionMode: 2, UserId: r.userId, AccessToken: r.token, DateLastAccessed: Date.now() });
        localStorage.setItem("jellyfin_credentials", JSON.stringify({ Servers: servers }));
        setSrc(r.base + "/web/index.html#/home.html"); setSt("listo");
      } catch (e) { setErr(e.message); setSt("error"); }
    })();
  }, [mode]);
  if (st === "invitado") return <ServiceCard icon="live_tv" title="Cine" text="Cine necesita tu cuenta de Sotos: muestra tus películas, series y música como en un servicio de streaming." />;
  if (st === "apagado") return <ServiceCard icon="live_tv" title="Cine (Jellyfin)" text="Tus videos y tu música organizados como en un servicio de streaming, con portadas, continuar viendo y subtítulos. Este servidor todavía no lo tiene activado." script="scripts/jellyfin-dev.ps1" />;
  if (st === "error") return <ServiceCard icon="cloud_off" title="No se pudo abrir Cine" text={err} />;
  if (st !== "listo") return <div className="app app-loading"><div style={{ display: "grid", gap: 10, justifyItems: "center" }}><Ic name="progress_activity" size={28} /><span className="faint">{st === "preparando" ? "Preparando tu biblioteca…" : "Cargando…"}</span></div></div>;
  return <div className="app" style={{ background: "#101010" }}><iframe title="Cine" src={src} style={{ flex: 1, border: 0, width: "100%", height: "100%" }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /></div>;
}

export function FotosApp() {
  const mode = useVfs(s => s.mode);
  const [st, setSt] = useState("cargando"), [err, setErr] = useState(null), [src, setSrc] = useState(null);
  useEffect(() => {
    if (mode !== "cloud") return setSt("invitado");
    (async () => {
      try {
        const s = await api("GET", "immich/status"); if (!s.enabled) return setSt("apagado");
        setSt("preparando"); const r = await api("POST", "immich/session"); setSrc(r.url); setSt("listo");
      } catch (e) { setErr(e.message); setSt("error"); }
    })();
  }, [mode]);
  if (st === "invitado") return <ServiceCard icon="photo_library" title="Fotos" text="Fotos necesita tu cuenta de Sotos." />;
  if (st === "apagado") return <ServiceCard icon="photo_library" title="Fotos (Immich)" text="Tus fotos y videos por fecha y lugar, con reconocimiento de caras, búsqueda inteligente («perro en la playa») y recuerdos. Este servidor todavía no lo tiene activado." script="scripts/immich-dev.ps1" />;
  if (st === "error") return <ServiceCard icon="cloud_off" title="No se pudo abrir Fotos" text={err} />;
  if (st !== "listo") return <div className="app app-loading"><div style={{ display: "grid", gap: 10, justifyItems: "center" }}><Ic name="progress_activity" size={28} /><span className="faint">{st === "preparando" ? "Preparando tus fotos…" : "Cargando…"}</span></div></div>;
  return <div className="app"><iframe title="Fotos" src={src} style={{ flex: 1, border: 0, width: "100%", height: "100%" }} allow="fullscreen" allowFullScreen /></div>;
}
