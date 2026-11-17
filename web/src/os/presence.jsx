/* ============================================================
   Sotos — presencia: quién de tus contactos y mundos está conectado
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { api, onServer } from "./api.js";
import * as vfs from "./vfs.js";

let online = new Set(), started = false; const subs = new Set();
const emit = () => subs.forEach(f => f());
function start() {
  if (started) return; started = true;
  const load = () => { if (vfs.getState().mode !== "cloud") return; api("GET", "presence").then(r => { online = new Set(r.online); emit(); }).catch(() => {}); };
  load();
  onServer("presence", (d) => { const n = new Set(online); d.online ? n.add(d.user) : n.delete(d.user); online = n; emit(); });
  setInterval(load, 120_000);
}
export function useOnline(userId) {
  const [, tick] = React.useState(0);
  React.useEffect(() => { start(); const f = () => tick(x => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return !!userId && online.has(userId);
}
export function PresenceDot({ userId, size = 10, title }) {
  const on = useOnline(userId);
  return <span className={"presence-dot" + (on ? " on" : "")} style={{ width: size, height: size }} title={title || (on ? "Conectado ahora" : "Desconectado")} />;
}