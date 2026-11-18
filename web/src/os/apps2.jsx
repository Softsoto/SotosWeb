/* ============================================================
   Sotos OS — Música, Vídeo, PDF (sobre archivos reales)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, SideItem, Toolbar, EmptyState, ContextMenu, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { api } from "./api.js";
import { showMenu } from "./context-menu.jsx";
import { useVfs, fmtSize, fmtDate } from "./vfs.js";
import { NodeGlyph, dropTarget, useObjectUrl } from "./files-ui.jsx";
import { PdfViewer } from "./pdf-viewer.jsx";
import { useTrackInfo } from "./id3.js";
import { useVideoThumb } from "./video-thumb.js";
import { movieCredit } from "./open-movies.js";
import { coverOf } from "./cover-art.js";
function VidThumb({ v }) {
  const t = useVideoThumb(v);
  return <div className="vid-thumb" style={{ background: t ? `center / cover no-repeat url("${t}")` : colorOf(v.id) }}><Ic name="play_arrow" size={20} /></div>;
}
const { useState: useS2, useRef: useR2, useEffect: useE2 } = React;

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
// portadas con la paleta de identidad
const COLORS = ["#c4532f", "#4f7a3a", "#2f5d8a", "#c9902a", "#7a3e6b", "#1f7a78", "#8a5a3b", "#5a5689"];
const colorOf = (id) => COLORS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const fmtT = s => (!isFinite(s) ? "0:00" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
// carátula: imagen de la etiqueta ID3 o un cuadro del color de la pista
// portada: la de la etiqueta del archivo; si no trae, una dibujada para su álbum (misma portada para el mismo álbum)

function Cover({ info, id, size, radius = 7, icon }) {
  const src = coverOf(info);
  return src
    ? <img className="track-cover" src={src} alt="" style={{ width: size, height: size, borderRadius: radius, flex: `0 0 ${size}px` }} />
    : <div className="track-cover" style={{ width: size, height: size, borderRadius: radius, background: id ? colorOf(id) : "var(--surface-3)", flex: `0 0 ${size}px` }}>{icon && <Ic name={icon} size={size * 0.45} />}</div>;
}
function TrackRow({ tr, i, on, playing, fav, onPlay, onFav, onMenu }) {
  const ti = useTrackInfo(tr); // solo lee archivos ya presentes en este navegador
  return (
    <div className={"track-row" + (on ? " on" : "")} onDoubleClick={onPlay} onContextMenu={e => { e.preventDefault(); onMenu(e); }}>
      <div className="track-num" onClick={onPlay}>{on && playing ? <Ic name="equalizer" size={18} /> : <span>{i + 1}</span>}<Ic name="play_arrow" size={18} className="hover-play" /></div>
      <Cover info={ti} id={tr.id} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="track-title">{ti.title}</div>
        <div className="faint" style={{ fontSize: 12 }}>{ti.artist}{ti.album ? " · " + ti.album : ""}{ti.year ? " · " + ti.year : ""}{tr.online ? " · en línea" : ""}</div>
      </div>
      <Ic name="favorite" size={18} className={"fav" + (fav ? " on" : "")} onClick={onFav} />
      <Ic name="more_horiz" size={18} className="faint" style={{ cursor: "pointer" }} onClick={onMenu} />
    </div>
  );
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
  const info = useTrackInfo(cur, true); // la que suena: se lee aunque haya que descargarla
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
    navigator.mediaSession.metadata = new MediaMetadata({ title: info.title, artist: info.artist, album: info.album, artwork: coverOf(info) ? [{ src: coverOf(info), sizes: "300x300" }] : [] });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  }, [curId, queue, info]);
  const toggleFav = (id) => setFavs(f => f.includes(id) ? f.filter(x => x !== id) : [id, ...f]);
  const musicFolder = vfs.resolve("/Música") || vfs.getState().root;


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
            <Cover info={cur ? info : null} id={cur?.id} size={120} radius={14} icon={view === "favs" ? "favorite" : "music_note"} />
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
            {list.map((tr, i) => <TrackRow key={tr.id + i} tr={tr} i={i} on={curId === tr.id} playing={playing} fav={favs.includes(tr.id)}
              onPlay={() => play(tr.id)} onFav={() => toggleFav(tr.id)} onMenu={e => setCtx({ x: e.clientX, y: e.clientY, id: tr.id })} />)}
            {!list.length && <EmptyState icon="music_off" text={view === "all" ? "Sin música · arrastra archivos de audio aquí" : "Esta lista está vacía"} />}
          </div>
        </div>
        <div className="music-bar">
          <Cover info={cur ? info : null} id={cur?.id} size={44} radius={8} />
          <div style={{ width: 160, minWidth: 0 }}>
            <div className="track-title">{cur ? info.title : "Nada en reproducción"}</div>
            <div className="faint" style={{ fontSize: 12 }}>{cur ? info.artist : "—"}</div>
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
/* reproducción preparada por el servidor (ffmpeg): audio que el navegador no entiende (AC3, DTS…) y subtítulos incrustados */
const LANGS = { spa: "Español", es: "Español", eng: "Inglés", en: "Inglés", por: "Portugués", fra: "Francés", fre: "Francés", ita: "Italiano", deu: "Alemán", ger: "Alemán", jpn: "Japonés", kor: "Coreano", chi: "Chino", zho: "Chino", rus: "Ruso", lat: "Latino" };
const trackName = (x, i, kind) => [x.title, x.lang ? (LANGS[x.lang] || x.lang) : null].filter(Boolean).join(" · ") || `${kind} ${i + 1}`;
const hms = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
/** subtítulos externos: archivos .srt o .vtt de la misma carpeta cuyo nombre empieza igual que el video */
function useExternalSubs(node) {
  const [subs, setSubs] = useS2([]);
  useE2(() => {
    let alive = true, urls = []; setSubs([]); if (!node) return;
    const base = node.name.replace(/\.[^.]+$/, "").toLowerCase(); const parent = vfs.parentOf(node.id);
    const files = (parent?.children || []).filter(x => /\.(srt|vtt)$/i.test(x.name) && x.name.toLowerCase().startsWith(base));
    Promise.all(files.map(async f => { let t = await vfs.readText(f.id); if (/\.srt$/i.test(f.name)) t = "WEBVTT\n\n" + t.replace(/\r/g, "").replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2");
      const url = URL.createObjectURL(new Blob([t], { type: "text/vtt" })); urls.push(url); const tag = f.name.slice(base.length).replace(/\.(srt|vtt)$/i, "").replace(/^[._ -]+/, "");
      return { url, label: tag || "Externo", lang: /^(es|spa)/i.test(tag) ? "es" : /^(en|eng)/i.test(tag) ? "en" : "es" }; }))
      .then(x => alive && setSubs(x)).catch(() => {});
    return () => { alive = false; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [node?.id]);
  return subs;
}
/** menú contextual del reproductor (clic derecho sobre el video) */
function videoMenu(e, v, { audio, setAudio, info, sub, setSub, ext, node }) {
  e.preventDefault(); e.stopPropagation(); if (!v) return;
  const items = [{ label: v.paused ? "Reproducir" : "Pausar", icon: v.paused ? "play_arrow" : "pause", run: () => v.paused ? v.play() : v.pause() },
    { label: v.muted ? "Activar sonido" : "Silenciar", icon: v.muted ? "volume_up" : "volume_off", run: () => { v.muted = !v.muted; } },
    { label: "Pantalla completa", icon: "fullscreen", run: () => (v.parentElement || v).requestFullscreen?.() },
    { label: "Imagen en imagen", icon: "picture_in_picture_alt", run: () => v.requestPictureInPicture?.().catch(() => {}) }];
  if (info?.audio?.length > 1) { items.push({ sep: true }); info.audio.forEach((x, i) => items.push({ label: (i === audio ? "✓ " : "   ") + "Audio: " + trackName(x, i, "Audio"), icon: "graphic_eq", run: () => setAudio(i) })); }
  const all = [...(info?.subs || []).map((x, i) => ({ id: "s" + i, label: trackName(x, i, "Subtítulos") + (x.forced ? " (forzados)" : ""), ok: x.text })), ...ext.map((x, i) => ({ id: "e" + i, label: x.label + " (archivo)", ok: true }))];
  if (all.length) { items.push({ sep: true }, { label: (sub === "" ? "✓ " : "   ") + "Sin subtítulos", icon: "subtitles_off", run: () => setSub("") });
    all.filter(x => x.ok).forEach(x => items.push({ label: (sub === x.id ? "✓ " : "   ") + "Subtítulos: " + x.label, icon: "subtitles", run: () => setSub(x.id) })); }
  items.push({ sep: true }, { label: "Descargar el video", icon: "download", run: () => vfs.download(node.id) });
  showMenu(e.clientX, e.clientY, items);
}

function ServerVideo({ node, info }) {
  const ext = useExternalSubs(node);
  const pick = (list) => Math.max(0, list.findIndex(x => /^(spa|es)$/.test(x.lang || "")));
  const [audio, setAudio] = useS2(() => info.audio.length ? pick(info.audio) : 0);
  // primero los subtítulos completos en español (los "forzados" solo traducen carteles)
  const [sub, setSub] = useS2(() => { const sp = info.subs.map((x, i) => ({ x, i })).filter(({ x }) => x.text && /^(spa|es)$/.test(x.lang || ""));
    const full = sp.find(({ x }) => !x.forced) || sp[0]; return full ? "s" + full.i : ""; });
  useE2(() => { if (sub === "" && ext.length && !info.subs.some(x => x.text)) setSub("e0"); }, [ext.length]);
  const [prep, setPrep] = useS2({ ready: false, progress: 0 }), [retry, setRetry] = useS2(0);
  const v = useR2(null), resumeAt = useR2(0);
  // el servidor prepara el video una vez (copia la imagen, convierte el audio); luego es un archivo normal
  useE2(() => { let stop = false, t; setPrep({ ready: false, progress: 0 });
    const poll = async (first) => { try { const r = await api(first ? "POST" : "GET", `media/${node.id}/prepare?a=${audio}`); if (stop) return; setPrep(r); if (!r.ready && !r.error) t = setTimeout(() => poll(false), 1200); }
      catch (e) { if (!stop) setPrep({ ready: false, progress: 0, error: e.message }); } };
    poll(true); return () => { stop = true; clearTimeout(t); }; }, [node.id, node.mtime, audio, retry]);
  const changeAudio = (i) => { resumeAt.current = v.current?.currentTime || 0; setAudio(i); };
  const src = prep.ready ? `/api/media/${node.id}/file?a=${audio}&v=${node.mtime || 0}` : null;
  const menu = (e) => videoMenu(e, v.current, { audio, setAudio: changeAudio, info, sub, setSub, ext, node });
  if (!src) return (
    <div className="sv-wrap sv-prep">
      {prep.error ? <><Ic name="error" size={34} /><div>{prep.error}</div><button className="tb-btn" onClick={() => setRetry(r => r + 1)}>Reintentar</button></>
        : <><Ic name="movie" size={34} /><div><b>Preparando el video para el navegador…</b></div>
          <div className="sv-prep-bar"><i style={{ width: Math.max(2, prep.progress) + "%" }} /></div>
          <div className="faint">{prep.progress}% · solo la primera vez: se copia la imagen tal cual y el audio se convierte para que suene en cualquier navegador</div></>}
    </div>
  );
  return (
    <div className="sv-wrap" onContextMenu={menu}>
      <video ref={v} key={src} src={src} controls autoPlay className="sv-video" crossOrigin="anonymous"
        onLoadedMetadata={e => { if (resumeAt.current) { e.currentTarget.currentTime = resumeAt.current; resumeAt.current = 0; } }}
        onError={() => toast(`No se pudo reproducir “${node.name}”`, { error: true })}>
        {sub.startsWith("s") && <track key={sub} kind="subtitles" default src={`/api/media/${node.id}/subs/${sub.slice(1)}?v=${node.mtime || 0}`} srcLang={info.subs[+sub.slice(1)]?.lang || "es"} label={trackName(info.subs[+sub.slice(1)], +sub.slice(1), "Subtítulos")} />}
        {sub.startsWith("e") && ext[+sub.slice(1)] && <track key={sub} kind="subtitles" default src={ext[+sub.slice(1)].url} srcLang={ext[+sub.slice(1)].lang} label={ext[+sub.slice(1)].label} />}
      </video>
      {(info.audio.length > 1 || info.subs.length > 0 || ext.length > 0) && <div className="sv-bar">
        {info.audio.length > 1 && <select className="sv-sel" title="Pista de audio" value={audio} onChange={e => changeAudio(Number(e.target.value))}>
          {info.audio.map((x, i) => <option key={i} value={i}>🔊 {trackName(x, i, "Audio")}{x.channels > 2 ? ` (${x.channels} canales)` : ""}</option>)}</select>}
        {(info.subs.length > 0 || ext.length > 0) && <select className="sv-sel" title="Subtítulos" value={sub} onChange={e => setSub(e.target.value)}>
          <option value="">Sin subtítulos</option>
          {info.subs.map((x, i) => <option key={"s" + i} value={"s" + i} disabled={!x.text}>💬 {trackName(x, i, "Subtítulos")}{x.forced ? " (forzados)" : ""}{x.text ? "" : " — imagen, no disponible"}</option>)}
          {ext.map((x, i) => <option key={"e" + i} value={"e" + i}>💬 {x.label} (archivo)</option>)}</select>}
        <span className="faint" style={{ fontSize: 11.5 }}>Clic derecho sobre el video: más opciones</span>
      </div>}
    </div>
  );
}
const viaServerOf = (info) => !!(info && info.ffmpeg && !info.native && info.video);
function VideoApp({ fileId }) {
  useVfs(s => s.rev);
  const vids = vfs.allOfType(["video"]);
  const [curId, setCurId] = useS2(fileId || null);
  useE2(() => { if (fileId) setCurId(fileId); }, [fileId]);
  const cur = curId ? vfs.node(curId) : vids[0];
  // ¿necesita que el servidor lo prepare? (MKV, AVI, audio AC3/DTS, subtítulos incrustados…)
  const mode = useVfs(s => s.mode);
  const [info, setInfo] = useS2(null), [retry, setRetry] = useS2(0);
  useE2(() => { setInfo(null); if (!cur || mode !== "cloud" || !(cur.size > 0)) { setInfo({ native: true }); return; }
    api("GET", `media/${cur.id}/info`).then(i => setInfo(i.ffmpeg ? i : { native: true, noFfmpeg: true }))
      .catch(e => setInfo({ native: true, failed: e.status === 404 ? "El video aún se está subiendo: cuando termine tendrá audio y subtítulos." : "No se pudo preparar el video (" + (e.message || "sin conexión") + ")." })); }, [cur?.id, cur?.mtime, mode, retry]);
  const ext = useExternalSubs(info && !viaServerOf(info) ? cur : null);
  const needsServer = cur && /\.(mkv|avi|wmv|flv|ts|m2ts)$/i.test(cur.name);
  const viaServer = viaServerOf(info);
  const src = useObjectUrl(info && !viaServer ? cur?.id : null, cur?.mtime);
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
            <VidThumb v={v} />
            <div style={{ minWidth: 0 }}>
              <div className="track-title" style={{ fontSize: 13 }}>{v.name.replace(/\.[^.]+$/, "")}</div>
              <div className="faint" style={{ fontSize: 11.5 }}>{v.online && !v.size ? (v.meta?.credit || movieCredit(v.url) || "En línea") : fmtSize(v.size)}</div>
            </div>
          </div>
        ))}
        {!vids.length && <div className="faint" style={{ fontSize: 12, padding: 10 }}>Arrastra vídeos aquí</div>}
      </div>
      <div className="app-main" style={{ background: "#0a0c10" }}>
        {cur && viaServer ? <ServerVideo key={cur.id + ":" + cur.mtime} node={cur} info={info} />
          : cur && src ? <div className="sv-wrap">
          {needsServer && (mode !== "cloud" || info?.failed || info?.noFfmpeg) && <div className="sv-note"><Ic name="info" size={16} /> {mode !== "cloud" ? "Este video está solo en tu navegador: el navegador no reproduce su audio (AC3/DTS) ni sus subtítulos incrustados. Ábrelo con tu cuenta de Sotos para que el servidor lo prepare." : info?.noFfmpeg ? "Este servidor no tiene ffmpeg: el audio AC3/DTS y los subtítulos incrustados no se pueden preparar." : info.failed}
            {info?.failed && <button className="tb-btn" onClick={() => setRetry(r => r + 1)}>Reintentar</button>}</div>}
          <video ref={ref} key={src} src={src} controls autoPlay style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          onContextMenu={e => videoMenu(e, ref.current, { audio: 0, setAudio: () => {}, info: null, sub: "", setSub: () => {}, ext: [], node: cur })}
          onError={() => toast(`Este navegador no puede reproducir “${cur.name}”`, { error: true })}>
          {ext.map((x, i) => <track key={x.url} kind="subtitles" src={x.url} srcLang={x.lang} label={x.label} default={i === 0} />)}</video></div>
          : <EmptyState icon="movie" text={cur ? "Cargando…" : "No hay vídeos"} />}
      </div>
    </div>
  );
}

/* -------------------- PDF -------------------- */
function PdfApp({ fileId, openItem }) {
  useVfs(s => s.rev);
  const n = fileId ? vfs.node(fileId) : null;
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
  return <PdfViewer fileId={fileId} />;
}

export { MusicApp, VideoApp, PdfApp };
