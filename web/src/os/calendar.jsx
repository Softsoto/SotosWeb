/* ============================================================
   Sotos — Calendario
   Mes y agenda; calendarios propios y de cada Mundo; recordatorios;
   importar/exportar .ics. Sin cuenta, se guarda en este navegador.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { pickAsFiles } from "./filepicker.jsx";
import { Ic, Modal, toast } from "./ui.jsx";
import { api, onServer } from "./api.js";
import * as vfs from "./vfs.js";
import { useVfs } from "./vfs.js";
const { useState, useEffect, useMemo, useRef } = React;

const DAY = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const hm = (t) => new Date(t).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
const pad = (n) => String(n).padStart(2, "0");
const dateInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeInput = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const REMIND = [["", "Sin aviso"], [0, "A la hora"], [10, "10 min antes"], [30, "30 min antes"], [60, "1 hora antes"], [1440, "1 día antes"]];

/* ---------- almacén: servidor o este navegador ---------- */
const LKEY = "sotos_calendar";
const lget = () => { try { return JSON.parse(localStorage.getItem(LKEY)) || null; } catch { return null; } };
const lset = (d) => { try { localStorage.setItem(LKEY, JSON.stringify(d)); } catch {} };
function local() { let d = lget(); if (!d) { d = { calendars: [{ id: "personal", name: "Personal", color: "#2f5d8a" }], events: [] }; lset(d); } return d; }
const store = (cloud) => cloud ? {
  load: (from, to) => api("GET", `calendar?from=${from}&to=${to}`),
  save: (ev) => ev.id ? api("PUT", "calendar/events/" + ev.id, ev) : api("POST", "calendar/events", ev),
  remove: (id) => api("DELETE", "calendar/events/" + id),
  addCal: (c) => api("POST", "calendar/calendars", c),
} : {
  load: async (from, to) => { const d = local(); return { calendars: d.calendars, worlds: [], events: d.events.filter(e => e.end >= from && e.start <= to).map(e => ({ ...e, mine: true })) }; },
  save: async (ev) => { const d = local(); if (ev.id) d.events = d.events.map(e => e.id === ev.id ? { ...e, ...ev } : e); else d.events.push({ ...ev, id: vfs.newId(), calendarId: ev.calendarId || "personal" }); lset(d); },
  remove: async (id) => { const d = local(); d.events = d.events.filter(e => e.id !== id); lset(d); },
  addCal: async (c) => { const d = local(); const it = { id: vfs.newId(), name: c.name, color: c.color || "#4f7a3a" }; d.calendars.push(it); lset(d); return { item: it }; },
};

/* ---------- .ics ---------- */
const icsDate = (t, allDay) => { const d = new Date(t); return allDay ? `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` : d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); };
const icsEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
export function toIcs(events) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sotos//Calendario//ES", ...events.flatMap(e => ["BEGIN:VEVENT", `UID:${e.id}@sotos`, `DTSTAMP:${icsDate(Date.now())}`,
    e.allDay ? `DTSTART;VALUE=DATE:${icsDate(e.start, true)}` : `DTSTART:${icsDate(e.start)}`, e.allDay ? `DTEND;VALUE=DATE:${icsDate(e.end + DAY, true)}` : `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsEsc(e.title)}`, e.location && `LOCATION:${icsEsc(e.location)}`, e.notes && `DESCRIPTION:${icsEsc(e.notes)}`, "END:VEVENT"].filter(Boolean)), "END:VCALENDAR"].join("\r\n") + "\r\n";
}
export function fromIcs(text) {
  const out = []; let cur = null;
  const un = (v) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
  const parse = (v, params) => { const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/); if (!m) return null;
    const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m; return { t: z ? Date.UTC(+y, mo - 1, +d, +h, +mi, +s) : new Date(+y, mo - 1, +d, +h, +mi, +s).getTime(), allDay: !m[4] || /VALUE=DATE(?!-)/.test(params) }; };
  for (const line of text.replace(/\r\n[ \t]/g, "").split(/\r?\n/)) {
    const i = line.indexOf(":"); if (i < 0) continue; const head = line.slice(0, i), val = line.slice(i + 1), key = head.split(";")[0].toUpperCase();
    if (key === "BEGIN" && val === "VEVENT") cur = {}; else if (key === "END" && val === "VEVENT" && cur) { if (cur.title && cur.start) out.push({ ...cur, end: cur.end || cur.start }); cur = null; }
    else if (!cur) continue; else if (key === "SUMMARY") cur.title = un(val); else if (key === "LOCATION") cur.location = un(val); else if (key === "DESCRIPTION") cur.notes = un(val);
    else if (key === "DTSTART") { const p = parse(val, head); if (p) { cur.start = p.t; cur.allDay = p.allDay; } }
    else if (key === "DTEND") { const p = parse(val, head); if (p) cur.end = p.allDay ? p.t - DAY : p.t; }
  }
  return out;
}

