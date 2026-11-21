/* ============================================================
   Sotos — Contactos
   © 2026 Sebastian Sotomontes
   Agenda personal (servidor con cuenta, este navegador como invitado),
   importar/exportar vCard y añadir contactos con cuenta a un Mundo.
   ============================================================ */
import React from "react";
import { pickAsFiles } from "./filepicker.jsx";
import { Ic, EmptyState, Modal, toast, ContextMenu } from "./ui.jsx";
import { avatarUrl, avatarFor } from "./ui.jsx";
import { api, onServer } from "./api.js";
import { useVfs } from "./vfs.js";
import * as vfs from "./vfs.js";
import { PresenceDot } from "./presence.jsx";
const { useState, useEffect, useMemo, useRef } = React;

const COLORS = ["#c4532f", "#4f7a3a", "#2f5d8a", "#c9902a", "#7a3e6b", "#1f7a78", "#8a5a3b", "#5a5689"];
const initials = (n) => (n || "?").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
export function PersonAvatar({ name, avatar, size = 36 }) {
  // foto de la persona si la hay; si no, uno de los avatares por defecto (siempre el mismo para ese nombre)
  return <img className="person-avatar img" src={avatarUrl(avatar || avatarFor(name))} alt="" style={{ width: size, height: size }} />;
}

/* ---------------- almacén: servidor o local ---------------- */
const LOCAL = "sotos_contacts";
const localAll = () => { try { return JSON.parse(localStorage.getItem(LOCAL)) || []; } catch { return []; } };
const localSave = (l) => { try { localStorage.setItem(LOCAL, JSON.stringify(l)); } catch {} };
function makeStore(cloud) {
  if (cloud) return {
    list: () => api("GET", "contacts").then(r => r.items),
    create: (c) => api("POST", "contacts", c).then(r => r.item),
    update: (id, c) => api("PUT", "contacts/" + id, c).then(r => r.item),
    remove: (id) => api("DELETE", "contacts/" + id),
  };
  return {
    list: async () => localAll().sort((a, b) => a.name.localeCompare(b.name, "es")),
    create: async (c) => { const it = { ...c, id: vfs.newId(), color: COLORS[Math.floor(Math.random() * COLORS.length)], created: Date.now(), updated: Date.now(), sotos: null }; localSave([...localAll(), it]); return it; },
    update: async (id, c) => { let it; localSave(localAll().map(x => x.id === id ? (it = { ...x, ...c, updated: Date.now() }) : x)); return it; },
    remove: async (id) => localSave(localAll().filter(x => x.id !== id)),
  };
}

/* ---------------- vCard ---------------- */
const vEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
export function toVcf(list) {
  return list.map(c => ["BEGIN:VCARD", "VERSION:3.0", `FN:${vEsc(c.name)}`, `N:${vEsc(c.name)};;;;`, c.email && `EMAIL;TYPE=INTERNET:${c.email}`, c.phone && `TEL;TYPE=CELL:${vEsc(c.phone)}`,
    c.company && `ORG:${vEsc(c.company)}`, c.notes && `NOTE:${vEsc(c.notes)}`, "END:VCARD"].filter(Boolean).join("\r\n")).join("\r\n") + "\r\n";
}
export function fromVcf(text) {
  const out = []; let cur = null;
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/); // desplegar líneas continuadas
  const un = (v) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
  for (const line of lines) {
    const i = line.indexOf(":"); if (i < 0) continue;
    const key = line.slice(0, i).split(";")[0].toUpperCase().replace(/^ITEM\d+\./, ""), val = line.slice(i + 1);
    if (key === "BEGIN") cur = {};
    else if (key === "END" && cur) { if (!cur.name && cur.n) cur.name = cur.n; if (cur.name) out.push(cur); cur = null; }
    else if (!cur) continue;
    else if (key === "FN") cur.name = un(val);
    else if (key === "N") cur.n = un(val.split(";").slice(0, 2).reverse().join(" "));
    else if (key === "EMAIL" && !cur.email) cur.email = un(val).toLowerCase();
    else if (key === "TEL" && !cur.phone) cur.phone = un(val);
    else if (key === "ORG" && !cur.company) cur.company = un(val.split(";")[0]);
    else if (key === "NOTE") cur.notes = un(val);
  }
  return out.map(({ n, ...c }) => c);
}

