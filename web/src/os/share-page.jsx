/* ============================================================
   Sotos OS — página pública de un elemento compartido
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, EmptyState } from "./ui.jsx";
import { SotosLogo } from "./logo.jsx";
import { NodeGlyph } from "./files-ui.jsx";
import { api } from "./api.js";
import { fmtSize, fmtDate } from "./vfs.js";
const { useState, useEffect } = React;

const blobUrl = (token, id, dl) => `/api/s/${token}/blob/${id}${dl ? "?dl=1" : ""}`;

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
  useEffect(() => { document.documentElement.setAttribute("data-theme", "light"); api("GET", "s/" + token).then(setData).catch(e => setErr(e)); }, [token]);
  if (err) return <div className="share-page"><Header /><div className="sp-card"><EmptyState icon={err.status === 401 ? "lock" : "link_off"} text={err.message} />
    {err.status === 401 && <a className="tb-btn primary" href="/">Iniciar sesión en Sotos</a>}</div></div>;
  if (!data) return <div className="share-page"><Header /><div className="sp-card"><EmptyState icon="hourglass_empty" text="Cargando…" /></div></div>;
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
            <div className="faint" style={{ fontSize: 13 }}>Compartido por <b>{data.owner}</b>{!isFolder && cur.size ? ` · ${fmtSize(cur.size)}` : ""}{data.expires ? ` · disponible hasta ${new Date(data.expires).toLocaleDateString("es-ES")}` : ""}</div>
          </div>
          {!isFolder && <a className="tb-btn primary" href={blobUrl(token, cur.id, true)} download={cur.name}><Ic name="download" /> Descargar</a>}
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
        ) : <div className="sp-preview"><Preview token={token} n={cur} /></div>}
      </div>
      <div className="sp-foot">Sotos OS · tu ordenador en la nube · © 2026 Sebastian Sotomontes</div>
    </div>
  );
}
function Header() {
  return <div className="sp-top"><a href="/" className="sp-brand"><SotosLogo size={26} badge={false} /> Sotos</a><div className="tb-spacer" /><a className="tb-btn" href="/">Abrir Sotos</a></div>;
}
