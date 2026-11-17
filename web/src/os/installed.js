/* ============================================================
   Sotos — apps instaladas desde la Tienda (cuenta: servidor; invitado: este navegador)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { api, onServer } from "./api.js";
import * as vfs from "./vfs.js";
const LKEY = "sotos_installed";
let installed = new Set((() => { try { return JSON.parse(localStorage.getItem(LKEY)) || []; } catch { return []; } })());
let ratings = {}; const subs = new Set(); let started = false;
const emit = () => subs.forEach(f => f());
export const isInstalled = (id) => installed.has(id);
export const getRatings = () => ratings;
export function subscribeInstalled(f) { subs.add(f); return () => subs.delete(f); }
export async function loadInstalled() {
  if (vfs.getState().mode === "cloud") {
    try { const r = await api("GET", "store"); installed = new Set(r.installed); ratings = r.ratings || {}; } catch {}
    if (!started) { started = true; onServer("store", () => loadInstalled()); }
  } else { try { installed = new Set(JSON.parse(localStorage.getItem(LKEY)) || []); } catch {} }
  emit();
}
export async function setInstalled(id, on) {
  if (vfs.getState().mode === "cloud") await api("POST", `store/${id}/${on ? "install" : "uninstall"}`, {});
  on ? installed.add(id) : installed.delete(id);
  try { if (vfs.getState().mode !== "cloud") localStorage.setItem(LKEY, JSON.stringify([...installed])); } catch {}
  emit();
}