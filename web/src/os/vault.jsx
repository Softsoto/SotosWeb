/* ============================================================
   Sotos — Bóveda secreta (se abre pulsando 5 veces seguidas el logo de Aplicaciones)
   Archivos cifrados con tu clave: ni el servidor ni un administrador pueden verlos.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { pickAsFiles } from "./filepicker.jsx";
import { Ic, EmptyState, Modal, toast } from "./ui.jsx";
import { api } from "./api.js";
import * as vfs from "./vfs.js";
import { fmtSize, fmtDate, useVfs } from "./vfs.js";
import { DRAG_MIME } from "./files-ui.jsx";
const { useState, useEffect, useRef } = React;

let token = null; // clave de la sesión abierta (solo en memoria: al recargar, la bóveda vuelve a cerrarse)
const vapi = (m, p, b) => fetch("/api/vault/" + p, { method: m, headers: { "x-sotos": "1", "content-type": "application/json", ...(token ? { "x-vault": token } : {}) }, body: b ? JSON.stringify(b) : undefined })
  .then(async r => { const j = await r.json().catch(() => ({})); if (r.status === 423) { token = null; throw Object.assign(new Error("La bóveda se cerró"), { locked: true }); } if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; });
const kind = (n) => /\.(png|jpe?g|gif|webp)$/i.test(n) ? "img" : /\.(mp4|webm)$/i.test(n) ? "video" : /\.(mp3|m4a|ogg|wav)$/i.test(n) ? "audio" : /\.pdf$/i.test(n) ? "pdf" : "file";
const ICON = { img: "image", video: "movie", audio: "music_note", pdf: "picture_as_pdf", file: "draft" };

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

export function VaultApp() {
  const mode = useVfs(s => s.mode);
  const [st, setSt] = useState(token ? "open" : "loading"), [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [busy, setBusy] = useState(false);
  const [items, setItems] = useState(null), [view, setView] = useState(null), [up, setUp] = useState(null), [q, setQ] = useState("");
  const [adminSees, setAdminSees] = useState(false); // regla del servidor elegida al instalar
  const input = useRef(null);
  const load = () => vapi("GET", "files").then(r => setItems(r.items)).catch(e => { if (e.locked) setSt("locked"); else toast(e.message, { error: true }); });
  useEffect(() => { if (mode !== "cloud") { setSt("guest"); return; } if (token) { setSt("open"); load(); api("GET", "vault").then(r => setAdminSees(!!r.adminCanSee)).catch(() => {}); return; } api("GET", "vault").then(r => { setAdminSees(!!r.adminCanSee); setSt(r.exists ? "locked" : "new"); }).catch(() => setSt("error")); }, [mode]);
  useEffect(() => () => { if (token) { vapi("POST", "lock").catch(() => {}); token = null; } }, []); // al cerrar la ventana, se cierra la bóveda
  const enter = async (path) => { setBusy(true); try { const r = await vapi("POST", path, { password: pw }); token = r.token; setPw(""); setPw2(""); setSt("open"); load(); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const upload = async (files) => {
    for (const f of files) {
      setUp({ name: f.name, pct: 0 });
      await new Promise((ok) => { const x = new XMLHttpRequest(); x.open("PUT", "/api/vault/files?name=" + encodeURIComponent(f.name)); x.setRequestHeader("x-sotos", "1"); x.setRequestHeader("x-vault", token);
        x.upload.onprogress = (e) => setUp({ name: f.name, pct: Math.round(e.loaded / e.total * 100) }); x.onload = () => { if (x.status >= 300) toast(JSON.parse(x.responseText || "{}").error || "No se pudo subir " + f.name, { error: true }); ok(); }; x.onerror = () => { toast("Sin conexión", { error: true }); ok(); }; x.send(f); });
    }
    setUp(null); load();
  };
  const [hot, setHot] = useState(false);
  const fromSotos = async (ids) => {
    const files = []; const walk = (n, prefix) => { if (!n) return; if (n.type === "folder") (n.children || []).forEach(c => walk(c, prefix + n.name + " - ")); else files.push({ n, name: prefix + n.name }); };
    ids.forEach(id => walk(vfs.node(id), ""));
    if (!files.length) return toast("Esa carpeta está vacía", { icon: "folder_off" });
    const list = []; for (const f of files) { try { list.push(new File([await vfs.read(f.n.id)], f.name)); } catch { toast("No se pudo leer «" + f.name + "»", { error: true }); } }
    await upload(list);
    toast(`${list.length} archivo(s) guardado(s) en la bóveda`, { icon: "enhanced_encryption", action: { label: "Quitar de Archivos", run: () => { vfs.trash(ids); toast("Originales enviados a la papelera", { icon: "delete" }); } } });
  };
  const onDrop = (e) => { e.preventDefault(); setHot(false); if (st !== "open") return toast("Abre la bóveda para guardar archivos", { icon: "lock" });
    const types = [...e.dataTransfer.types];
    if (types.includes(DRAG_MIME)) { let ids = []; try { ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME)); } catch {} if (ids.length) fromSotos(ids); }
    else if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]); };
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
  const list = (items || []).filter(x => x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className={"app vault" + (hot ? " hot" : "")} style={{ flexDirection: "column" }} onDragOver={onOver} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHot(false); }} onDrop={e => { e.stopPropagation(); onDrop(e); }}>
      <input ref={input} type="file" multiple style={{ display: "none" }} onChange={e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f); }} />
      <div className="vault-bar">
        <Ic name="lock_open" /><b>Bóveda</b><span className="faint">{items ? `${items.length} archivo(s) · ${fmtSize(items.reduce((s, x) => s + x.size, 0))}` : ""}</span>
        <div className="search-box" style={{ flex: 1, maxWidth: 280, marginLeft: "auto" }}><Ic name="search" size={16} /><input placeholder="Buscar" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className="tb-btn primary" onClick={async () => { const f = await pickAsFiles({ title: "Guardar en la bóveda", multiple: true }); if (f?.length) upload(f); }}><Ic name="upload" /> Subir</button>
        <button className="tb-btn" title="Cerrar la bóveda" onClick={async () => { await vapi("POST", "lock").catch(() => {}); token = null; setItems(null); setSt("locked"); }}><Ic name="lock" /> Cerrar</button>
      </div>
      {up && <div className="vault-up"><Ic name="upload" size={16} /> Cifrando y guardando «{up.name}»… {up.pct}%<div className="tr-bar"><i style={{ width: up.pct + "%" }} /></div></div>}
      <div className="scroll vault-grid">
        {items && !list.length && <EmptyState icon="enhanced_encryption" text={q ? "Sin resultados" : "Arrastra aquí lo que quieras guardar en secreto"} />}
        {list.map(it => { const k = kind(it.name); return (
          <div key={it.id} className="vault-item" onDoubleClick={() => setView(it)} onClick={() => setView(it)} title={it.name}>
            <div className="vault-thumb">{k === "img" ? <img src={url(it)} alt="" loading="lazy" /> : <Ic name={ICON[k]} size={36} />}</div>
            <div className="vault-name">{it.name}</div><div className="faint vault-meta">{fmtSize(it.size)} · {fmtDate(it.created)}</div>
          </div>); })}
      </div>
      {view && <Modal title={view.name} icon={ICON[kind(view.name)]} onClose={() => setView(null)} width={860}
        actions={<><button className="tb-btn danger" onClick={async () => { try { await vapi("DELETE", "files/" + view.id); setView(null); load(); toast("Eliminado de la bóveda", { icon: "delete" }); } catch (e) { toast(e.message, { error: true }); } }}><Ic name="delete" /> Eliminar</button>
          <div style={{ flex: 1 }} /><a className="tb-btn" href={url(view, true)} download={view.name}><Ic name="download" /> Descargar</a><button className="tb-btn" onClick={() => setView(null)}>Cerrar</button></>}>
        <div className="vault-view">{{ img: <img src={url(view)} alt="" />, video: <video src={url(view)} controls autoPlay />, audio: <audio src={url(view)} controls autoPlay />, pdf: <iframe title="pdf" src={url(view)} /> }[kind(view.name)]
          || <EmptyState icon="draft" text="No se puede previsualizar: descárgalo para abrirlo" />}</div>
      </Modal>}
    </div>
  );
}
