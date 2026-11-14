/* ============================================================
   Sotos OS — piezas compartidas de archivos (Archivos + Escritorio)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import * as vfs from "./vfs.js";
import { fmtSize, fmtDate } from "./vfs.js";
import { FileGlyph, Modal, toast, Ic } from "./ui.jsx";
import { api } from "./api.js";
const { useState, useEffect } = React;

/* URL de objeto para un archivo (miniaturas, reproductores) */
export function useObjectUrl(id, mtime) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true; setUrl(null);
    if (id) vfs.objectUrl(id).then(u => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [id, mtime]);
  return url;
}

export function NodeGlyph({ node, size = 46 }) {
  const isImg = node && node.type === "img" && (node.size || node.url) && node.size < 25 * 1024 * 1024;
  const url = useObjectUrl(isImg ? node.id : null, node?.mtime);
  if (!node) return null;
  if (node.type === "img") return <FileGlyph type="img" src={url} size={size} />;
  if (node.type === "csv") return <FileGlyph type="csv" size={size} />;
  if (node.type === "zip") return <Ic name="folder_zip" style={{ fontSize: size, color: "#c99a2e" }} />;
  if (node.type === "file") return <Ic name="draft" style={{ fontSize: size, color: "#8a929c" }} />;
  return <FileGlyph type={node.type} size={size} />;
}

/* ---------------- arrastrar / soltar ---------------- */
export const DRAG_MIME = "application/x-sotos-ids";
export function dragIds(e, ids) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
  e.dataTransfer.setData("text/plain", ids.map(id => vfs.node(id)?.name).filter(Boolean).join("\n"));
  e.dataTransfer.effectAllowed = "copyMove";
}
const hasIds = (e) => [...e.dataTransfer.types].includes(DRAG_MIME);
const hasFiles = (e) => [...e.dataTransfer.types].includes("Files");
/** handlers para soltar sobre una carpeta: mueve (Ctrl = copia) o importa archivos del PC */
export function dropTarget(destId, { onHot } = {}) {
  return {
    onDragOver: (e) => { if (hasIds(e) || hasFiles(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = hasFiles(e) || e.ctrlKey ? "copy" : "move"; onHot && onHot(true); } },
    onDragLeave: () => onHot && onHot(false),
    onDrop: async (e) => {
      onHot && onHot(false);
      if (hasIds(e)) {
        e.preventDefault(); e.stopPropagation();
        let ids = []; try { ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME)); } catch {}
        ids = ids.filter(id => id !== destId);
        if (!ids.length) return;
        if (e.ctrlKey) { await vfs.copy(ids, destId); toast(`${ids.length} elemento(s) copiado(s)`); }
        else { const n = vfs.move(ids, destId); if (n) toast(`${n} elemento(s) movido(s) a ${vfs.node(destId)?.name}`); }
      } else if (hasFiles(e)) {
        e.preventDefault(); e.stopPropagation();
        try { const ids = await vfs.importDataTransfer(destId, e.dataTransfer); toast(`${ids.length} elemento(s) subido(s)`, { icon: "cloud_done" }); }
        catch (err) { toast("No se pudo subir: " + err.message, { error: true }); }
      }
    },
  };
}

