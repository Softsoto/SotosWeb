/* ============================================================
   Sotos OS — editores ONLYOFFICE (Word / Excel / PowerPoint completos)
   © 2026 Sebastian Sotomontes

   Se usan cuando hay cuenta en la nube y el servidor tiene ONLYOFFICE.
   El editor vive en un iframe del propio Document Server (otro origen).
   ============================================================ */
import React from "react";
import { Ic, EmptyState, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { useVfs } from "./vfs.js";
import { api } from "./api.js";
const { useState, useEffect, useRef } = React;

let statusP = null;
const ooStatus = () => statusP || (statusP = api("GET", "oo/status").catch(() => ({ enabled: false })));
const scriptPs = new Map();
function loadScript(src) {
  if (!scriptPs.has(src)) scriptPs.set(src, new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.async = true;
    s.onload = res; s.onerror = () => { scriptPs.delete(src); rej(new Error("No se pudo cargar ONLYOFFICE")); };
    document.head.appendChild(s);
  }));
  return scriptPs.get(src);
}

export function useOnlyOffice() {
  const mode = useVfs(s => s.mode);
  const [st, setSt] = useState(null);
  useEffect(() => { if (mode === "cloud") ooStatus().then(setSt); }, [mode]);
  return { ready: mode !== "cloud" || st !== null, enabled: mode === "cloud" && !!st?.enabled, url: st?.url };
}

let seq = 0;
export function OnlyOfficeEditor({ fileId, share, sharedNode, onFallback }) {
  const holder = useRef(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const nodeId = share ? sharedNode?.id : fileId;
  useEffect(() => {
    let editor = null, live = true; const domId = "oo-editor-" + (++seq);
    (async () => {
      try {
        if (!share) await vfs.flush(); // el servidor necesita la última versión antes de abrir
        const { config, url } = await api("POST", "oo/config", { nodeId, share });
        await loadScript(url + "/web-apps/apps/api/documents/api.js");
        if (!live || !holder.current) return;
        const div = document.createElement("div"); div.id = domId; holder.current.appendChild(div);
        editor = new window.DocsAPI.DocEditor(domId, {
          ...config, width: "100%", height: "100%", type: "desktop",
          events: {
            onAppReady: () => live && setLoading(false),
            onError: (e) => { console.error("[onlyoffice]", e); live && setErr(e?.data?.errorDescription || "Error del editor"); },
            onRequestClose: () => {},
          },
        });
      } catch (e) { if (live) { setErr(e.message); setLoading(false); } }
    })();
    return () => { live = false; try { editor?.destroyEditor(); } catch {} if (holder.current) holder.current.innerHTML = ""; };
  }, [nodeId, share]);
  if (err) return (
    <div className="app" style={{ flexDirection: "column" }}>
      <EmptyState icon="cloud_off" text={"ONLYOFFICE no está disponible: " + err} />
      {onFallback && !share && <div style={{ display: "flex", justifyContent: "center", paddingBottom: 40 }}><button className="tb-btn" onClick={onFallback}><Ic name="edit_document" /> Usar el editor sencillo</button></div>}
    </div>
  );
  return (
    <div className="app" style={{ position: "relative", background: "#fff" }}>
      <div ref={holder} style={{ position: "absolute", inset: 0 }} />
      {loading && <div className="oo-loading"><Ic name="progress_activity" size={28} /> Abriendo con ONLYOFFICE…</div>}
    </div>
  );
}

/** envuelve un editor propio: ONLYOFFICE si está disponible, si no el propio */
export function withOnlyOffice(Builtin) {
  return function OfficeApp(props) {
    const oo = useOnlyOffice();
    const [fallback, setFallback] = useState(false);
    if (!oo.ready) return <EmptyState icon="hourglass_empty" text="Abriendo…" />;
    const can = oo.enabled && !fallback && (props.share || (props.fileId && vfs.node(props.fileId)));
    if (can) return <OnlyOfficeEditor fileId={props.fileId} share={props.share} sharedNode={props.sharedNode} onFallback={() => setFallback(true)} />;
    if (props.share) return <EmptyState icon="cloud_off" text="Este documento compartido solo se puede abrir con ONLYOFFICE en el servidor" />;
    return <Builtin {...props} />;
  };
}
