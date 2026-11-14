/* ============================================================
   Sotos OS — Música, Vídeo, PDF (sobre archivos reales)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, SideItem, Toolbar, EmptyState, ContextMenu, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { useVfs, fmtSize, fmtDate } from "./vfs.js";
import { NodeGlyph, dropTarget, useObjectUrl } from "./files-ui.jsx";
const { useState: useS2, useRef: useR2, useEffect: useE2 } = React;

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
// portadas con la paleta de identidad
const COLORS = ["#c4532f", "#4f7a3a", "#2f5d8a", "#c9902a", "#7a3e6b", "#1f7a78", "#8a5a3b", "#5a5689"];
const colorOf = (id) => COLORS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const fmtT = s => (!isFinite(s) ? "0:00" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
function trackInfo(n) {
  if (n.meta?.title) return { title: n.meta.title, artist: n.meta.artist || "Desconocido", album: n.meta.album || "" };
  const base = n.name.replace(/\.[^.]+$/, ""); const m = /^(.+?)\s+-\s+(.+)$/.exec(base);
  return m ? { title: m[2], artist: m[1], album: "" } : { title: base, artist: "Desconocido", album: "" };
}

/* -------------------- Música -------------------- */
function MusicApp({ fileId }) {
  useVfs(s => s.rev);
  const all = vfs.allOfType(["audio"]);
  const [view, setView] = useS2("all");
  const [favs, setFavs] = useS2(() => load("sotos_music_favs", []));
  const [recent, setRecent] = useS2(() => load("sotos_music_recent", []));
  const [lists, setLists] = useS2(() => load("sotos_music_lists", []));
  const [queue, setQueue] = useS2([]);
  const [curId, setCurId] = useS2(null);
  const [playing, setPlaying] = useS2(false);
  const [t, setT] = useS2(0), [dur, setDur] = useS2(0);
  const [vol, setVol] = useS2(() => load("sotos_music_vol", 0.9));
  const [shuffle, setShuffle] = useS2(false), [repeat, setRepeat] = useS2("off");
  const [ctx, setCtx] = useS2(null);
  const audio = useR2(null), up = useR2(null);
  useE2(() => store("sotos_music_favs", favs), [favs]);
  useE2(() => store("sotos_music_recent", recent), [recent]);
  useE2(() => store("sotos_music_lists", lists), [lists]);
  useE2(() => { store("sotos_music_vol", vol); if (audio.current) audio.current.volume = vol; }, [vol]);

  const cur = curId ? vfs.node(curId) : null;
  const src = useObjectUrl(cur?.id, cur?.mtime);
  const list = view === "all" ? all : view === "favs" ? favs.map(vfs.node).filter(Boolean) : view === "recent" ? recent.map(vfs.node).filter(Boolean)
    : (lists.find(l => l.id === view)?.ids || []).map(vfs.node).filter(Boolean);
  const viewName = view === "all" ? "Todas las canciones" : view === "favs" ? "Favoritas" : view === "recent" ? "Recientes" : lists.find(l => l.id === view)?.name || "Lista";

  const play = (id, fromList) => { setQueue((fromList || list).map(n => n.id)); setCurId(id); setT(0); setPlaying(true); setRecent(r => [id, ...r.filter(x => x !== id)].slice(0, 30)); };
  useE2(() => { if (fileId && vfs.node(fileId)) play(fileId, all); }, [fileId]);
  useE2(() => { const a = audio.current; if (!a || !src) return; if (playing) a.play().catch(() => setPlaying(false)); else a.pause(); }, [playing, src]);
  const next = (auto) => {
    if (!queue.length) return;
    if (auto && repeat === "one") { audio.current.currentTime = 0; audio.current.play(); return; }
    const i = queue.indexOf(curId);
    let j = shuffle ? Math.floor(Math.random() * queue.length) : i + 1;
    if (j >= queue.length) { if (auto && repeat === "off") { setPlaying(false); return; } j = 0; }
    play(queue[j], queue.map(vfs.node).filter(Boolean));
  };
  const prev = () => { if (audio.current && audio.current.currentTime > 3) { audio.current.currentTime = 0; return; } const i = queue.indexOf(curId); if (i > 0) play(queue[i - 1], queue.map(vfs.node).filter(Boolean)); };
  // controles del sistema (teclas multimedia, pantalla de bloqueo del móvil)
  useE2(() => {
    if (!("mediaSession" in navigator) || !cur) return;
    const info = trackInfo(cur);
    navigator.mediaSession.metadata = new MediaMetadata({ title: info.title, artist: info.artist, album: info.album });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  }, [curId, queue]);
  const toggleFav = (id) => setFavs(f => f.includes(id) ? f.filter(x => x !== id) : [id, ...f]);
  const musicFolder = vfs.resolve("/Música") || vfs.getState().root;
  const info = cur ? trackInfo(cur) : null;

  return (
    <div className="app" {...dropTarget(musicFolder.id)}>
      <audio ref={audio} src={src || undefined} preload="metadata"
        onTimeUpdate={e => setT(e.target.currentTime)} onLoadedMetadata={e => { setDur(e.target.duration); e.target.volume = vol; }}
        onEnded={() => next(true)} onError={() => { if (cur) { toast(`No se pudo reproducir “${cur.name}”`, { error: true }); setPlaying(false); } }} />
      <input ref={up} type="file" accept="audio/*" multiple style={{ display: "none" }}
        onChange={async e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) { await vfs.importFiles(musicFolder.id, f); toast(`${f.length} canción(es) añadida(s)`); } }} />
      <div className="app-side">
        <div className="side-group">
          <div className="side-label">Biblioteca</div>
          <SideItem icon="library_music" label={`Todas (${all.length})`} active={view === "all"} color="#fc3c44" onClick={() => setView("all")} />
          <SideItem icon="favorite" label={`Favoritas (${favs.filter(vfs.node).length})`} active={view === "favs"} color="#ff375f" onClick={() => setView("favs")} />
          <SideItem icon="schedule" label="Recientes" active={view === "recent"} color="#7d8590" onClick={() => setView("recent")} />
        </div>
        <div className="side-group">
          <div className="side-label">Listas</div>
          {lists.map(l => <SideItem key={l.id} icon="queue_music" label={l.name} active={view === l.id} color="#2f6fed" onClick={() => setView(l.id)} />)}
          <SideItem icon="playlist_add" label="Nueva lista" onClick={() => { const id = vfs.newId(); setLists(ls => [...ls, { id, name: "Lista " + (ls.length + 1), ids: [] }]); setView(id); }} />
        </div>
      </div>
      <div className="app-main">
        <div className="scroll" style={{ flex: 1 }}>
          <div style={{ padding: "22px 22px 8px", display: "flex", gap: 18, alignItems: "flex-end" }}>
            <div className="music-cover" style={{ background: cur ? colorOf(cur.id) : "var(--accent)" }}><Ic name={view === "favs" ? "favorite" : "music_note"} size={52} /></div>
            <div style={{ flex: 1 }}>
              <div className="faint" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>Lista</div>
              {lists.some(l => l.id === view)
                ? <input className="music-title-input" defaultValue={viewName} key={view} onBlur={e => { const v = e.target.value.trim(); if (v) setLists(ls => ls.map(l => l.id === view ? { ...l, name: v } : l)); }} />
                : <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>{viewName}</div>}
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{list.length} canciones</div>
            </div>
            <button className="tb-btn" onClick={() => up.current.click()}><Ic name="add" /> Añadir música</button>
            {lists.some(l => l.id === view) && <button className="tb-btn icon" title="Borrar lista" onClick={() => { setLists(ls => ls.filter(l => l.id !== view)); setView("all"); }}><Ic name="delete" /></button>}
            {!!list.length && <button className="tb-btn primary" onClick={() => play(list[0].id)}><Ic name="play_arrow" /> Reproducir</button>}
          </div>
          <div style={{ padding: "8px 14px 14px" }}>
            {list.map((tr, i) => { const ti = trackInfo(tr); const on = curId === tr.id; return (
              <div key={tr.id + i} className={"track-row" + (on ? " on" : "")} onDoubleClick={() => play(tr.id)}
                onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, id: tr.id }); }}>
                <div className="track-num" onClick={() => play(tr.id)}>{on && playing ? <Ic name="equalizer" size={18} /> : <span>{i + 1}</span>}<Ic name="play_arrow" size={18} className="hover-play" /></div>
                <div style={{ width: 34, height: 34, borderRadius: 7, background: colorOf(tr.id), flex: "0 0 34px" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="track-title">{ti.title}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{ti.artist}{ti.album ? " · " + ti.album : ""}{tr.online ? " · en línea" : ""}</div>
                </div>
                <Ic name="favorite" size={18} className={"fav" + (favs.includes(tr.id) ? " on" : "")} onClick={() => toggleFav(tr.id)} />
                <Ic name="more_horiz" size={18} className="faint" style={{ cursor: "pointer" }} onClick={e => setCtx({ x: e.clientX, y: e.clientY, id: tr.id })} />
              </div>); })}
            {!list.length && <EmptyState icon="music_off" text={view === "all" ? "Sin música · arrastra archivos de audio aquí" : "Esta lista está vacía"} />}
          </div>
        </div>
        <div className="music-bar">
          <div style={{ width: 44, height: 44, borderRadius: 8, background: cur ? colorOf(cur.id) : "var(--surface-3)", flex: "0 0 44px" }} />
          <div style={{ width: 160, minWidth: 0 }}>
            <div className="track-title">{info ? info.title : "Nada en reproducción"}</div>
            <div className="faint" style={{ fontSize: 12 }}>{info?.artist || "—"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button className={"tb-btn icon" + (shuffle ? " on" : "")} title="Aleatorio" onClick={() => setShuffle(s => !s)}><Ic name="shuffle" size={18} /></button>
            <button className="tb-btn icon" onClick={prev} disabled={!cur}><Ic name="skip_previous" /></button>
            <button className="tb-btn icon play-btn" disabled={!cur} onClick={() => setPlaying(!playing)}><Ic name={playing ? "pause" : "play_arrow"} size={22} /></button>
            <button className="tb-btn icon" onClick={() => next()} disabled={!cur}><Ic name="skip_next" /></button>
            <button className={"tb-btn icon" + (repeat !== "off" ? " on" : "")} title={"Repetir: " + repeat} onClick={() => setRepeat(r => r === "off" ? "all" : r === "all" ? "one" : "off")}><Ic name={repeat === "one" ? "repeat_one" : "repeat"} size={18} /></button>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9 }}>
            <span className="faint tnum" style={{ width: 34, textAlign: "right" }}>{fmtT(t)}</span>
            <input type="range" className="seek" min={0} max={dur || 0} step={0.1} value={Math.min(t, dur || 0)} onChange={e => { if (audio.current) audio.current.currentTime = +e.target.value; setT(+e.target.value); }} />
            <span className="faint tnum" style={{ width: 34 }}>{fmtT(dur)}</span>
          </div>
          <Ic name={vol === 0 ? "volume_off" : "volume_up"} size={18} className="faint" style={{ cursor: "pointer" }} onClick={() => setVol(v => v ? 0 : 0.9)} />
          <input type="range" className="seek" style={{ width: 80, flex: "0 0 80px" }} min={0} max={1} step={0.01} value={vol} onChange={e => setVol(+e.target.value)} />
        </div>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y}
        items={[{ id: "play", label: "Reproducir", icon: "play_arrow" }, { id: "fav", label: favs.includes(ctx.id) ? "Quitar de favoritas" : "Añadir a favoritas", icon: "favorite" },
          ...lists.map(l => ({ id: "add:" + l.id, label: "Añadir a " + l.name, icon: "playlist_add" })),
          ...(lists.some(l => l.id === view) ? [{ id: "rm", label: "Quitar de esta lista", icon: "playlist_remove" }] : []),
          { sep: true }, { id: "dl", label: "Descargar", icon: "download" }]}
        onSelect={(id) => {
          if (id === "play") play(ctx.id); else if (id === "fav") toggleFav(ctx.id); else if (id === "dl") vfs.download(ctx.id);
          else if (id === "rm") setLists(ls => ls.map(l => l.id === view ? { ...l, ids: l.ids.filter(x => x !== ctx.id) } : l));
          else if (id.startsWith("add:")) { const lid = id.slice(4); setLists(ls => ls.map(l => l.id === lid && !l.ids.includes(ctx.id) ? { ...l, ids: [...l.ids, ctx.id] } : l)); toast("Añadida a la lista"); }
        }} onClose={() => setCtx(null)} />}
    </div>
  );
}