/* ---------------- menú contextual ---------------- */
export function itemMenu(nodes, { canPaste } = {}) {
  const one = nodes.length === 1 ? nodes[0] : null;
  const items = [];
  if (one) items.push({ id: "open", label: "Abrir", icon: "open_in_new" });
  if (one && one.type === "folder" && canPaste) items.push({ id: "pasteInto", label: "Pegar aquí dentro", icon: "content_paste" });
  items.push({ sep: true },
    { id: "copy", label: "Copiar", icon: "content_copy" },
    { id: "cut", label: "Cortar", icon: "content_cut" },
    { id: "download", label: one && one.type === "folder" ? "Descargar como .zip" : "Descargar", icon: "download" });
  if (one) items.push({ id: "share", label: "Compartir…", icon: "group_add" });
  if (one && one.type === "img") items.push({ id: "wallpaper", label: "Usar como fondo", icon: "wallpaper" });
  if (one && one.type === "zip" && /\.zip$/i.test(one.name)) items.push({ id: "unzip", label: "Extraer aquí", icon: "unarchive" });
  items.push({ sep: true });
  if (one) items.push({ id: "rename", label: "Renombrar", icon: "drive_file_rename_outline" }, { id: "props", label: "Propiedades", icon: "info" });
  items.push({ id: "trash", label: "Mover a la papelera", icon: "delete", danger: true });
  return items;
}
/** acciones comunes; devuelve true si la manejó */
export async function runItemAction(id, nodes, { openItem, update, startRename, showProps, showShare, parentId }) {
  const ids = nodes.map(n => n.id);
  const one = nodes[0];
  switch (id) {
    case "open": openItem(one); return true;
    case "copy": vfs.clip("copy", ids); toast(`${ids.length} elemento(s) copiado(s) al portapapeles`, { icon: "content_copy" }); return true;
    case "cut": vfs.clip("cut", ids); toast(`${ids.length} elemento(s) cortado(s)`, { icon: "content_cut" }); return true;
    case "pasteInto": { const n = await vfs.paste(one.id); if (n) toast(`${n} elemento(s) pegado(s) en ${one.name}`); return true; }
    case "download": for (const n of nodes) await vfs.download(n.id).catch(e => toast("No se pudo descargar: " + e.message, { error: true })); return true;
    case "wallpaper": update && update("wallpaper", "file:" + one.id); toast("Fondo de escritorio cambiado", { icon: "wallpaper" }); return true;
    case "unzip": await unzip(one, parentId); return true;
    case "rename": startRename && startRename(one.id); return true;
    case "props": showProps && showProps(one.id); return true;
    case "share": showShare ? showShare(one.id) : window.dispatchEvent(new CustomEvent("sotos-share", { detail: one.id })); return true;
    case "trash": {
      const n = vfs.trash(ids);
      if (n) toast(`${n} elemento(s) en la papelera`, { icon: "delete", action: { label: "Deshacer", run: () => vfs.restore(ids) } });
      return true;
    }
  }
  return false;
}
async function unzip(n, parentId) {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await vfs.read(n.id));
    const root = vfs.mkdir(parentId, n.name.replace(/\.zip$/i, ""));
    const dirs = new Map([["", root]]);
    const dirFor = (path) => {
      if (dirs.has(path)) return dirs.get(path);
      const i = path.lastIndexOf("/"); const parent = dirFor(i < 0 ? "" : path.slice(0, i));
      const id = vfs.mkdir(parent, path.slice(i + 1)); dirs.set(path, id); return id;
    };
    let count = 0;
    for (const [p, entry] of Object.entries(zip.files)) {
      const clean = p.replace(/\\/g, "/").split("/").filter(s => s && s !== ".." && s !== ".").join("/");
      if (!clean || /^__MACOSX/.test(clean)) continue;
      if (entry.dir) { dirFor(clean); continue; }
      const i = clean.lastIndexOf("/");
      await vfs.create(dirFor(i < 0 ? "" : clean.slice(0, i)), clean.slice(i + 1), await entry.async("blob"));
      count++;
    }
    toast(`${count} archivo(s) extraído(s)`, { icon: "unarchive" });
  } catch (e) { toast("No se pudo extraer: " + e.message, { error: true }); }
}

/* ---------------- propiedades ---------------- */
const TYPE_LABEL = { folder: "Carpeta", docx: "Documento de Word", xlsx: "Libro de Excel", csv: "Valores separados por comas", pptx: "Presentación de PowerPoint",
  pdf: "Documento PDF", img: "Imagen", audio: "Audio", video: "Vídeo", txt: "Texto", code: "Código / texto", zip: "Archivo comprimido", file: "Archivo" };
export function PropertiesModal({ id, onClose }) {
  const n = vfs.useVfs(() => vfs.node(id));
  if (!n) return null;
  const isFolder = n.type === "folder";
  let files = 0, folders = 0; if (isFolder) vfs.walk(x => { if (x.id !== n.id) x.children ? folders++ : files++; }, n);
  const rows = [
    ["Tipo", TYPE_LABEL[n.type] || n.type],
    ["Ubicación", "/" + vfs.pathOf(id).slice(0, -1).map(p => p.name).join("/")],
    ["Tamaño", isFolder ? `${fmtSize(vfs.folderSize(n))} · ${files} archivo(s), ${folders} carpeta(s)` : n.online && !n.size ? "En línea (se transmite)" : fmtSize(n.size)],
    ["Creado", n.ctime ? new Date(n.ctime).toLocaleString("es-ES") : "—"],
    ["Modificado", n.mtime ? new Date(n.mtime).toLocaleString("es-ES") : "—"],
  ];
  if (n.meta?.artist) rows.push(["Artista", n.meta.artist]);
  return (
    <Modal title={n.name} icon="info" onClose={onClose} width={420}
      actions={<button className="tb-btn primary" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ width: 70, display: "grid", placeItems: "center" }}><NodeGlyph node={n} size={56} /></div>
        <table className="props-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
      </div>
    </Modal>
  );
}