/* ---------- app ---------- */
export function CalendarApp({ date: openDate }) {
  const mode = useVfs(s => s.mode), cloud = mode === "cloud";
  const st = useMemo(() => store(cloud), [cloud]);
  const [cursor, setCursor] = useState(() => startOfDay(openDate || Date.now()));
  const [view, setView] = useState("mes");
  const [data, setData] = useState({ calendars: [], worlds: [], events: [] });
  const [hidden, setHidden] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("sotos_cal_hidden")) || []); } catch { return new Set(); } });
  const [edit, setEdit] = useState(null), [newCal, setNewCal] = useState(null);
  const imp = useRef(null);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1), gridStart = addDays(first, -((first.getDay() + 6) % 7));
  const range = view === "mes" ? [gridStart.getTime(), addDays(gridStart, 42).getTime()] : [startOfDay(cursor).getTime(), addDays(cursor, 60).getTime()];
  const load = () => st.load(range[0], range[1]).then(setData).catch(e => toast(e.message, { error: true }));
  useEffect(() => { load(); }, [st, range[0], range[1]]);
  useEffect(() => cloud ? onServer(["calendar", "world"], () => load()) : undefined, [cloud, range[0]]);
  useEffect(() => { if (openDate) setCursor(startOfDay(openDate)); }, [openDate]);
  const toggle = (id) => setHidden(h => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); try { localStorage.setItem("sotos_cal_hidden", JSON.stringify([...n])); } catch {} return n; });
  const colorOf = (e) => e.worldId ? data.worlds.find(w => w.id === e.worldId)?.color || "#7a3e6b" : data.calendars.find(c => c.id === e.calendarId)?.color || "#2f5d8a";
  const events = data.events.filter(e => !hidden.has(e.worldId || e.calendarId)).sort((a, b) => a.start - b.start);
  const onDay = (d) => events.filter(e => e.start < addDays(startOfDay(d), 1).getTime() && e.end >= startOfDay(d).getTime());
  const newAt = (d) => { const s = startOfDay(d); s.setHours(9); setEdit({ title: "", start: s.getTime(), end: s.getTime() + 3600000, allDay: false, calendarId: data.calendars[0]?.id, remind: 10 }); };
  const exportIcs = () => { const blob = new Blob([toIcs(events)], { type: "text/calendar" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Calendario Sotos.ics"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); };
  const importIcs = async (f) => { const list = fromIcs(await f.text()); let n = 0; for (const e of list) { try { await st.save({ ...e, calendarId: data.calendars[0]?.id }); n++; } catch {} } toast(`${n} evento(s) importado(s)`, { icon: "event" }); load(); };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const title = view === "mes" ? cap(cursor.toLocaleDateString("es-CO", { month: "long", year: "numeric" })) : "Próximos 60 días";
  const step = (n) => setCursor(c => view === "mes" ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, n * 30));
  return (
    <div className="app cal-app">
      <input ref={imp} type="file" accept=".ics,text/calendar" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) importIcs(f); }} />
      <div className="app-side">
        <button className="tb-btn primary" style={{ width: "100%", justifyContent: "center", marginBottom: 12 }} onClick={() => newAt(cursor)}><Ic name="add" /> Nuevo evento</button>
        <MiniMonth cursor={cursor} onPick={(d) => { setCursor(d); }} events={events} />
        <div className="side-label">Mis calendarios</div>
        {data.calendars.map(c => <label key={c.id} className="cal-toggle"><input type="checkbox" checked={!hidden.has(c.id)} onChange={() => toggle(c.id)} style={{ accentColor: c.color }} /><i style={{ background: c.color }} />{c.name}</label>)}
        <button className="cal-add" onClick={() => setNewCal("")}><Ic name="add" size={15} /> Calendario</button>
        {data.worlds.length > 0 && <><div className="side-label">Calendarios de Mundos</div>
          {data.worlds.map(w => <label key={w.id} className="cal-toggle"><input type="checkbox" checked={!hidden.has(w.id)} onChange={() => toggle(w.id)} style={{ accentColor: w.color }} /><i style={{ background: w.color }} />{w.name}</label>)}</>}
        <div className="cal-foot"><button className="tb-btn" onClick={async () => { const f = await pickAsFiles({ title: "Importar calendario (.ics)", exts: ["ics"] }); if (f?.[0]) importIcs(f[0]); }}><Ic name="upload" size={16} /> Importar .ics</button><button className="tb-btn" onClick={exportIcs}><Ic name="download" size={16} /> Exportar</button></div>
      </div>
      <div className="app-main" style={{ display: "flex", flexDirection: "column" }}>
        <div className="cal-bar">
          <button className="tb-btn" onClick={() => setCursor(startOfDay(Date.now()))}>Hoy</button>
          <button className="tb-btn icon" onClick={() => step(-1)}><Ic name="chevron_left" /></button><button className="tb-btn icon" onClick={() => step(1)}><Ic name="chevron_right" /></button>
          <span className="cal-title">{title}</span><div className="tb-spacer" />
          <div className="wg-seg">{[["mes", "Mes"], ["agenda", "Agenda"]].map(([v, l]) => <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{l}</button>)}</div>
        </div>
        {view === "mes" ? (
          <div className="cal-month">
            {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map(d => <div key={d} className="cal-dow">{d}</div>)}
            {Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).map(d => {
              const evs = onDay(d), other = d.getMonth() !== cursor.getMonth(), today = sameDay(d, Date.now());
              return (
                <div key={d.getTime()} className={"cal-cell" + (other ? " other" : "") + (today ? " today" : "")} onDoubleClick={() => newAt(d)}>
                  <span className="cal-num">{d.getDate()}</span>
                  {evs.slice(0, 3).map(e => <button key={e.id} className={"cal-ev" + (e.allDay ? " all" : "")} style={{ "--ev": colorOf(e) }} onClick={() => setEdit({ ...e })} title={e.title}>
                    {!e.allDay && <b>{hm(e.start)}</b>}{e.title}</button>)}
                  {evs.length > 3 && <span className="cal-more" onClick={() => { setCursor(startOfDay(d)); setView("agenda"); }}>+{evs.length - 3} más</span>}
                </div>);
            })}
          </div>
        ) : (
          <div className="scroll cal-agenda">
            {Array.from({ length: 60 }, (_, i) => addDays(startOfDay(cursor), i)).map(d => { const evs = onDay(d); if (!evs.length) return null;
              return <div key={d.getTime()} className="cal-aday"><div className={"cal-adate" + (sameDay(d, Date.now()) ? " today" : "")}><b>{d.getDate()}</b><span>{d.toLocaleDateString("es-CO", { weekday: "short", month: "short" })}</span></div>
                <div style={{ flex: 1 }}>{evs.map(e => <button key={e.id} className="cal-arow" onClick={() => setEdit({ ...e })}><i style={{ background: colorOf(e) }} /><span className="cal-atime">{e.allDay ? "Todo el día" : `${hm(e.start)} – ${hm(e.end)}`}</span><b>{e.title}</b>{e.location && <span className="faint"> · {e.location}</span>}{e.author && !e.mine && <span className="faint"> · {e.author}</span>}</button>)}</div></div>; })}
            {!events.some(e => e.end >= startOfDay(cursor).getTime()) && <div className="faint" style={{ padding: 30, textAlign: "center" }}>No hay eventos en los próximos 60 días.</div>}
          </div>
        )}
      </div>
      {newCal !== null && <Modal title="Nuevo calendario" icon="calendar_add_on" onClose={() => setNewCal(null)} width={360}
        actions={<><button className="tb-btn" onClick={() => setNewCal(null)}>Cancelar</button><button className="tb-btn primary" disabled={!newCal.trim()} onClick={async () => { try { await st.addCal({ name: newCal }); setNewCal(null); load(); } catch (e) { toast(e.message, { error: true }); } }}>Crear</button></>}>
        <label className="field">Nombre<input autoFocus placeholder="Trabajo, Cumpleaños, Universidad…" value={newCal} onChange={e => setNewCal(e.target.value)} /></label></Modal>}
      {edit && <EventEditor ev={edit} data={data} onClose={() => setEdit(null)}
        onSave={async (ev) => { try { await st.save(ev); setEdit(null); load(); toast(ev.id ? "Evento guardado" : "Evento creado", { icon: "event" }); } catch (e) { toast(e.message, { error: true }); } }}
        onDelete={async () => { try { await st.remove(edit.id); setEdit(null); load(); toast("Evento eliminado", { icon: "delete" }); } catch (e) { toast(e.message, { error: true }); } }} />}
    </div>
  );
}

