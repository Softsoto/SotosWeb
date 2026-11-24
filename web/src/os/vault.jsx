/* ============================================================
   Sotos — Bóveda secreta (se abre pulsando 5 veces seguidas el logo de Aplicaciones)
   Archivos cifrados con tu clave: ni el servidor ni un administrador pueden verlos.
   Carpetas (se suben enteras, con sus subcarpetas), carpetas con contraseña propia,
   selección con recuadro, Ctrl y Mayús, mover arrastrando sobre una carpeta y menú
   con clic derecho.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { pickAsFiles } from "./filepicker.jsx";
import { Ic, EmptyState, Modal, ContextMenu, toast } from "./ui.jsx";
import { api } from "./api.js";
import * as vfs from "./vfs.js";
import { fmtSize, fmtDate, useVfs } from "./vfs.js";
import { DRAG_MIME } from "./files-ui.jsx";
import { useMarquee } from "./seleccion.jsx";
const { useState, useEffect, useRef } = React;

let token = null; // clave de la sesión abierta (solo en memoria: al recargar, la bóveda vuelve a cerrarse)
const vapi = (m, p, b) => fetch("/api/vault/" + p, { method: m, headers: { "x-sotos": "1", "content-type": "application/json", ...(token ? { "x-vault": token } : {}) }, body: b ? JSON.stringify(b) : undefined })
  .then(async r => { const j = await r.json().catch(() => ({})); if (r.status === 423) { token = null; throw Object.assign(new Error("La bóveda se cerró"), { locked: true }); } if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; });
const kind = (n) => /\.(png|jpe?g|gif|webp)$/i.test(n) ? "img" : /\.(mp4|webm)$/i.test(n) ? "video" : /\.(mp3|m4a|ogg|wav)$/i.test(n) ? "audio" : /\.pdf$/i.test(n) ? "pdf" : "file";
const ICON = { img: "image", video: "movie", audio: "music_note", pdf: "picture_as_pdf", file: "draft" };
const base = (p) => p.split("/").pop();
const parent = (p) => p.split("/").slice(0, -1).join("/");
const BAD = /[\\/:*?"<>|]/;
const MOVE_MIME = "application/x-sotos-vault";

/** gesto secreto: 5 pulsaciones seguidas (en 3 s) sobre el logo de Aplicaciones abren la bóveda */
export function useVaultGesture(openApp) {
  useEffect(() => {
    let hits = [];
    const on = (e) => {
      if (!e.target.closest?.('[data-app="launchpad"], .rail-logo, .tb-start, .ss-head h1')) return; // dock, riel de Grafito, botón Inicio de las épocas o «Inicio» de Mosaico
      const t = Date.now(); hits = hits.filter(x => t - x < 3000); hits.push(t);
      if (hits.length >= 5) { hits = []; setTimeout(() => openApp("vault"), 50); }
    };
    document.addEventListener("click", on, true); return () => document.removeEventListener("click", on, true);
  }, [openApp]);
}

/** lo que se soltó desde el computador, con la ruta de cada archivo dentro de las carpetas */
function droppedEntries(dt) {
  const entries = [...(dt.items || [])].filter(i => i.kind === "file").map(i => i.webkitGetAsEntry?.()).filter(Boolean); // hay que pedirlas antes de esperar nada
  const plain = [...dt.files];
  return (async () => {
    if (!entries.length) return plain.map(f => ({ file: f, rel: f.name }));
    const out = [];
    const readAll = (dir) => new Promise(ok => { const r = dir.createReader(), acc = []; const next = () => r.readEntries(es => { if (!es.length) return ok(acc); acc.push(...es); next(); }, () => ok(acc)); next(); });
    const walk = async (e, pre) => {
      if (e.isFile) { try { out.push({ file: await new Promise((ok, bad) => e.file(ok, bad)), rel: pre + e.name }); } catch {} }
      else if (e.isDirectory) { const kids = await readAll(e); if (!kids.length) out.push({ dir: pre + e.name }); for (const k of kids) await walk(k, pre + e.name + "/"); }
    };
    for (const e of entries) await walk(e, "");
    return out;
  })();
}