/* -------------------- Vídeo -------------------- */
function VideoApp({ fileId }) {
  useVfs(s => s.rev);
  const vids = vfs.allOfType(["video"]);
  const [curId, setCurId] = useS2(fileId || null);
  useE2(() => { if (fileId) setCurId(fileId); }, [fileId]);
  const cur = curId ? vfs.node(curId) : vids[0];
  const src = useObjectUrl(cur?.id, cur?.mtime);
  const ref = useR2(null), up = useR2(null);
  const folder = vfs.resolve("/Vídeos") || vfs.getState().root;
  return (
    <div className="app" {...dropTarget(folder.id)}>
      <input ref={up} type="file" accept="video/*" multiple style={{ display: "none" }}
        onChange={async e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) { const ids = await vfs.importFiles(folder.id, f); setCurId(ids[0]); } }} />
      <div className="app-side" style={{ width: 220, flexBasis: 220 }}>
        <div style={{ display: "flex", alignItems: "center" }}><div className="side-label" style={{ flex: 1 }}>Vídeos</div>
          <button className="tb-btn icon" title="Añadir vídeo" onClick={() => up.current.click()}><Ic name="add" /></button></div>
        {vids.map(v => (
          <div key={v.id} onClick={() => setCurId(v.id)} className={"vid-row" + (cur?.id === v.id ? " on" : "")}>
            <div className="vid-thumb" style={{ background: colorOf(v.id) }}><Ic name="play_arrow" size={20} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="track-title" style={{ fontSize: 13 }}>{v.name.replace(/\.[^.]+$/, "")}</div>
              <div className="faint" style={{ fontSize: 11.5 }}>{v.online && !v.size ? "En línea" : fmtSize(v.size)}</div>
            </div>
          </div>
        ))}
        {!vids.length && <div className="faint" style={{ fontSize: 12, padding: 10 }}>Arrastra vídeos aquí</div>}
      </div>
      <div className="app-main" style={{ background: "#0a0c10" }}>
        {cur && src ? <video ref={ref} key={src} src={src} controls autoPlay style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          onError={() => toast(`Este navegador no puede reproducir “${cur.name}”`, { error: true })} />
          : <EmptyState icon="movie" text={cur ? "Cargando…" : "No hay vídeos"} />}
      </div>
    </div>
  );
}

