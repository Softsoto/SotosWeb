/* ============================================================
   Sotos — apps instaladas desde la Tienda (cuenta: servidor; invitado: este navegador)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { api, onServer } from "./api.js";
import * as vfs from "./vfs.js";
import { registerExtApps } from "./data.jsx";
let permNames = {}; export const permissionNames = () => permNames;
const LKEY = "sotos_installed";
let installed = new Set((() => { try { return JSON.parse(localStorage.getItem(LKEY)) || []; } catch { return []; } })());
let ratings = {}, dates = {}; const subs = new Set(); let started = false;
const emit = () => subs.forEach(f => f());
export const isInstalled = (id) => installed.has(id);
export const installDate = (id) => dates[id] || null;
export const getRatings = () => ratings;
export function subscribeInstalled(f) { subs.add(f); return () => subs.delete(f); }
export async function loadInstalled() {
  if (vfs.getState().mode === "cloud") {
    try { const r = await api("GET", "store"); installed = new Set(r.installed); ratings = r.ratings || {}; dates = r.dates || {}; } catch {}
    try { const a = await api("GET", "apps"); registerExtApps(a.items || []); permNames = a.permissions || {}; } catch {} // apps del SDK
    if (!started) { started = true; onServer("store", () => loadInstalled()); }
  } else { try { installed = new Set(JSON.parse(localStorage.getItem(LKEY)) || []); } catch {} }
  emit();
}
export async function setInstalled(id, on) {
  if (vfs.getState().mode === "cloud") await api("POST", `store/${id}/${on ? "install" : "uninstall"}`, {});
  on ? installed.add(id) : installed.delete(id); if (on) dates[id] = Date.now(); else delete dates[id];
  try { if (vfs.getState().mode !== "cloud") localStorage.setItem(LKEY, JSON.stringify([...installed])); } catch {}
  emit();
}