function MiniMonth({ cursor, onPick, events }) {
  const [m, setM] = useState(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  useEffect(() => setM(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor.getMonth(), cursor.getFullYear()]);
  const start = addDays(m, -((m.getDay() + 6) % 7));
  return (
    <div className="cal-mini">
      <div className="cal-mini-head"><button onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}><Ic name="chevron_left" size={16} /></button>
        <span>{(s => s.charAt(0).toUpperCase() + s.slice(1))(m.toLocaleDateString("es-CO", { month: "long", year: "numeric" }))}</span><button onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))}><Ic name="chevron_right" size={16} /></button></div>
      <div className="cal-mini-grid">{["L", "M", "X", "J", "V", "S", "D"].map((d, i) => <span key={i} className="wg-dow">{d}</span>)}
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map(d => <button key={d.getTime()} onClick={() => onPick(startOfDay(d))}
          className={(d.getMonth() !== m.getMonth() ? "other " : "") + (sameDay(d, Date.now()) ? "today " : "") + (sameDay(d, cursor) ? "sel " : "") + (events.some(e => sameDay(e.start, d)) ? "has" : "")}>{d.getDate()}</button>)}</div>
    </div>
  );
}

function EventEditor({ ev, data, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...ev, date: dateInput(ev.start), endDate: dateInput(ev.end), from: timeInput(ev.start), to: timeInput(ev.end), target: ev.worldId ? "w:" + ev.worldId : "c:" + (ev.calendarId || data.calendars[0]?.id) });
  const readonly = ev.id && ev.mine === false && !ev.worldId;
  const save = () => {
    const [y, mo, d] = f.date.split("-").map(Number), [y2, mo2, d2] = f.endDate.split("-").map(Number);
    const [h1, m1] = f.from.split(":").map(Number), [h2, m2] = f.to.split(":").map(Number);
    const start = f.allDay ? new Date(y, mo - 1, d).getTime() : new Date(y, mo - 1, d, h1, m1).getTime();
    let end = f.allDay ? new Date(y2, mo2 - 1, d2).getTime() : new Date(y2, mo2 - 1, d2, h2, m2).getTime();
    if (end < start) end = f.allDay ? start : start + 3600000;
    const [kind, tid] = f.target.split(":");
    onSave({ id: ev.id, title: f.title, start, end, allDay: f.allDay, location: f.location, notes: f.notes, remind: f.remind === "" || f.remind == null ? null : Number(f.remind), calendarId: kind === "c" ? tid : undefined, worldId: kind === "w" ? tid : undefined });
  };
  return (
    <Modal title={ev.id ? "Evento" : "Nuevo evento"} icon="event" onClose={onClose} width={460}
      actions={<>{ev.id && !readonly && <button className="tb-btn danger" onClick={onDelete} style={{ marginRight: "auto" }}><Ic name="delete" /> Eliminar</button>}
        <button className="tb-btn" onClick={onClose}>Cancelar</button>{!readonly && <button className="tb-btn primary" disabled={!f.title?.trim()} onClick={save}><Ic name="check" /> Guardar</button>}</>}>
      <div className="ev-form">
        <input className="ev-title" autoFocus placeholder="Título del evento" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} onKeyDown={e => e.key === "Enter" && f.title.trim() && save()} />
        <label className="cal-toggle"><input type="checkbox" checked={!!f.allDay} onChange={e => setF({ ...f, allDay: e.target.checked })} /> Todo el día</label>
        <div className="ev-row"><Ic name="schedule" size={18} /><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} />
          {!f.allDay && <><input type="time" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /><span>–</span><input type="time" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></>}
          {f.allDay && <><span>–</span><input type="date" value={f.endDate} onChange={e => setF({ ...f, endDate: e.target.value })} /></>}</div>
        <div className="ev-row"><Ic name="calendar_month" size={18} /><select value={f.target} onChange={e => setF({ ...f, target: e.target.value })} disabled={!!ev.id && !!ev.worldId}>
          {data.calendars.map(c => <option key={c.id} value={"c:" + c.id}>{c.name}</option>)}
          {data.worlds.map(w => <option key={w.id} value={"w:" + w.id}>Mundo · {w.name}</option>)}</select></div>
        <div className="ev-row"><Ic name="location_on" size={18} /><input placeholder="Lugar" value={f.location || ""} onChange={e => setF({ ...f, location: e.target.value })} /></div>
        <div className="ev-row"><Ic name="notifications" size={18} /><select value={f.remind ?? ""} onChange={e => setF({ ...f, remind: e.target.value })}>{REMIND.map(([v, l]) => <option key={l} value={v}>{l}</option>)}</select></div>
        <div className="ev-row top"><Ic name="notes" size={18} /><textarea rows={3} placeholder="Notas" value={f.notes || ""} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
        {ev.author && <div className="faint" style={{ fontSize: 12 }}>Creado por {ev.author}</div>}
      </div>
    </Modal>
  );
}
