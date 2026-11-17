/* ============================================================
   Sotos OS — Desktop widgets
   ============================================================ */
import React from "react";
import { Ic, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { useVfs, fmtSize } from "./vfs.js";
const { useState: useSw, useEffect: useEw } = React;

const WIDGET_TYPES = [
  { id: "clock",   name: "Reloj",         icon: "schedule" },
  { id: "calendar",name: "Calendario",    icon: "calendar_month" },
  { id: "weather", name: "Clima",         icon: "wb_sunny" },
  { id: "note",    name: "Nota adhesiva", icon: "sticky_note_2" },
  { id: "storage", name: "Almacenamiento",icon: "donut_large" },
  { id: "timer",   name: "Temporizador",  icon: "timer" },
  { id: "calc",    name: "Calculadora",   icon: "calculate" },
  { id: "recent",  name: "Recientes",     icon: "history" },
  { id: "world",   name: "Reloj mundial", icon: "public" },
  { id: "fx",      name: "Monedas",       icon: "currency_exchange" },
  { id: "system",  name: "Sistema",       icon: "memory" },
];
const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };

/* Temporizador: pomodoro 25/5, cuenta atrás libre y cronómetro */
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, .25, .5].forEach(t => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.18, a.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t + .2); o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + .21); }); } catch {} }
function TimerWidget({ id }) {
  const key = "sotos_timer_" + id;
  const [st, setSt] = useSw(() => store(key) || { mode: "pomo", phase: "work", total: 25 * 60, end: null, left: 25 * 60, mins: 10, sw: 0, swStart: null });
  const [, tick] = useSw(0);
  useEw(() => { store(key, st); }, [st]);
  useEw(() => { const t = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(t); }, []);
  const now = Date.now();
  const running = st.mode === "sw" ? !!st.swStart : !!st.end;
  const left = st.end ? Math.max(0, Math.round((st.end - now) / 1000)) : st.left;
  const sw = st.sw + (st.swStart ? now - st.swStart : 0);
  useEw(() => {
    if (st.mode !== "sw" && st.end && left === 0) {
      beep();
      if (st.mode === "pomo") { const ph = st.phase === "work" ? "rest" : "work", tot = (ph === "work" ? 25 : 5) * 60; setSt(s => ({ ...s, phase: ph, total: tot, left: tot, end: null })); toast(ph === "rest" ? "¡Pomodoro terminado! Toma 5 minutos." : "Descanso terminado. ¡A trabajar!", { icon: "timer" }); }
      else { setSt(s => ({ ...s, left: s.total, end: null })); toast("¡Se acabó el tiempo!", { icon: "timer" }); }
    }
  });
  const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const setMode = (m) => setSt(s => ({ ...s, mode: m, end: null, swStart: null, ...(m === "pomo" ? { phase: "work", total: 1500, left: 1500 } : m === "count" ? { total: s.mins * 60, left: s.mins * 60 } : {}) }));
  const toggle = () => setSt(s => s.mode === "sw" ? (s.swStart ? { ...s, sw: s.sw + Date.now() - s.swStart, swStart: null } : { ...s, swStart: Date.now() })
    : (s.end ? { ...s, left: Math.max(0, Math.round((s.end - Date.now()) / 1000)), end: null } : { ...s, end: Date.now() + s.left * 1000 }));
  const reset = () => setSt(s => s.mode === "sw" ? { ...s, sw: 0, swStart: null } : { ...s, end: null, left: s.total });
  const pct = st.mode === "sw" ? 0 : 1 - left / st.total, r = 40, c = 2 * Math.PI * r;
  return (
    <div className="wg-body" style={{ alignItems: "center", gap: 6 }}>
      <div className="wg-seg">{[["pomo", "Pomodoro"], ["count", "Timer"], ["sw", "Crono"]].map(([m, l]) => <button key={m} className={st.mode === m ? "on" : ""} onClick={() => setMode(m)}>{l}</button>)}</div>
      <div style={{ position: "relative", width: 104, height: 104 }}>
        <svg viewBox="0 0 100 100" style={{ width: 104, height: 104 }}><circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
          {st.mode !== "sw" && <circle cx="50" cy="50" r={r} fill="none" stroke={st.phase === "rest" && st.mode === "pomo" ? "#2f9e57" : "var(--accent)"} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 50 50)" />}</svg>
        <div className="wg-timer-num">{st.mode === "sw" ? `${fmt(Math.floor(sw / 1000))}.${Math.floor(sw / 100) % 10}` : fmt(left)}
          <span>{st.mode === "pomo" ? (st.phase === "work" ? "enfoque" : "descanso") : st.mode === "count" ? "temporizador" : "cronómetro"}</span></div>
      </div>
      {st.mode === "count" && !running && <div className="wg-row"><button className="wg-mini" onClick={() => setSt(s => { const m = Math.max(1, s.mins - 1); return { ...s, mins: m, total: m * 60, left: m * 60 }; })}>−</button><span style={{ fontSize: 12 }}>{st.mins} min</span><button className="wg-mini" onClick={() => setSt(s => { const m = Math.min(180, s.mins + 1); return { ...s, mins: m, total: m * 60, left: m * 60 }; })}>+</button></div>}
      <div className="wg-row"><button className="wg-btn primary" onClick={toggle}><Ic name={running ? "pause" : "play_arrow"} size={18} /></button><button className="wg-btn" onClick={reset}><Ic name="restart_alt" size={18} /></button></div>
    </div>
  );
}

