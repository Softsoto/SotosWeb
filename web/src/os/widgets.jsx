/* ============================================================
   Sotos OS — Desktop widgets
   ============================================================ */
import React from "react";
import { Ic } from "./ui.jsx";
const { useState: useSw, useEffect: useEw } = React;

const WIDGET_TYPES = [
  { id: "clock",   name: "Reloj",         icon: "schedule" },
  { id: "calendar",name: "Calendario",    icon: "calendar_month" },
  { id: "weather", name: "Clima",         icon: "wb_sunny" },
  { id: "note",    name: "Nota adhesiva", icon: "sticky_note_2" },
  { id: "storage", name: "Almacenamiento",icon: "donut_large" },
];

function ClockWidget() {
  const [now, setNow] = useSw(new Date());
  useEw(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const hand = (deg, len, w, col) => <line x1="50" y1="50" x2={50 + len * Math.sin(deg * Math.PI / 180)} y2={50 - len * Math.cos(deg * Math.PI / 180)} stroke={col} strokeWidth={w} strokeLinecap="round" />;
  return (
    <div className="wg-body" style={{ alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 100 100" style={{ width: 104, height: 104 }}>
        <circle cx="50" cy="50" r="47" fill="none" stroke="var(--border-strong)" strokeWidth="2" />
        {[...Array(12)].map((_, i) => { const a = i * 30 * Math.PI / 180; return <line key={i} x1={50 + 42 * Math.sin(a)} y1={50 - 42 * Math.cos(a)} x2={50 + 46 * Math.sin(a)} y2={50 - 46 * Math.cos(a)} stroke="var(--text-faint)" strokeWidth="2" />; })}
        {hand((h % 12) * 30 + m * 0.5, 24, 4, "var(--text)")}
        {hand(m * 6, 34, 3, "var(--text)")}
        {hand(s * 6, 38, 1.5, "var(--accent)")}
        <circle cx="50" cy="50" r="3" fill="var(--accent)" />
      </svg>
      <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, marginTop: 6, letterSpacing: ".02em" }}>
        {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}</div>
    </div>
  );
}

function CalendarWidget() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells = []; for (let i = 0; i < startDow; i++) cells.push(null); for (let d = 1; d <= days; d++) cells.push(d);
  return (
    <div className="wg-body">
      <div style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize", marginBottom: 6 }}>{now.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</div>
      <div className="wg-cal">
        {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => <span key={i} className="wg-dow">{d}</span>)}
        {cells.map((d, i) => <span key={i} className={"wg-day" + (d === now.getDate() ? " today" : "")}>{d || ""}</span>)}
      </div>
    </div>
  );
}

function WeatherWidget() {
  return (
    <div className="wg-body" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Ic name="wb_sunny" size={46} style={{ color: "#ff8a00" }} />
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>23°</div>
      <div className="faint" style={{ fontSize: 12.5 }}>Madrid · Soleado</div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>Máx 26° · Mín 14°</div>
    </div>
  );
}

function NoteWidget({ id, note, onNote }) {
  return (
    <div className="wg-body" style={{ padding: 0 }}>
      <textarea className="wg-note" placeholder="Escribe una nota…" value={note || ""} onChange={e => onNote(id, e.target.value)} />
    </div>
  );
}

function StorageWidget() {
  const pct = 42, r = 34, c = 2 * Math.PI * r;
  return (
    <div className="wg-body" style={{ alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 100 100" style={{ width: 96, height: 96 }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="11" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 50 50)" />
        <text x="50" y="49" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--text)">{pct}%</text>
        <text x="50" y="64" textAnchor="middle" fontSize="9" fill="var(--text-faint)">usado</text>
      </svg>
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>42 GB de 100 GB</div>
    </div>
  );
}

function Widget({ w, shifted, onMove, onClose, note, onNote }) {
  const drag = React.useRef(null);
  const start = (e) => {
    if (e.target.closest(".wg-note") || e.target.closest(".wg-x")) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y };
    const move = (ev) => { const d = drag.current; if (!d) return; onMove(w.id, Math.max(40, d.ox + ev.clientX - d.sx), Math.max(36, d.oy + ev.clientY - d.sy)); };
    const up = () => { drag.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const meta = WIDGET_TYPES.find(t => t.id === w.type) || {};
  return (
    <div className="widget" style={{ left: w.x, top: w.y }} onMouseDown={start}>
      <div className="wg-head"><Ic name={meta.icon} size={14} /><span>{meta.name}</span>
        <span className="wg-x" onClick={() => onClose(w.id)}><Ic name="close" size={14} /></span></div>
      {w.type === "clock" && <ClockWidget />}
      {w.type === "calendar" && <CalendarWidget />}
      {w.type === "weather" && <WeatherWidget />}
      {w.type === "note" && <NoteWidget id={w.id} note={note} onNote={onNote} />}
      {w.type === "storage" && <StorageWidget />}
    </div>
  );
}

export { WIDGET_TYPES, Widget };