export function VaultApp() {
  const mode = useVfs(s => s.mode);
  const [st, setSt] = useState(token ? "open" : "loading"), [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [busy, setBusy] = useState(false);
  const [items, setItems] = useState(null), [locks, setLocks] = useState([]), [cwd, setCwd] = useState("");
  const [view, setView] = useState(null), [up, setUp] = useState(null), [q, setQ] = useState("");
  const [sel, setSel] = useState([]), [ctx, setCtx] = useState(null), [ask, setAsk] = useState(null), [hotDir, setHotDir] = useState(null);
  const [adminSees, setAdminSees] = useState(false); // regla del servidor elegida al instalar
  const anchor = useRef(null), gridRef = useRef(null), rootRef = useRef(null), dirInput = useRef(null);
  const mq = useMarquee({ box: gridRef, items: ".vault-item", idOf: el => el.dataset.id, sel, setSel });

  const load = () => vapi("GET", "files").then(r => { setItems(r.items); setLocks(r.locks || []); }).catch(e => { if (e.locked) setSt("locked"); else toast(e.message, { error: true }); });
  useEffect(() => { if (mode !== "cloud") { setSt("guest"); return; } if (token) { setSt("open"); load(); api("GET", "vault").then(r => setAdminSees(!!r.adminCanSee)).catch(() => {}); return; } api("GET", "vault").then(r => { setAdminSees(!!r.adminCanSee); setSt(r.exists ? "locked" : "new"); }).catch(() => setSt("error")); }, [mode]);
  useEffect(() => () => { if (token) { vapi("POST", "lock").catch(() => {}); token = null; } }, []); // al cerrar la ventana, se cierra la bóveda
  useEffect(() => { setSel([]); }, [cwd, q]);
  const enter = async (path) => { setBusy(true); try { const r = await vapi("POST", path, { password: pw }); token = r.token; setPw(""); setPw2(""); setSt("open"); load(); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };

  /* ---- subir: archivos sueltos o carpetas enteras (rel = ruta dentro de lo que se subió) ---- */
  const prefix = cwd ? cwd + "/" : "";
  const upload = async (list, at = prefix) => {
    const files = list.filter(x => x.file), dirs = list.filter(x => x.dir);
    for (const d of dirs) await vapi("POST", "folders/new", { path: at + d.dir }).catch(() => {});
    let i = 0;
    for (const { file, rel } of files) {
      i++; setUp({ name: rel, pct: 0, i, n: files.length });
      await new Promise((ok) => { const x = new XMLHttpRequest(); x.open("PUT", "/api/vault/files?name=" + encodeURIComponent(at + rel)); x.setRequestHeader("x-sotos", "1"); x.setRequestHeader("x-vault", token);
        x.upload.onprogress = (e) => setUp({ name: rel, pct: Math.round(e.loaded / e.total * 100), i, n: files.length }); x.onload = () => { if (x.status >= 300) toast(JSON.parse(x.responseText || "{}").error || "No se pudo subir " + rel, { error: true }); ok(); }; x.onerror = () => { toast("Sin conexión", { error: true }); ok(); }; x.send(file); });
    }
    setUp(null); load();
    if (files.length > 1 || dirs.length) toast(`${files.length} archivo(s) guardado(s) en la bóveda`, { icon: "enhanced_encryption" });
  };
  const fromSotos = async (ids) => {
    const out = [];
    const walk = async (n, pre) => {
      if (!n) return;
      if (n.type === "folder") { const kids = n.children || []; if (!kids.length) out.push({ dir: pre + n.name }); for (const c of kids) await walk(c, pre + n.name + "/"); }
      else { try { out.push({ file: new File([await vfs.read(n.id)], n.name), rel: pre + n.name }); } catch { toast("No se pudo leer «" + n.name + "»", { error: true }); } }
    };
    for (const id of ids) await walk(vfs.node(id), "");
    if (!out.length) return toast("No había nada que guardar", { icon: "folder_off" });
    await upload(out);
    toast(`Guardado en la bóveda`, { icon: "enhanced_encryption", action: { label: "Quitar de Archivos", run: () => { vfs.trash(ids); toast("Originales enviados a la papelera", { icon: "delete" }); } } });
  };
  const [hot, setHot] = useState(false);
  const onDrop = async (e) => {
    e.preventDefault(); setHot(false); if (st !== "open") return toast("Abre la bóveda para guardar archivos", { icon: "lock" });
    const types = [...e.dataTransfer.types];
    if (types.includes(MOVE_MIME)) return; // mover dentro de la bóveda se suelta sobre una carpeta
    if (types.includes(DRAG_MIME)) { let ids = []; try { ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME)); } catch {} if (ids.length) fromSotos(ids); return; }
    const list = await droppedEntries(e.dataTransfer); if (list.length) upload(list);
  };
  const onOver = (e) => { const t = [...e.dataTransfer.types]; if (t.includes(DRAG_MIME) || t.includes("Files")) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; if (!hot) setHot(true); } };
  const url = (it, dl) => `/api/vault/files/${it.id}?k=${encodeURIComponent(token || "")}${dl ? "&dl=1" : ""}`;

  if (st === "loading") return <div className="app vault"><EmptyState icon="hourglass_empty" text="…" /></div>;
  if (st === "guest") return <div className="app vault"><div className="vault-gate"><div className="vault-guest">
    <EmptyState icon="lock" text="Estás usando Sotos como invitado. La bóveda cifra tus archivos con tu cuenta, así que necesitas iniciar sesión." />
    <button className="tb-btn primary" onClick={() => window.dispatchEvent(new Event("sotos-ir-a-login"))}><Ic name="login" size={18} /> Iniciar sesión</button></div></div></div>;
  if (st === "error") return <div className="app vault"><EmptyState icon="cloud_off" text="No se pudo abrir la bóveda" /></div>;
  if (st === "new" || st === "locked") return (
    <div className="app vault"><div className="vault-gate">
      <div className="vault-lock"><Ic name={st === "new" ? "enhanced_encryption" : "lock"} size={44} /></div>
      <h2>{st === "new" ? "Crea tu bóveda" : "Bóveda"}</h2>
      {st === "new" && <div className="vault-note">Todo lo que guardes aquí queda <b>cifrado con esta clave</b> y <b>si la olvidas no hay forma de recuperarlo</b>. No aparece en Archivos, en la búsqueda ni en ninguna lista.</div>}
      {!adminSees && <div className="vault-policy"><Ic name="verified_user" size={16} /> Nadie más que tú puede abrir tu bóveda, ni siquiera el administrador.</div>}
      <input type="password" autoFocus placeholder={st === "new" ? "Clave de la bóveda (mínimo 6)" : "Clave"} value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && st === "locked" && pw && enter("unlock")} />
      {st === "new" && <input type="password" placeholder="Repite la clave" value={pw2} onChange={e => setPw2(e.target.value)} />}
      <button className="tb-btn primary" disabled={busy || pw.length < (st === "new" ? 6 : 1) || (st === "new" && pw !== pw2)} onClick={() => enter(st === "new" ? "setup" : "unlock")}>{busy ? "…" : st === "new" ? "Crear bóveda" : "Abrir"}</button>
    </div></div>
  );

  /* ---- lo que se ve en la carpeta actual (o en la búsqueda) ---- */
  const all = items || [];
  const lockOf = (p) => locks.find(l => l.path === p);
  let entries;
  if (q.trim()) {
    const ql = q.toLowerCase();
    entries = all.filter(x => !x.dir && base(x.name).toLowerCase().includes(ql)).map(x => ({ key: x.id, file: x, name: base(x.name), where: parent(x.name) }));
  } else {
    const dirs = new Map(), files = [];
    const addDir = (p) => { if (!dirs.has(p)) dirs.set(p, { key: "d:" + p, dir: p, name: base(p) }); };
    for (const x of all) {
      if (!x.name.startsWith(prefix) && prefix) continue;
      const rest = x.name.slice(prefix.length); if (!rest) continue;
      if (rest.includes("/")) addDir(prefix + rest.split("/")[0]);
      else if (x.dir) addDir(x.name);
      else files.push({ key: x.id, file: x, name: rest });
    }
    for (const l of locks) if (parent(l.path) === cwd) addDir(l.path); // carpeta cerrada: no se ve su contenido, pero sí ella
    entries = [...[...dirs.values()].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })), ...files.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }))];
  }
  const selected = entries.filter(e => sel.includes(e.key));
  const total = all.filter(x => !x.dir).reduce((s, x) => s + x.size, 0);

  /* ---- acciones ---- */
  const openDir = async (p) => { const l = lockOf(p); if (l && !l.open) return setAsk({ kind: "unlock", path: p, then: () => setCwd(p) }); setQ(""); setCwd(p); };
  const openEntry = (e) => e.dir ? openDir(e.dir) : setView(e.file);
  const click = (ev, e, i) => {
    ev.stopPropagation();
    if (ev.shiftKey && anchor.current != null) { const a = entries.findIndex(x => x.key === anchor.current); const [s, t] = [Math.min(a, i), Math.max(a, i)]; setSel(entries.slice(Math.max(0, s), t + 1).map(x => x.key)); }
    else if (ev.ctrlKey || ev.metaKey) { setSel(s => s.includes(e.key) ? s.filter(x => x !== e.key) : [...s, e.key]); anchor.current = e.key; }
    else { setSel([e.key]); anchor.current = e.key; }
  };
  const run = async (fn, okMsg) => { try { await fn(); if (okMsg) toast(okMsg.text, { icon: okMsg.icon }); } catch (e) { if (e.locked) setSt("locked"); else toast(e.message, { error: true }); } load(); };
  const removeMany = (list) => setAsk({ kind: "delete", list });
  const doRemove = (list) => run(async () => { for (const e of list) { if (e.dir) await vapi("POST", "folders/delete", { path: e.dir }); else await vapi("DELETE", "files/" + e.file.id); } setSel([]); setView(null); },
    { text: `${list.length} elemento(s) eliminado(s) de la bóveda`, icon: "delete" });
  const moveInto = (keys, dest) => run(async () => {
    for (const k of keys) {
      const e = entries.find(x => x.key === k); if (!e) continue;
      if (e.dir) { if (dest === e.dir || dest.startsWith(e.dir + "/")) continue; await vapi("POST", "folders/rename", { path: e.dir, to: (dest ? dest + "/" : "") + base(e.dir) }); }
      else await vapi("PATCH", "files/" + e.file.id, { name: (dest ? dest + "/" : "") + e.name });
    }
    setSel([]);
  }, { text: `Movido a «${dest ? base(dest) : "Bóveda"}»`, icon: "drive_file_move" });
  const downloadFile = (f) => { const a = document.createElement("a"); a.href = url(f, true); a.download = base(f.name); document.body.appendChild(a); a.click(); a.remove(); };
  const menuFor = (list) => {
    const one = list.length === 1 ? list[0] : null, out = [];
    if (one) out.push({ id: "open", label: "Abrir", icon: "open_in_new" });
    if (list.some(e => !e.dir)) out.push({ id: "download", label: list.filter(e => !e.dir).length > 1 ? "Descargar los archivos" : "Descargar", icon: "download" });
    if (one) out.push({ id: "rename", label: "Renombrar", icon: "drive_file_rename" });
    if (one?.dir) { const l = lockOf(one.dir); out.push({ sep: true }, ...(!l ? [{ id: "lock", label: "Poner contraseña…", icon: "lock" }] : [...(l.open ? [{ id: "relock", label: "Cerrar con contraseña ahora", icon: "lock" }] : []), { id: "unlockremove", label: "Quitar contraseña…", icon: "no_encryption" }])); }
    out.push({ sep: true }, { id: "delete", label: list.length > 1 ? `Eliminar ${list.length} elementos` : "Eliminar", icon: "delete", danger: true });
    return out;
  };
  const onMenu = (id, list) => {
    const one = list[0];
    if (id === "open") openEntry(one);
    else if (id === "download") list.filter(e => !e.dir).forEach((e, i) => setTimeout(() => downloadFile(e.file), i * 300));
    else if (id === "rename") setAsk({ kind: "rename", entry: one });
    else if (id === "lock" || id === "unlockremove") setAsk({ kind: id, path: one.dir });
    else if (id === "relock") run(() => vapi("POST", "folders/relock", { path: one.dir }), { text: `«${one.name}» quedó cerrada`, icon: "lock" });
    else if (id === "delete") removeMany(list);
  };
  const onKey = (e) => {
    if (e.target.closest("input") || ask || view) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "a") { e.preventDefault(); setSel(entries.map(x => x.key)); }
    else if (k === "delete" && selected.length) removeMany(selected);
    else if (k === "enter" && selected.length === 1) openEntry(selected[0]);
    else if (k === "backspace" && cwd) setCwd(parent(cwd));
    else if (k === "escape") setSel([]);
  };
  const crumbs = cwd ? cwd.split("/").map((n, i, a) => ({ name: n, path: a.slice(0, i + 1).join("/") })) : [];
  const dropOn = (dest) => ({
    onDragOver: (e) => { if ([...e.dataTransfer.types].includes(MOVE_MIME)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setHotDir(dest); } },
    onDragLeave: () => setHotDir(h => h === dest ? null : h),
    onDrop: (e) => { if (![...e.dataTransfer.types].includes(MOVE_MIME)) return; e.preventDefault(); e.stopPropagation(); setHotDir(null); let keys = []; try { keys = JSON.parse(e.dataTransfer.getData(MOVE_MIME)); } catch {} if (keys.length) moveInto(keys, dest); },
  });

  return (
    <div ref={rootRef} tabIndex={-1} onKeyDown={onKey} className={"app vault" + (hot ? " hot" : "")} style={{ flexDirection: "column", outline: "none" }} onDragOver={onOver} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHot(false); }} onDrop={e => { e.stopPropagation(); onDrop(e); }}>
      <input ref={dirInput} type="file" webkitdirectory="" style={{ display: "none" }} onChange={e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f.map(file => ({ file, rel: file.webkitRelativePath || file.name }))); }} />
      <div className="vault-bar">
        <Ic name="lock_open" /><b>Bóveda</b><span className="faint">{items ? `${all.filter(x => !x.dir).length} archivo(s) · ${fmtSize(total)}` : ""}</span>
        <div className="search-box" style={{ flex: 1, maxWidth: 240, marginLeft: "auto" }}><Ic name="search" size={16} /><input placeholder="Buscar en toda la bóveda" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className="tb-btn" title="Nueva carpeta" onClick={() => setAsk({ kind: "newdir" })}><Ic name="create_new_folder" /></button>
        <button className="tb-btn" title="Subir una carpeta con todo lo que tiene" onClick={() => dirInput.current.click()}><Ic name="drive_folder_upload" /></button>
        <button className="tb-btn primary" onClick={async () => { const f = await pickAsFiles({ title: "Guardar en la bóveda", multiple: true }); if (f?.length) upload(f.map(file => ({ file, rel: file.name }))); }}><Ic name="upload" /> Subir</button>
        <button className="tb-btn" title="Cerrar la bóveda" onClick={async () => { await vapi("POST", "lock").catch(() => {}); token = null; setItems(null); setSt("locked"); }}><Ic name="lock" /> Cerrar</button>
      </div>
      <div className="vault-crumbs">
        <span className={"crumb" + (hotDir === "" ? " hot" : "")} onClick={() => { setQ(""); setCwd(""); }} {...dropOn("")}><Ic name="enhanced_encryption" size={15} /> Bóveda</span>
        {crumbs.map(c => <React.Fragment key={c.path}><Ic name="chevron_right" size={15} /><span className={"crumb" + (hotDir === c.path ? " hot" : "")} onClick={() => openDir(c.path)} {...dropOn(c.path)}>{c.name}</span></React.Fragment>)}
        {selected.length > 0 && <><span className="faint" style={{ marginLeft: "auto" }}>{selected.length} seleccionado(s)</span>
          <button className="tb-btn danger" onClick={() => removeMany(selected)}><Ic name="delete" /> Eliminar</button></>}
      </div>
      {up && <div className="vault-up"><Ic name="upload" size={16} /> Cifrando y guardando «{up.name}»{up.n > 1 ? ` (${up.i} de ${up.n})` : ""}… {up.pct}%<div className="tr-bar"><i style={{ width: up.pct + "%" }} /></div></div>}
      <div ref={gridRef} className="scroll vault-grid"
        onMouseDown={e => { if (!e.target.closest(".vault-item")) { rootRef.current?.focus(); mq.start(e); } }}
        onContextMenu={e => { if (e.target.closest(".vault-item")) return; e.preventDefault(); setSel([]); setCtx({ x: e.clientX, y: e.clientY, list: null }); }}>
        {items && !entries.length && <EmptyState icon="enhanced_encryption" text={q ? "Sin resultados" : "Arrastra aquí archivos o carpetas para guardarlos en secreto"} />}
        {entries.map((e, i) => { const k = e.dir ? "dir" : kind(e.name), l = e.dir && lockOf(e.dir); return (
          <div key={e.key} data-id={e.key} className={"vault-item" + (sel.includes(e.key) ? " sel" : "") + (hotDir === e.dir && e.dir ? " hot" : "")} title={e.where ? `${e.where}/${e.name}` : e.name}
            draggable onDragStart={ev => { const keys = sel.includes(e.key) ? sel : [e.key]; ev.dataTransfer.setData(MOVE_MIME, JSON.stringify(keys)); ev.dataTransfer.effectAllowed = "move"; }}
            {...(e.dir ? dropOn(e.dir) : {})}
            onMouseDown={ev => { if (ev.button === 0 && !sel.includes(e.key)) click(ev, e, i); }}
            onClick={ev => click(ev, e, i)} onDoubleClick={() => openEntry(e)}
            onContextMenu={ev => { ev.preventDefault(); ev.stopPropagation(); const keys = sel.includes(e.key) ? sel : [e.key]; setSel(keys); setCtx({ x: ev.clientX, y: ev.clientY, list: entries.filter(x => keys.includes(x.key)) }); }}>
            <div className="vault-thumb">{k === "img" ? <img src={url(e.file)} alt="" loading="lazy" draggable={false} /> : <Ic name={k === "dir" ? "folder" : ICON[k]} size={k === "dir" ? 52 : 36} className={k === "dir" ? "vault-dirico" : ""} />}
              {l && <Ic name={l.open ? "lock_open" : "lock"} size={16} className="vault-lockbadge" />}</div>
            <div className="vault-name">{e.name}</div>
            <div className="faint vault-meta">{e.dir ? (l && !l.open ? "con contraseña" : "carpeta") : `${fmtSize(e.file.size)} · ${fmtDate(e.file.created)}`}{e.where ? ` · ${e.where}` : ""}</div>
          </div>); })}
        {mq.box}
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y}
        items={ctx.list ? menuFor(ctx.list) : [{ id: "newdir", label: "Nueva carpeta", icon: "create_new_folder" }, { id: "upload", label: "Subir archivos…", icon: "upload_file" }, { id: "uploaddir", label: "Subir carpeta…", icon: "drive_folder_upload" }, { id: "all", label: "Seleccionar todo", icon: "select_all" }]}
        onSelect={async (id) => { const list = ctx.list; setCtx(null);
          if (list) return onMenu(id, list);
          if (id === "newdir") setAsk({ kind: "newdir" });
          else if (id === "upload") { const f = await pickAsFiles({ title: "Guardar en la bóveda", multiple: true }); if (f?.length) upload(f.map(file => ({ file, rel: file.name }))); }
          else if (id === "uploaddir") dirInput.current.click();
          else if (id === "all") setSel(entries.map(x => x.key)); }}
        onClose={() => setCtx(null)} />}
      {view && <Modal title={base(view.name)} icon={ICON[kind(view.name)]} onClose={() => setView(null)} width={860}
        actions={<><button className="tb-btn danger" onClick={() => removeMany([{ key: view.id, file: view, name: base(view.name) }])}><Ic name="delete" /> Eliminar</button>
          <div style={{ flex: 1 }} /><a className="tb-btn" href={url(view, true)} download={base(view.name)}><Ic name="download" /> Descargar</a><button className="tb-btn" onClick={() => setView(null)}>Cerrar</button></>}>
        <div className="vault-view">{{ img: <img src={url(view)} alt="" />, video: <video src={url(view)} controls autoPlay />, audio: <audio src={url(view)} controls autoPlay />, pdf: <iframe title="pdf" src={url(view)} /> }[kind(view.name)]
          || <EmptyState icon="draft" text="No se puede previsualizar: descárgalo para abrirlo" />}</div>
      </Modal>}
      {ask && <VaultAsk ask={ask} onClose={() => setAsk(null)} cwd={cwd} entries={entries}
        onDone={async (v) => {
          const a = ask; setAsk(null);
          if (a.kind === "newdir") return run(() => vapi("POST", "folders/new", { path: prefix + v }), { text: `Carpeta «${v}» creada`, icon: "create_new_folder" });
          if (a.kind === "rename") { const e = a.entry; return run(() => e.dir ? vapi("POST", "folders/rename", { path: e.dir, to: (parent(e.dir) ? parent(e.dir) + "/" : "") + v }) : vapi("PATCH", "files/" + e.file.id, { name: (parent(e.file.name) ? parent(e.file.name) + "/" : "") + v })); }
          if (a.kind === "delete") return doRemove(a.list);
          if (a.kind === "lock") return run(() => vapi("POST", "folders/lock", { path: a.path, password: v }), { text: `«${base(a.path)}» ahora pide contraseña`, icon: "lock" });
          if (a.kind === "unlockremove") return run(() => vapi("POST", "folders/unlockremove", { path: a.path, password: v }), { text: `«${base(a.path)}» ya no pide contraseña`, icon: "no_encryption" });
          if (a.kind === "unlock") { try { await vapi("POST", "folders/unlock", { path: a.path, password: v }); await load(); a.then?.(); } catch (e) { toast(e.message, { error: true }); } }
        }} />}
    </div>
  );
}