/* -------------------- PDF -------------------- */
function PdfApp({ fileId, openItem }) {
  useVfs(s => s.rev);
  const n = fileId ? vfs.node(fileId) : null;
  const url = useObjectUrl(n?.id, n?.mtime);
  if (!fileId) {
    const pdfs = vfs.allOfType(["pdf"]);
    return (
      <div className="app" style={{ flexDirection: "column" }}>
        <Toolbar><span className="tb-title">Documentos PDF</span></Toolbar>
        <div className="scroll" style={{ flex: 1 }}><div className="file-list">
          {pdfs.map(p => <div key={p.id} className="file-row" style={{ gridTemplateColumns: "1fr 120px 90px" }} onClick={() => openItem(p)}>
            <span className="fl-name"><NodeGlyph node={p} size={20} /><div className="fname">{p.name}</div></span><span>{fmtDate(p.mtime)}</span><span style={{ textAlign: "right" }}>{fmtSize(p.size)}</span></div>)}
        </div>{!pdfs.length && <EmptyState icon="picture_as_pdf" text="No hay PDFs · súbelos desde Archivos" />}</div>
      </div>
    );
  }
  if (!n) return <EmptyState icon="error" text="El archivo ya no existe" />;
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar>
        <span className="office-badge pdf" style={{ marginRight: 2 }}>PDF</span>
        <span className="tb-title" style={{ fontSize: 13.5 }}>{n.name}</span>
        <span className="faint" style={{ fontSize: 12, marginLeft: 6 }}>{fmtSize(n.size)}</span>
        <div className="tb-spacer" />
        <button className="tb-btn" onClick={() => url && window.open(url, "_blank", "noopener")}><Ic name="open_in_new" /> Pestaña</button>
        <button className="tb-btn icon" title="Descargar" onClick={() => vfs.download(n.id)}><Ic name="download" /></button>
      </Toolbar>
      {url ? <iframe title={n.name} src={url} style={{ flex: 1, border: "none", background: "#525659" }} /> : <EmptyState icon="hourglass_empty" text="Abriendo…" />}
    </div>
  );
}

export { MusicApp, VideoApp, PdfApp };