/* ---------------- app ---------------- */
const empty = { name: "", email: "", phone: "", company: "", notes: "" };
export function ContactsApp({ contactId }) {
  const mode = useVfs(s => s.mode);
  const cloud = mode === "cloud";
  const store = useMemo(() => makeStore(cloud), [cloud]);
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(contactId || null);
  useEffect(() => { if (contactId) setSel(contactId); }, [contactId]);
  const [edit, setEdit] = useState(null);   // borrador (nuevo o edición)
  const [confirm, setConfirm] = useState(null);
  const [worldMenu, setWorldMenu] = useState(null);
  const imp = useRef(null);
  // grupos de contactos y bloqueos (solo con cuenta)
  const [cgroups, setCgroups] = useState([]), [group, setGroup] = useState(null), [blocks, setBlocks] = useState([]), [newGroup, setNewGroup] = useState(null);
  const loadGroups = () => cloud && api("GET", "contacts/groups").then(r => setCgroups(r.items)).catch(() => {});
  const loadBlocks = () => cloud && api("GET", "contacts/blocks").then(r => setBlocks(r.items)).catch(() => {});
  useEffect(() => { loadGroups(); loadBlocks(); }, [cloud]);
  const inGroup = (gid, cid) => !!cgroups.find(g => g.id === gid)?.members.includes(cid);
  const toggleGroup = async (g, cid) => { const members = g.members.includes(cid) ? g.members.filter(x => x !== cid) : [...g.members, cid]; try { await api("PUT", "contacts/groups/" + g.id, { members }); loadGroups(); } catch (e) { toast(e.message, { error: true }); } };
  const isBlockedC = (c) => !!c?.sotos && blocks.some(b => b.id === c.sotos.id);
  const toggleBlock = async (c) => {
    try {
      if (isBlockedC(c)) { await api("DELETE", "contacts/blocks/" + c.sotos.id); toast(`${c.name} desbloqueado`, { icon: "lock_open" }); }
      else { await api("POST", "contacts/blocks", { userId: c.sotos.id }); toast(`${c.name} bloqueado: no podrá enviarte archivos ni invitarte a mundos`, { icon: "block" }); }
      loadBlocks();
    } catch (e) { toast(e.message, { error: true }); }
  };
  const load = () => store.list().then(l => { setItems(l); return l; }).catch(e => { toast(e.message, { error: true }); setItems([]); });
  useEffect(() => { load(); }, [store]);
  useEffect(() => cloud ? onServer(["contacts"], () => load()) : undefined, [cloud, store]); // cambios desde el celular (CardDAV)
  const filtered = (items || []).filter(c => [c.name, c.email, c.phone, c.company].join(" ").toLowerCase().includes(q.toLowerCase()) && (!group || inGroup(group, c.id)));
  const groups = {}; filtered.forEach(c => { const k = (c.name[0] || "#").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); (groups[/[A-Z]/.test(k) ? k : "#"] ||= []).push(c); });
  const cur = items?.find(c => c.id === sel);

  const save = async () => {
    try {
      const it = edit.id ? await store.update(edit.id, edit) : await store.create(edit);
      await load(); setSel(it.id); setEdit(null); toast(edit.id ? "Contacto guardado" : "Contacto creado", { icon: "person" });
    } catch (e) { toast(e.message, { error: true }); }
  };
  const doImport = async (file) => {
    const list = fromVcf(await file.text());
    let n = 0; for (const c of list) { try { await store.create(c); n++; } catch {} }
    await load(); toast(`${n} contacto(s) importado(s)`, { icon: "contacts" });
  };
  const doExport = async () => {
    const folder = vfs.resolve("/Documentos") || vfs.getState().root;
    await vfs.create(folder.id, "Contactos.vcf", new Blob([toVcf(items)], { type: "text/vcard" }));
    toast(`Contactos exportados a ${folder.name}/Contactos.vcf`, { icon: "download_done", action: { label: "Descargar", run: () => vfs.download(vfs.resolve("/Documentos/Contactos.vcf")?.id) } });
  };
  const addToWorld = async (e) => {
    try { const r = await api("GET", "worlds"); setWorldMenu({ x: e.clientX, y: e.clientY, worlds: r.items }); } catch (err) { toast(err.message, { error: true }); }
  };

  return (
    <div className="app contacts-app">
      <input ref={imp} type="file" accept=".vcf,text/vcard" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) doImport(f); }} />
      <div className="app-side contacts-side">
        <div className="contacts-tools">
          <div className="search-box" style={{ flex: 1, minWidth: 0 }}><Ic name="search" size={16} /><input placeholder="Buscar" value={q} onChange={e => setQ(e.target.value)} /></div>
          <button className="tb-btn icon primary" title="Nuevo contacto" onClick={() => { setEdit({ ...empty }); setSel(null); }}><Ic name="person_add" /></button>
        </div>
        {cloud && <div className="contact-groups">
          <button className={"chip" + (!group ? " on" : "")} onClick={() => setGroup(null)}>Todos</button>
          {cgroups.map(g => <button key={g.id} className={"chip" + (group === g.id ? " on" : "")} style={{ "--chip": g.color }} title="Clic derecho para eliminar el grupo"
            onClick={() => setGroup(group === g.id ? null : g.id)} onContextMenu={e => { e.preventDefault(); setConfirm({ group: g, name: g.name }); }}>
            {g.name} <span className="faint">{g.members.length}</span></button>)}
          <button className="chip" title="Nuevo grupo" onClick={() => setNewGroup("")}><Ic name="add" size={14} /> Grupo</button>
        </div>}
        <div className="scroll" style={{ flex: 1 }}>
          {items == null ? <div className="faint" style={{ padding: 12, fontSize: 12.5 }}>Cargando…</div> :
            Object.keys(groups).sort().map(k => (
              <div key={k}><div className="contacts-letter">{k}</div>
                {groups[k].map(c => (
                  <div key={c.id} className={"contact-row" + (sel === c.id ? " on" : "")} onClick={() => { setSel(c.id); setEdit(null); }}>
                    <PersonAvatar name={c.name} color={c.color} size={30} />
                    <span className="contact-name">{c.name}{c.sotos && <Ic name="verified" size={14} className="contact-sotos" />}</span>
                    {c.sotos && cloud && <PresenceDot userId={c.sotos.id} size={8} />}
                  </div>))}
              </div>))}
          {items && !items.length && <div className="faint" style={{ padding: 14, fontSize: 12.5, lineHeight: 1.5 }}>Aún no tienes contactos. Crea uno o importa un archivo <b>.vcf</b> del celular, Gmail u Outlook.</div>}
        </div>
        <div className="contacts-foot">
          <button className="tb-btn" onClick={async () => { const f = await pickAsFiles({ title: "Importar contactos (.vcf)", exts: ["vcf"] }); if (f?.[0]) doImport(f[0]); }}><Ic name="upload" size={16} /> Importar .vcf</button>
          <button className="tb-btn" disabled={!items?.length} onClick={doExport}><Ic name="download" size={16} /> Exportar</button>
        </div>
      </div>
      <div className="app-main contacts-main">
        {edit ? (
          <div className="contact-card">
            <PersonAvatar name={edit.name || "?"} size={72} />
            <div className="contact-form">
              {[["name", "Nombre", "person"], ["email", "Correo", "mail"], ["phone", "Teléfono", "call"], ["company", "Empresa", "apartment"]].map(([k, l, i]) => (
                <label key={k} className="field"><span><Ic name={i} size={15} /> {l}</span><input value={edit[k] || ""} autoFocus={k === "name"} onChange={e => setEdit({ ...edit, [k]: e.target.value })} onKeyDown={e => e.key === "Enter" && save()} /></label>))}
              <label className="field"><span><Ic name="notes" size={15} /> Notas</span><textarea rows={4} value={edit.notes || ""} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></label>
              <div className="wl-btns" style={{ justifyContent: "flex-start" }}>
                <button className="tb-btn primary" onClick={save} disabled={!edit.name?.trim()}><Ic name="check" /> Guardar</button>
                <button className="tb-btn" onClick={() => setEdit(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        ) : cur ? (
          <div className="contact-card">
            <PersonAvatar name={cur.name} color={cur.color} size={84} />
            <div className="contact-big">{cur.name}</div>
            {cur.company && <div className="muted">{cur.company}</div>}
            {cur.sotos && <div className="contact-badge">{cloud ? <PresenceDot userId={cur.sotos.id} size={9} /> : <Ic name="verified" size={15} />} Tiene cuenta en Sotos{cur.sotos.name !== cur.name ? ` como ${cur.sotos.name}` : ""}{isBlockedC(cur) ? " · bloqueado" : ""}</div>}
            {cloud && cgroups.length > 0 && <div className="contact-groups center">{cgroups.map(g => (
              <button key={g.id} className={"chip" + (inGroup(g.id, cur.id) ? " on" : "")} style={{ "--chip": g.color }} onClick={() => toggleGroup(g, cur.id)}>
                <Ic name={inGroup(g.id, cur.id) ? "check" : "add"} size={14} /> {g.name}</button>))}</div>}
            <div className="contact-fields">
              {cur.email && <div className="contact-field"><Ic name="mail" /><a href={`mailto:${cur.email}`}>{cur.email}</a><button className="tb-btn icon" title="Copiar" onClick={() => navigator.clipboard?.writeText(cur.email).then(() => toast("Correo copiado"))}><Ic name="content_copy" size={16} /></button></div>}
              {cur.phone && <div className="contact-field"><Ic name="call" /><a href={`tel:${cur.phone.replace(/\s/g, "")}`}>{cur.phone}</a><button className="tb-btn icon" title="Copiar" onClick={() => navigator.clipboard?.writeText(cur.phone).then(() => toast("Teléfono copiado"))}><Ic name="content_copy" size={16} /></button></div>}
              {cur.notes && <div className="contact-field notes"><Ic name="notes" /><span>{cur.notes}</span></div>}
            </div>
            <div className="wl-btns">
              {cur.email && <a className="tb-btn" href={`mailto:${cur.email}`}><Ic name="send" /> Enviar correo</a>}
              {cloud && cur.sotos && <button className="tb-btn" onClick={addToWorld}><Ic name="diversity_3" /> Añadir a un mundo</button>}
              <button className="tb-btn" onClick={() => setEdit({ ...cur })}><Ic name="edit" /> Editar</button>
              {cloud && cur.sotos && <button className="tb-btn" onClick={() => toggleBlock(cur)}><Ic name={isBlockedC(cur) ? "lock_open" : "block"} /> {isBlockedC(cur) ? "Desbloquear" : "Bloquear"}</button>}
              <button className="tb-btn icon" title="Eliminar" onClick={() => setConfirm(cur)}><Ic name="delete" /></button>
            </div>
            {!cloud && <div className="faint" style={{ fontSize: 12, marginTop: 14 }}>Como invitado, tus contactos se guardan solo en este navegador.</div>}
          </div>
        ) : <EmptyState icon="contacts" text={items?.length ? "Elige un contacto" : "Tu agenda está vacía"} />}
      </div>
      {newGroup !== null && <Modal title="Nuevo grupo" icon="group_add" onClose={() => setNewGroup(null)} width={380}
        actions={<><button className="tb-btn" onClick={() => setNewGroup(null)}>Cancelar</button>
          <button className="tb-btn primary" disabled={!newGroup.trim()} onClick={async () => { try { const r = await api("POST", "contacts/groups", { name: newGroup, color: COLORS[cgroups.length % COLORS.length] }); setNewGroup(null); await loadGroups(); setGroup(r.item.id); } catch (e) { toast(e.message, { error: true }); } }}>Crear</button></>}>
        <label className="field">Nombre<input autoFocus maxLength={60} placeholder="Familia, Trabajo, Clientes…" value={newGroup} onChange={e => setNewGroup(e.target.value)} /></label>
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Después abre un contacto y márcalo en el grupo. Clic derecho sobre un grupo para eliminarlo.</div></Modal>}
      {confirm?.group && <Modal title={`¿Eliminar el grupo ${confirm.name}?`} icon="group_remove" onClose={() => setConfirm(null)}
        actions={<><button className="tb-btn" onClick={() => setConfirm(null)}>Cancelar</button><button className="tb-btn danger" onClick={async () => { await api("DELETE", "contacts/groups/" + confirm.group.id); setConfirm(null); setGroup(null); loadGroups(); }}>Eliminar grupo</button></>}>
        <div className="muted" style={{ fontSize: 13.5 }}>Los contactos no se borran, solo el grupo.</div></Modal>}
      {confirm && !confirm.group && <Modal title={`¿Eliminar a ${confirm.name}?`} icon="person_remove" onClose={() => setConfirm(null)}
        actions={<><button className="tb-btn" onClick={() => setConfirm(null)}>Cancelar</button><button className="tb-btn danger" onClick={async () => { await store.remove(confirm.id); setConfirm(null); setSel(null); load(); }}>Eliminar</button></>}>
        <div className="muted" style={{ fontSize: 13.5 }}>Se borrará de tu agenda. No se puede deshacer.</div></Modal>}
      {worldMenu && <ContextMenu x={worldMenu.x} y={worldMenu.y}
        items={worldMenu.worlds.length ? worldMenu.worlds.map(w => ({ id: w.id, label: w.name, icon: w.icon })) : [{ id: "none", label: "No tienes mundos todavía", icon: "info" }]}
        onSelect={async (wid) => { if (wid === "none") return; try { await api("POST", `worlds/${wid}/members`, { email: cur.email }); toast(`${cur.name} se añadió al mundo`, { icon: "diversity_3" }); } catch (e) { toast(e.message, { error: true }); } }}
        onClose={() => setWorldMenu(null)} />}
    </div>
  );
}