/** preguntas de la bóveda: nombre, contraseña de carpeta o confirmar borrado */
function VaultAsk({ ask, onClose, onDone, entries }) {
  const start = ask.kind === "rename" ? ask.entry.name : "";
  const [v, setV] = useState(start), [v2, setV2] = useState("");
  const isPw = ["lock", "unlock", "unlockremove"].includes(ask.kind);
  const T = { newdir: ["Nueva carpeta", "create_new_folder", "Crear"], rename: ["Renombrar", "drive_file_rename", "Renombrar"], delete: ["Eliminar de la bóveda", "delete", "Eliminar"],
    lock: [`Poner contraseña a «${base(ask.path || "")}»`, "lock", "Poner contraseña"], unlock: [`«${base(ask.path || "")}» tiene contraseña`, "lock", "Abrir"], unlockremove: [`Quitar la contraseña de «${base(ask.path || "")}»`, "no_encryption", "Quitar"] }[ask.kind];
  const nameErr = (ask.kind === "newdir" || ask.kind === "rename") && v.trim() && (BAD.test(v) ? "No puede llevar / \\ : * ? \" < > |" : v.trim() !== start && entries.some(e => e.name.toLowerCase() === v.trim().toLowerCase()) ? "Ya hay algo con ese nombre aquí" : null);
  const valid = ask.kind === "delete" ? true : ask.kind === "lock" ? v.length >= 4 && v === v2 : isPw ? !!v : v.trim() && !nameErr && v.trim() !== start;
  const go = () => valid && onDone(isPw ? v : v.trim());
  const dirs = ask.kind === "delete" ? ask.list.filter(e => e.dir).length : 0;
  return (
    <Modal title={T[0]} icon={T[1]} width={400} onClose={onClose}
      actions={<><button className="tb-btn" onClick={onClose}>Cancelar</button><button className={"tb-btn " + (ask.kind === "delete" ? "danger" : "primary")} disabled={!valid} onClick={go}>{T[2]}</button></>}>
      <div className="lock-form">
        {ask.kind === "delete" ? <div>¿Eliminar {ask.list.length === 1 ? `«${ask.list[0].name}»` : `${ask.list.length} elementos`}{dirs ? " (las carpetas con todo lo que tienen dentro)" : ""}? <b>No pasa por la papelera</b>: se borra para siempre.</div> : <>
          {ask.kind === "lock" && <div className="faint">Además de la clave de la bóveda, esta carpeta pedirá su propia contraseña para ver lo que tiene dentro.</div>}
          <input className="lock-input" autoFocus type={isPw ? "password" : "text"} autoComplete={isPw ? "new-password" : "off"} placeholder={isPw ? (ask.kind === "lock" ? "Contraseña (mínimo 4)" : "Contraseña") : "Nombre"} value={v}
            onFocus={e => { if (ask.kind === "rename") { const i = v.lastIndexOf("."); e.target.setSelectionRange(0, i > 0 && !ask.entry.dir ? i : v.length); } }}
            onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
          {ask.kind === "lock" && <input className="lock-input" type="password" autoComplete="new-password" placeholder="Repítela" value={v2} onChange={e => setV2(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />}
          {ask.kind === "lock" && v2 && v !== v2 && <div className="lock-err">No coinciden</div>}
          {nameErr && <div className="lock-err">{nameErr}</div>}</>}
      </div>
    </Modal>
  );
}
