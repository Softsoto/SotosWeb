/* ============================================================
   Sotos OS — página pública de un elemento compartido
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, EmptyState } from "./ui.jsx";
import { SotosMark } from "./logo.jsx";
import { NodeGlyph } from "./files-ui.jsx";
import { api } from "./api.js";
import { fmtSize, fmtDate } from "./vfs.js";
const { useState, useEffect } = React;

// llave del enlace con contraseña (12 h, solo en esta pestaña)
const keyOf = (token) => { try { return sessionStorage.getItem("sotos_share_" + token) || ""; } catch { return ""; } };
const blobUrl = (token, id, dl) => { const k = keyOf(token), q = [dl ? "dl=1" : "", k ? "k=" + encodeURIComponent(k) : ""].filter(Boolean).join("&"); return `/api/s/${token}/blob/${id}${q ? "?" + q : ""}`; };
async function getShare(token) {
  const r = await fetch("/api/s/" + token, { headers: { "x-sotos": "1", "x-share-key": keyOf(token) } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw Object.assign(new Error(j?.error || "No disponible"), { status: j ? r.status : 502 }); // sin JSON: un proxy o el servidor reiniciándose
  return j;
}

function Preview({ token, n }) {
  const [text, setText] = useState(null);
  const [doc, setDoc] = useState(null);     // HTML de un .docx
  const [rows, setRows] = useState(null);   // tabla de un .xlsx/.csv
  useEffect(() => {
    const small = n.size < 15 * 1024 * 1024;
    if (n.type === "txt" || n.type === "code") { if (n.size < 512 * 1024) fetch(blobUrl(token, n.id, true)).then(r => r.text()).then(setText).catch(() => {}); return; }
    if (!small || !["docx", "xlsx", "csv"].includes(n.type)) return;
    (async () => {
      const blob = await fetch(blobUrl(token, n.id, true)).then(r => r.blob());
      const office = await import("./office.js");
      if (n.type === "docx") { setDoc(office.sanitizeHtml(await office.docxToHtml(blob))); return; }
      const book = n.type === "csv" ? office.csvToBook(await blob.text()) : await office.xlsxToBook(blob);
      const { makeEvaluator, display, parseRef, refName } = await import("./formula.js");
      const sh = book.sheets[0]; const ev = makeEvaluator(sh.cells);
      let mr = 0, mc = 0; Object.keys(sh.cells).forEach(k => { const p = parseRef(k); if (p) { mr = Math.max(mr, p.r); mc = Math.max(mc, p.c); } });
      const out = []; for (let r = 0; r <= Math.min(mr, 199); r++) { const row = []; for (let c = 0; c <= Math.min(mc, 29); c++) row.push(sh.cells[refName(c, r)] == null ? "" : display(ev.value(refName(c, r)))); out.push(row); }
      setRows({ name: sh.name, rows: out, bold: sh.fmt || {} });
    })().catch(() => {});
  }, [n.id]);
  const src = blobUrl(token, n.id);
  if (doc != null) return <div className="sp-doc" dangerouslySetInnerHTML={{ __html: doc }} />;
  if (rows) return (
    <div className="sp-sheet"><table><thead><tr><th></th>{rows.rows[0]?.map((_, c) => <th key={c}>{String.fromCharCode(65 + c)}</th>)}</tr></thead>
      <tbody>{rows.rows.map((r, i) => <tr key={i}><th>{i + 1}</th>{r.map((v, c) => <td key={c} style={{ fontWeight: rows.bold[String.fromCharCode(65 + c) + (i + 1)]?.b ? 700 : 400, textAlign: v !== "" && !isNaN(Number(v)) ? "right" : "left" }}>{v}</td>)}</tr>)}</tbody></table></div>
  );
  if (n.type === "img" && !/\.svg$/i.test(n.name)) return <img className="sp-media" src={src} alt={n.name} />;
  if (n.type === "pdf") return <iframe className="sp-frame" title={n.name} src={src} />;
  if (n.type === "audio") return <audio controls src={src} style={{ width: "100%", maxWidth: 520 }} />;
  if (n.type === "video") return <video className="sp-media" controls src={src} />;
  if (text != null) return <pre className="sp-text">{text}</pre>;
  return <div className="sp-icon"><NodeGlyph node={n} size={96} /></div>;
}

export function SharePage({ token }) {
  const [data, setData] = useState(null), [err, setErr] = useState(null);
  const [path, setPath] = useState([]);
  const load = () => getShare(token).then(d => { setErr(null); setData(d); }).catch(e => setErr(e));
  useEffect(() => { document.documentElement.setAttribute("data-theme", "light"); load(); }, [token]);
  // sin respuesta del servidor (se está reiniciando, o el enlace es de una red a la que no estás conectado): reintenta solo
  const offline = err && (!err.status || err.status >= 500);
  useEffect(() => { if (!offline) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [offline, token]);
  if (offline) return <div className="share-page"><Header /><div className="sp-card"><EmptyState icon="cloud_off" text="No se pudo conectar con el Sotos que compartió esto." />
    <div className="faint" style={{ fontSize: 13, textAlign: "center", maxWidth: 460, margin: "0 auto 12px" }}>Puede que se esté reiniciando (se reintenta solo cada pocos segundos), o que el enlace sea de una red privada, como el Wi-Fi de una casa, a la que no estás conectado.</div>
    <div style={{ textAlign: "center" }}><button className="tb-btn primary" onClick={load}><Ic name="refresh" /> Reintentar</button></div></div></div>;
  if (err?.status === 423) return <div className="share-page"><Header /><div className="sp-card"><Unlock token={token} onDone={load} /></div></div>;
  if (err) return <div className="share-page"><Header /><div className="sp-card"><EmptyState icon={err.status === 401 ? "lock" : "link_off"} text={err.message} />
    {err.status === 401 && <a className="tb-btn primary" href="/">Iniciar sesión en Sotos</a>}</div></div>;
  if (!data) return <div className="share-page"><Header /><div className="sp-card"><EmptyState icon="hourglass_empty" text="Cargando…" /></div></div>;
  if (data.perm === "upload") return <div className="share-page"><Header /><div className="sp-card"><UploadBox token={token} data={data} /></div><div className="sp-foot">Sotos OS · tu ordenador en la nube · © 2026 Sebastian Sotomontes</div></div>;
  let cur = data.node; for (const id of path) cur = cur.children.find(c => c.id === id) || cur;
  const isFolder = !!cur.children;
  return (
    <div className="share-page">
      <Header />
      <div className="sp-card">
        <div className="sp-head">
          <NodeGlyph node={cur} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sp-title">{cur.name}</div>
            <div className="faint" style={{ fontSize: 13 }}>Compartido por <b>{data.owner}</b>{!isFolder && cur.size ? ` · ${fmtSize(cur.size)}` : ""}{data.expires ? ` · disponible hasta ${new Date(data.expires).toLocaleDateString("es-ES")}` : ""}{data.limited ? ` · ${data.left} descarga(s) disponible(s)` : ""}</div>
          </div>
          {!isFolder && (data.limited && !data.left ? <span className="faint">Sin descargas disponibles</span> : <a className="tb-btn primary" href={blobUrl(token, cur.id, true)} download={cur.name} onClick={() => data.limited && setTimeout(load, 1500)}><Ic name="download" /> Descargar</a>)}
        </div>
        {path.length > 0 && <div className="breadcrumb" style={{ padding: "6px 0 10px" }}>
          <span className="crumb" style={{ cursor: "pointer" }} onClick={() => setPath([])}>{data.node.name}</span>
          {path.map((id, i) => { let n = data.node; for (const p of path.slice(0, i + 1)) n = n.children.find(c => c.id === p); return <React.Fragment key={id}><Ic name="chevron_right" size={16} className="sep" /><span className="crumb" style={{ cursor: "pointer" }} onClick={() => setPath(path.slice(0, i + 1))}>{n.name}</span></React.Fragment>; })}
        </div>}
        {isFolder ? (
          <div className="file-list">
            {cur.children.map(c => (
              <div key={c.id} className="file-row" style={{ gridTemplateColumns: "1fr 120px 90px 40px" }} onDoubleClick={() => c.children && setPath([...path, c.id])} onClick={() => c.children && setPath([...path, c.id])}>
                <span className="fl-name"><NodeGlyph node={c} size={20} /><div className="fname">{c.name}</div></span>
                <span>{fmtDate(c.mtime)}</span><span style={{ textAlign: "right" }}>{c.children ? `${c.children.length} el.` : fmtSize(c.size)}</span>
                <span>{!c.children && <a className="tb-btn icon" title="Descargar" href={blobUrl(token, c.id, true)} download={c.name} onClick={e => e.stopPropagation()}><Ic name="download" size={16} /></a>}</span>
              </div>
            ))}
            {!cur.children.length && <EmptyState icon="folder_open" text="Carpeta vacía" />}
          </div>
        ) : <div className="sp-preview">{data.limited ? <div className="sp-icon"><NodeGlyph node={cur} size={96} /><div className="faint" style={{ marginTop: 10, fontSize: 13 }}>Este enlace solo permite descargar el archivo.</div></div> : <Preview token={token} n={cur} />}</div>}
      </div>
      <div className="sp-foot">Sotos OS · tu ordenador en la nube · © 2026 Sebastian Sotomontes</div>
    </div>
  );
}
function Unlock({ token, onDone }) {
  const [pw, setPw] = useState(""), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await fetch(`/api/s/${token}/unlock`, { method: "POST", headers: { "x-sotos": "1", "content-type": "application/json" }, body: JSON.stringify({ password: pw }) }); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo abrir"); try { sessionStorage.setItem("sotos_share_" + token, j.key); } catch {} onDone(); }
    catch (e) { setErr(e.message); setBusy(false); } };
  return <form className="sp-lock" onSubmit={go}>
    <Ic name="lock" size={40} /><div className="sp-title">Este enlace tiene contraseña</div>
    <div className="faint" style={{ fontSize: 13 }}>Pídela a quien te lo compartió.</div>
    <input className="sc-input" type="password" autoFocus placeholder="Contraseña" value={pw} onChange={e => setPw(e.target.value)} />
    {err && <div className="login-err" style={{ color: "#b3412b" }}><Ic name="error" size={16} /> {err}</div>}
    <button className="tb-btn primary" disabled={!pw || busy}><Ic name="lock_open" /> Abrir</button>
  </form>;
}
/** pedir archivos: el visitante sube sin ver lo que hay en la carpeta */
function UploadBox({ token, data }) {
  const [by, setBy] = useState(() => { try { return localStorage.getItem("sotos_share_by") || ""; } catch { return ""; } });
  const [items, setItems] = useState([]), [hot, setHot] = useState(false); const inp = React.useRef(null);
  const upd = (i, p) => setItems(l => l.map((x, j) => j === i ? { ...x, ...p } : x));
  const send = (files) => {
    try { localStorage.setItem("sotos_share_by", by); } catch {}
    const start = items.length; setItems(l => [...l, ...files.map(f => ({ name: f.name, size: f.size, pct: 0, state: "wait" }))]);
    files.reduce((p, f, k) => p.then(() => new Promise(done => {
      const i = start + k; if (f.size > data.maxFile) { upd(i, { state: "error", msg: "demasiado grande" }); return done(); }
      const x = new XMLHttpRequest(); x.open("POST", `/api/s/${token}/upload?name=${encodeURIComponent(f.name)}&by=${encodeURIComponent(by)}${keyOf(token) ? "&k=" + encodeURIComponent(keyOf(token)) : ""}`);
      x.setRequestHeader("x-sotos", "1"); x.setRequestHeader("x-share-key", keyOf(token));
      x.upload.onprogress = (e) => e.lengthComputable && upd(i, { pct: Math.round(e.loaded / e.total * 100), state: "up" });
      x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} upd(i, x.status < 300 ? { pct: 100, state: "ok" } : { state: "error", msg: j.error || "error " + x.status }); done(); };
      x.onerror = () => { upd(i, { state: "error", msg: "sin conexión" }); done(); }; x.send(f);
    })), Promise.resolve());
  };
  return <div className="sp-up">
    <div className="sp-head"><Ic name="drive_folder_upload" size={40} style={{ color: "var(--accent)" }} /><div style={{ flex: 1 }}><div className="sp-title">Enviar archivos a {data.owner}</div>
      <div className="faint" style={{ fontSize: 13 }}>Llegarán a la carpeta «{data.node.name}». No verás lo que hay dentro.{data.expires ? ` Disponible hasta ${new Date(data.expires).toLocaleDateString("es-ES")}.` : ""}</div></div></div>
    <label className="field" style={{ maxWidth: 320 }}>Tu nombre (opcional)<input value={by} maxLength={60} onChange={e => setBy(e.target.value)} placeholder="Para que sepan quién lo envía" /></label>
    <div className={"sp-drop" + (hot ? " hot" : "")} onClick={() => inp.current.click()} onDragOver={e => { e.preventDefault(); setHot(true); }} onDragLeave={() => setHot(false)}
      onDrop={e => { e.preventDefault(); setHot(false); const f = [...e.dataTransfer.files]; if (f.length) send(f); }}>
      <Ic name="upload" size={30} /><b>Arrastra archivos aquí</b><span className="faint">o haz clic para elegirlos · hasta {fmtSize(data.maxFile)} cada uno</span></div>
    <input ref={inp} type="file" multiple style={{ display: "none" }} onChange={e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) send(f); }} />
    {!!items.length && <div className="sp-uplist">{items.map((it, i) => <div key={i} className="sp-uprow"><Ic name={it.state === "ok" ? "check_circle" : it.state === "error" ? "error" : "upload_file"} size={18} style={{ color: it.state === "ok" ? "#4f7a3a" : it.state === "error" ? "#b3412b" : undefined }} />
      <span className="fname" style={{ flex: 1 }}>{it.name}</span><span className="faint">{it.state === "error" ? it.msg : it.state === "ok" ? "Enviado" : it.pct + "%"}</span></div>)}</div>}
  </div>;
}
function Header() {
  return <div className="sp-top"><a href="/" className="sp-brand"><SotosMark size={24} color="var(--accent)" /> Sotos</a><div className="tb-spacer" /><a className="tb-btn" href="/">Abrir Sotos</a></div>;
}
