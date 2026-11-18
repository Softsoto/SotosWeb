/* ============================================================
   Sotos — centro de notificaciones
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, toast } from "./ui.jsx";
import { api, onServer } from "./api.js";
import { useVfs } from "./vfs.js";
const { useState, useEffect, useRef } = React;

export const timeAgo = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "ahora"; if (s < 3600) return `hace ${Math.round(s / 60)} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `hace ${Math.round(s / 86400)} d`;
  return new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};
const KIND = { system: ["info", "#2f5d8a"], "world-call": ["video_call", "#1f7a78"], share: ["group_add", "#2f5d8a"], "world-invite": ["diversity_3", "#c4532f"], "world-post": ["forum", "#4f7a3a"], "world-comment": ["chat", "#c9902a"], "world-file": ["upload_file", "#7a3e6b"] };

export function NotificationBell({ onOpenLink }) {
  const mode = useVfs(s => s.mode);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const box = useRef(null);
  const load = () => api("GET", "notifications").then(setData).catch(() => {});
  useEffect(() => {
    if (mode !== "cloud") { setData({ items: [], unread: 0 }); return; }
    load();
    return onServer(["notif", "notif-read"], (d, type) => {
      if (type === "notif") { setData(x => ({ items: [d, ...x.items.filter(i => i.id !== d.id)].slice(0, 60), unread: x.unread + 1 })); toast(d.title, { icon: (KIND[d.kind] || ["notifications"])[0], action: d.link ? { label: "Ver", run: () => onOpenLink(d.link) } : undefined }); }
      else load();
    });
  }, [mode]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const readAll = () => api("POST", "notifications/read", {}).then(load).catch(() => {});
  const clear = () => api("POST", "notifications/clear", {}).then(load).catch(() => {});
  const click = (n) => {
    if (!n.read) api("POST", "notifications/read", { ids: [n.id] }).catch(() => {});
    setData(x => ({ items: x.items.map(i => i.id === n.id ? { ...i, read: true } : i), unread: Math.max(0, x.unread - (n.read ? 0 : 1)) }));
    setOpen(false); if (n.link) onOpenLink(n.link);
  };
  return (
    <div className="notif-wrap" ref={box} onMouseDown={e => e.stopPropagation()}>
      <div className={"ti" + (open ? " open" : "")} title="Notificaciones" onClick={() => setOpen(o => !o)}>
        <Ic name={data.unread ? "notifications_active" : "notifications"} />
        {data.unread > 0 && <span className="notif-badge">{data.unread > 99 ? "99+" : data.unread}</span>}
      </div>
      {open && (
        <div className="notif-panel">
          <div className="notif-head"><b>Notificaciones</b><div className="tb-spacer" />
            {data.unread > 0 && <button onClick={readAll}>Marcar todo como leído</button>}
            {data.items.length > 0 && <button title="Borrar todas" onClick={clear}><Ic name="delete_sweep" size={17} /></button>}
          </div>
          <div className="notif-list scroll">
            {mode !== "cloud" ? <div className="notif-empty"><Ic name="cloud_off" size={30} />Inicia sesión con una cuenta de Sotos para recibir avisos de tus mundos y de lo que compartan contigo.</div>
              : !data.items.length ? <div className="notif-empty"><Ic name="notifications_off" size={30} />No tienes notificaciones</div>
              : data.items.map(n => { const [icon, color] = KIND[n.kind] || ["notifications", "var(--accent)"]; return (
                <button key={n.id} className={"notif-item" + (n.read ? "" : " unread")} onClick={() => click(n)}>
                  <span className="notif-icon" style={{ background: color }}><Ic name={icon} size={17} /></span>
                  <span className="notif-text"><span className="notif-title">{n.title}</span>{n.body && <span className="notif-body">{n.body}</span>}<span className="notif-time">{timeAgo(n.created)}</span></span>
                  {!n.read && <span className="notif-dot" />}
                </button>); })}
          </div>
        </div>
      )}
    </div>
  );
}