/* Calculadora con evaluador propio (sin eval): + − × ÷ %, paréntesis y decimales */
function calc(expr) {
  const t = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".").match(/\d+(\.\d+)?|[-+*/%()]/g) || []; let i = 0;
  const peek = () => t[i], next = () => t[i++];
  const atom = () => { const x = next(); if (x === "(") { const v = sum(); next(); return v; } if (x === "-") return -atom(); if (x === "+") return atom(); const n = parseFloat(x); if (isNaN(n)) throw 0; return peek() === "%" ? (next(), n / 100) : n; };
  const prod = () => { let v = atom(); while (peek() === "*" || peek() === "/") { const o = next(), b = atom(); v = o === "*" ? v * b : v / b; } return v; };
  const sum = () => { let v = prod(); while (peek() === "+" || peek() === "-") { const o = next(), b = prod(); v = o === "+" ? v + b : v - b; } return v; };
  const v = sum(); if (i !== t.length || !isFinite(v)) throw 0; return Math.round(v * 1e10) / 1e10;
}
function CalcWidget() {
  const [e, setE] = useSw(""), [res, setRes] = useSw(null);
  const press = (k) => { if (k === "C") { setE(""); setRes(null); } else if (k === "⌫") setE(x => x.slice(0, -1)); else if (k === "=") { try { const v = calc(e); setRes(v); setE(String(v)); } catch { setRes("Error"); } } else setE(x => x + k); };
  let live = null; try { live = e && !/[-+×÷(]$/.test(e) ? calc(e) : null; } catch {}
  return (
    <div className="wg-body" style={{ gap: 6 }} onKeyDown={ev => { const k = ev.key; if (/^[\d.+\-*/%()]$/.test(k)) press(k === "*" ? "×" : k === "/" ? "÷" : k); else if (k === "Enter") press("="); else if (k === "Backspace") press("⌫"); else if (k === "Escape") press("C"); }} tabIndex={0}>
      <div className="wg-calc-screen"><span>{e || "0"}</span><b>{res === "Error" ? "Error" : live != null && String(live) !== e ? "= " + live.toLocaleString("es-CO") : " "}</b></div>
      <div className="wg-calc">{["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "%", "0", ".", "="].map(k => <button key={k} className={/[÷×+\-=]/.test(k) ? "op" : k === "C" ? "clr" : ""} onClick={() => press(k)}>{k}</button>)}</div>
    </div>
  );
}

/* Archivos recientes (por fecha de modificación) */
function RecentWidget({ onOpen }) {
  useVfs(s => s.rev);
  const items = []; try { vfs.walk(n => { if (!n.children && n.type !== "folder" && n.mtime) items.push(n); }); } catch {}
  items.sort((a, b) => b.mtime - a.mtime);
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  return (
    <div className="wg-body" style={{ gap: 2, padding: "6px 6px 8px" }}>
      {items.slice(0, 6).map(n => <button key={n.id} className="wg-file" onClick={() => onOpen && onOpen(n)} title={n.name}><Ic name={{ docx: "description", xlsx: "table_chart", pptx: "slideshow", pdf: "picture_as_pdf", img: "image", audio: "music_note", video: "movie", txt: "notes", code: "code" }[n.type] || "draft"} size={17} /><span>{n.name}</span><em>{ago(n.mtime)}</em></button>)}
      {!items.length && <div className="faint" style={{ fontSize: 12, padding: 8 }}>Aún no hay archivos.</div>}
    </div>
  );
}

/* Reloj mundial */
const ZONES = [["Bogotá", "America/Bogota"], ["Ciudad de México", "America/Mexico_City"], ["Nueva York", "America/New_York"], ["Madrid", "Europe/Madrid"], ["Buenos Aires", "America/Argentina/Buenos_Aires"], ["Tokio", "Asia/Tokyo"]];
function WorldWidget() {
  const [now, setNow] = useSw(new Date());
  useEw(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  const here = now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return (
    <div className="wg-body" style={{ gap: 0, padding: "4px 12px 8px" }}>
      {ZONES.map(([name, tz]) => { const h = +now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }) % 24, day = now.toLocaleDateString("en-CA", { timeZone: tz });
        return <div key={tz} className="wg-zone"><Ic name={h >= 6 && h < 18 ? "light_mode" : "dark_mode"} size={15} /><span>{name}</span><b>{now.toLocaleTimeString("es-CO", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })}</b><em>{day > here ? "+1" : day < here ? "−1" : ""}</em></div>; })}
    </div>
  );
}

/* Monedas: dólar y euro en pesos colombianos (open.er-api.com, sin clave), con conversor */
function FxWidget() {
  const [rates, setRates] = useSw(() => store("sotos_fx")), [err, setErr] = useSw(null), [amt, setAmt] = useSw("100"), [cur, setCur] = useSw("USD");
  useEw(() => {
    if (rates && Date.now() - rates.at < 6 * 3600_000) return;
    fetch("https://open.er-api.com/v6/latest/USD").then(r => r.json()).then(d => { if (d.result !== "success") throw 0; const v = { at: Date.now(), cop: d.rates.COP, eur: d.rates.EUR, mxn: d.rates.MXN, upd: d.time_last_update_unix * 1000 }; store("sotos_fx", v); setRates(v); }).catch(() => setErr("Sin conexión"));
  }, []);
  if (!rates) return <div className="wg-body" style={{ alignItems: "center", justifyContent: "center" }}><span className="faint" style={{ fontSize: 12 }}>{err || "Cargando tasas…"}</span></div>;
  const perCop = { USD: rates.cop, EUR: rates.cop / rates.eur, MXN: rates.cop / rates.mxn };
  const n = parseFloat(String(amt).replace(",", ".")) || 0;
  const cop = (v) => "$ " + Math.round(v).toLocaleString("es-CO");
  return (
    <div className="wg-body" style={{ gap: 6 }}>
      <div className="wg-fx"><span>1 USD</span><b>{cop(perCop.USD)}</b></div>
      <div className="wg-fx"><span>1 EUR</span><b>{cop(perCop.EUR)}</b></div>
      <div className="wg-row" style={{ marginTop: 4 }}><input className="wg-input" style={{ width: 70 }} value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" />
        <select className="wg-input" style={{ width: 66 }} value={cur} onChange={e => setCur(e.target.value)}>{Object.keys(perCop).map(k => <option key={k}>{k}</option>)}</select></div>
      <div className="wg-fx total"><span>= COP</span><b>{cop(n * perCop[cur])}</b></div>
      <div className="faint" style={{ fontSize: 10.5 }}>Tasa de referencia · {new Date(rates.upd || rates.at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</div>
    </div>
  );
}

/* Sistema: lo que el navegador informa del equipo */
function SystemWidget() {
  const [bat, setBat] = useSw(null), [, tick] = useSw(0), [online, setOnline] = useSw(navigator.onLine);
  useEw(() => {
    let b; navigator.getBattery?.().then(x => { b = x; const up = () => setBat({ level: x.level, charging: x.charging }); up(); x.addEventListener("levelchange", up); x.addEventListener("chargingchange", up); }).catch(() => {});
    const on = () => setOnline(navigator.onLine); window.addEventListener("online", on); window.addEventListener("offline", on);
    const t = setInterval(() => tick(v => v + 1), 3000);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);
  const c = navigator.connection, mem = performance.memory;
  const rows = [
    bat && ["battery_" + (bat.charging ? "charging_full" : bat.level > .6 ? "full" : bat.level > .2 ? "4_bar" : "1_bar"), "Batería", Math.round(bat.level * 100) + "%" + (bat.charging ? " · cargando" : "")],
    [online ? "wifi" : "wifi_off", "Conexión", online ? (c?.effectiveType ? c.effectiveType.toUpperCase() + (c.downlink ? ` · ${c.downlink} Mb/s` : "") : "En línea") : "Sin conexión"],
    ["developer_board", "Núcleos", String(navigator.hardwareConcurrency || "—")],
    navigator.deviceMemory && ["memory", "Memoria", "≈ " + navigator.deviceMemory + " GB"],
    mem && ["data_usage", "Sotos usa", fmtSize(mem.usedJSHeapSize)],
  ].filter(Boolean);
  return <div className="wg-body" style={{ gap: 2, padding: "6px 12px 8px" }}>{rows.map(([i, k, v]) => <div key={k} className="wg-zone"><Ic name={i} size={15} /><span>{k}</span><b style={{ fontSize: 12.5 }}>{v}</b></div>)}</div>;
}

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

/* Clima real con Open-Meteo (sin clave). Ciudad elegida por el usuario; no se usa geolocalización. */
const WMO = (c) => c === 0 ? ["Despejado", "wb_sunny", "#ff8a00"] : c <= 2 ? ["Parcialmente nublado", "partly_cloudy_day", "#f4a62a"] : c === 3 ? ["Nublado", "cloud", "#8a929c"]
  : c <= 48 ? ["Niebla", "foggy", "#8a929c"] : c <= 57 ? ["Llovizna", "rainy_light", "#4a90e2"] : c <= 67 ? ["Lluvia", "rainy", "#2f6fed"] : c <= 77 ? ["Nieve", "weather_snowy", "#7fb6e6"]
  : c <= 82 ? ["Chubascos", "rainy_heavy", "#2f6fed"] : c <= 86 ? ["Nevadas", "weather_snowy", "#7fb6e6"] : ["Tormenta", "thunderstorm", "#8e5cf6"];
function WeatherWidget({ id }) {
  const key = "sotos_weather_" + id;
  const [city, setCity] = useSw(() => { try { return JSON.parse(localStorage.getItem(key)) || { name: "Bogotá", lat: 4.711, lon: -74.0721 }; } catch { return { name: "Bogotá", lat: 4.711, lon: -74.0721 }; } });
  const [data, setData] = useSw(null), [err, setErr] = useSw(null);
  const [editing, setEditing] = useSw(false), [q, setQ] = useSw(""), [opts, setOpts] = useSw([]);
  useEw(() => {
    let live = true; setErr(null);
    const load = () => fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))).then(d => live && setData(d)).catch(() => live && setErr("Sin conexión"));
    load(); const t = setInterval(load, 15 * 60_000);
    try { localStorage.setItem(key, JSON.stringify(city)); } catch {}
    return () => { live = false; clearInterval(t); };
  }, [city.lat, city.lon]);
  useEw(() => {
    if (!editing || q.trim().length < 2) { setOpts([]); return; }
    const t = setTimeout(() => fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=5&language=es`)
      .then(r => r.json()).then(d => setOpts(d.results || [])).catch(() => setOpts([])), 300);
    return () => clearTimeout(t);
  }, [q, editing]);
  if (editing) return (
    <div className="wg-body" style={{ gap: 6 }}>
      <input className="wg-input" autoFocus placeholder="Buscar ciudad…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Escape" && setEditing(false)} />
      {opts.map(o => <button key={o.id} className="wg-opt" onClick={() => { setCity({ name: o.name, lat: o.latitude, lon: o.longitude }); setEditing(false); setQ(""); }}>
        {o.name}<span className="faint"> · {[o.admin1, o.country].filter(Boolean).join(", ")}</span></button>)}
      <button className="wg-opt faint" onClick={() => setEditing(false)}>Cancelar</button>
    </div>
  );
  const cur = data?.current; const [desc, icon, col] = cur ? WMO(cur.weather_code) : ["", "cloud_off", "#8a929c"];
  return (
    <div className="wg-body" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", cursor: "pointer" }} title="Clic para cambiar de ciudad" onClick={() => setEditing(true)}>
      <Ic name={cur && !cur.is_day && cur.weather_code <= 2 ? "clear_night" : icon} size={46} style={{ color: col }} />
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{cur ? Math.round(cur.temperature_2m) + "°" : "—"}</div>
      <div className="faint" style={{ fontSize: 12.5 }}>{city.name}{desc ? " · " + desc : ""}</div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{err || (data ? `Máx ${Math.round(data.daily.temperature_2m_max[0])}° · Mín ${Math.round(data.daily.temperature_2m_min[0])}°` : "Cargando…")}</div>
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
  useVfs(s => s.rev);
  const [quota, setQuota] = useSw(null);
  useEw(() => { navigator.storage?.estimate?.().then(e => setQuota(e.quota)).catch(() => {}); }, []);
  const used = vfs.usedBytes();
  const pct = quota ? Math.max(0.1, Math.round(used / quota * 1000) / 10) : 0, r = 34, c = 2 * Math.PI * r;
  return (
    <div className="wg-body" style={{ alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 100 100" style={{ width: 96, height: 96 }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="11" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 50 50)" />
        <text x="50" y="49" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--text)">{pct}%</text>
        <text x="50" y="64" textAnchor="middle" fontSize="9" fill="var(--text-faint)">usado</text>
      </svg>
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{fmtSize(used)}{quota ? " de " + fmtSize(quota) : ""}</div>
    </div>
  );
}

function Widget({ w, shifted, onMove, onClose, note, onNote, onOpen }) {
  const drag = React.useRef(null);
  const start = (e) => {
    if (e.target.closest(".wg-note, .wg-x, button, input, select")) return;
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
      {w.type === "weather" && <WeatherWidget id={w.id} />}
      {w.type === "note" && <NoteWidget id={w.id} note={note} onNote={onNote} />}
      {w.type === "storage" && <StorageWidget />}
      {w.type === "timer" && <TimerWidget id={w.id} />}
      {w.type === "calc" && <CalcWidget />}
      {w.type === "recent" && <RecentWidget onOpen={onOpen} />}
      {w.type === "world" && <WorldWidget />}
      {w.type === "fx" && <FxWidget />}
      {w.type === "system" && <SystemWidget />}
    </div>
  );
}

export { WIDGET_TYPES, Widget, calc };