/* ---------------- compartir ---------------- */
export const shareUrl = (token) => `${location.origin}/#/s/${token}`;
export function ShareDialog({ id, onClose }) {
  const n = vfs.useVfs(() => vfs.node(id));
  const mode = vfs.useVfs(s => s.mode);
  const [perm, setPerm] = useState("view");
  const [days, setDays] = useState(0);
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(null);
  const [made, setMade] = useState(null);
  const load = () => api("GET", "shares").then(r => setList(r.shares.filter(s => s.nodeId === id))).catch(() => setList([]));
  useEffect(() => { if (mode === "cloud") load(); }, [id, mode]);
  if (!n) return null;
  if (mode !== "cloud") return (
    <Modal title="Compartir" icon="group_add" onClose={onClose} actions={<button className="tb-btn primary" onClick={onClose}>Entendido</button>}>
      <div className="muted" style={{ fontSize: 13.5 }}>Estás como invitado: tus archivos solo existen en este navegador. Inicia sesión con una cuenta de Sotos para compartir enlaces.</div>
    </Modal>
  );
  const copy = (t) => { navigator.clipboard?.writeText(shareUrl(t)).then(() => toast("Enlace copiado", { icon: "content_copy" })).catch(() => {}); };
  const create = async () => {
    setBusy(true);
    try {
      await vfs.flush();
      const r = await api("POST", "shares", { nodeId: id, perm, days: Number(days) || 0, emails: emails.split(/[\s,;]+/).filter(Boolean) });
      setMade(r.token); copy(r.token); load();
      if (r.missing?.length) toast(`Sin cuenta en Sotos: ${r.missing.join(", ")}`, { icon: "person_off" });
    } catch (e) { toast("No se pudo compartir: " + e.message, { error: true }); }
    setBusy(false);
  };
  const revoke = async (t) => { await api("DELETE", "shares/" + t).catch(e => toast(e.message, { error: true })); load(); if (made === t) setMade(null); };
  return (
    <Modal title={`Compartir “${n.name}”`} icon="group_add" onClose={onClose} width={470}
      actions={<><button className="tb-btn" onClick={onClose}>Cerrar</button><button className="tb-btn primary" disabled={busy} onClick={create}><Ic name="link" /> Crear enlace</button></>}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <label className="field">Permiso<select value={perm} onChange={e => setPerm(e.target.value)}><option value="view">Solo ver y descargar</option><option value="edit">Puede editar (Word/Excel/PowerPoint)</option></select></label>
          <label className="field" style={{ flex: "0 0 130px" }}>Caduca<select value={days} onChange={e => setDays(e.target.value)}><option value={0}>Nunca</option><option value={1}>En 1 día</option><option value={7}>En 7 días</option><option value={30}>En 30 días</option></select></label>
        </div>
        <label className="field">Solo para estas personas (opcional)
          <input placeholder="correo@ejemplo.com, otro@ejemplo.com" value={emails} onChange={e => setEmails(e.target.value)} /></label>
        <div className="faint" style={{ fontSize: 12 }}>{emails.trim() ? "Solo esas cuentas de Sotos podrán abrirlo y lo verán en “Compartido conmigo”." : "Cualquiera con el enlace podrá abrirlo, sin cuenta."}</div>
        {made && <div className="share-link"><span>{shareUrl(made)}</span><button className="tb-btn primary" onClick={() => copy(made)}><Ic name="content_copy" size={16} /> Copiar</button></div>}
        {list?.length > 0 && <div>
          <div className="side-label" style={{ padding: "6px 0" }}>Enlaces activos</div>
          {list.map(s => (
            <div key={s.token} className="share-row">
              <Ic name={s.people.length ? "group" : "public"} size={18} />
              <span style={{ flex: 1, minWidth: 0 }}>{s.perm === "edit" ? "Edición" : "Lectura"} · {s.people.length ? s.people.map(p => p.name).join(", ") : "cualquiera con el enlace"}
                <span className="faint"> · {s.expires ? "caduca " + fmtDate(s.expires) : "sin caducidad"}</span></span>
              <button className="tb-btn icon" title="Copiar" onClick={() => copy(s.token)}><Ic name="content_copy" size={16} /></button>
              <button className="tb-btn icon" title="Dejar de compartir" onClick={() => revoke(s.token)}><Ic name="link_off" size={16} /></button>
            </div>
          ))}
        </div>}
      </div>
    </Modal>
  );
}

export { fmtSize, fmtDate };
