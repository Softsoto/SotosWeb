/* ============================================================
   Sotos OS — Mail, Chat, Browser, Terminal
   ============================================================ */
import React from "react";
import { RealMail } from "./mail.jsx";
import { useVfs } from "./vfs.js";
import { APPS, APP_BY_ID, WEB_SERVICES, MAIL, CHATS } from "./data.jsx";
import { Ic, SideItem, Toolbar, EmptyState } from "./ui.jsx";
import { PX_ORIGIN, pxUrl, DEMO, SHOWCASE_URL } from "./config.js";
import { toast } from "./ui.jsx";
import { showMenu, saveImageFromUrl } from "./context-menu.jsx";
const { useState: useS3, useRef: useR3, useEffect: useE3 } = React;

/* -------------------- Mail (funcional) -------------------- */
// con cuenta de Sotos: correo real (IMAP/SMTP); como invitado o en el demo: buzón de ejemplo
function MailApp(props) {
  const mode = useVfs(s => s.mode);
  return mode === "cloud" && !DEMO ? <RealMail /> : <DemoMail {...props} />;
}
function DemoMail({ openApp }) {
  const [mails, setMails] = useS3(() => { try { return JSON.parse(localStorage.getItem("sotos_mail")) || MAIL.map(m => ({ ...m, folder: "in" })); } catch { return MAIL.map(m => ({ ...m, folder: "in" })); } });
  const [sel, setSel] = useS3(MAIL[0].id);
  const [folder, setFolder] = useS3("in");
  const [compose, setCompose] = useS3(null);
  useE3(() => { try { localStorage.setItem("sotos_mail", JSON.stringify(mails)); } catch (e) {} }, [mails]);

  const inFolder = (m) => folder === "fav" ? m.fav : folder === "sent" ? m.folder === "sent" : (!m.folder || m.folder === "in");
  const list = mails.filter(inFolder);
  const cur = mails.find(m => m.id === sel);
  const unread = mails.filter(m => (!m.folder || m.folder === "in") && m.unread).length;
  const openMail = (m) => { setSel(m.id); setMails(ms => ms.map(x => x.id === m.id ? { ...x, unread: false } : x)); };
  const send = () => {
    if (!compose.to.trim() && !compose.subject.trim()) { setCompose(null); return; }
    const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const m = { id: Date.now(), from: "Yo → " + (compose.to || "destinatario"), addr: compose.to || "—", subject: compose.subject || "(sin asunto)", time: now, unread: false, fav: false, folder: "sent", body: compose.body || "" };
    setMails(ms => [m, ...ms]); setCompose(null); setFolder("sent"); setSel(m.id);
  };
  const del = () => { if (!cur) return; setMails(ms => ms.filter(x => x.id !== cur.id)); setSel(null); };
  const star = (id) => setMails(ms => ms.map(x => x.id === id ? { ...x, fav: !x.fav } : x));

  return (
    <div className="app">
      <div className="app-side" style={{ width: 170, flexBasis: 170 }}>
        <button className="tb-btn primary" style={{ width: "100%", justifyContent: "center", marginBottom: 12 }}
          onClick={() => setCompose({ to: "", subject: "", body: "" })}><Ic name="edit" /> Redactar</button>
        <SideItem icon="inbox" label={`Recibidos${unread ? "  ·  " + unread : ""}`} active={folder === "in"} color="#2f6fed" onClick={() => setFolder("in")} />
        <SideItem icon="star" label="Destacados" active={folder === "fav"} color="#febc2e" onClick={() => setFolder("fav")} />
        <SideItem icon="send" label="Enviados" active={folder === "sent"} color="#34c759" onClick={() => setFolder("sent")} />
        <SideItem icon="delete" label="Papelera" color="#7d8590" onClick={() => setFolder("trash")} />
        <div className="side-group" style={{ marginTop: 14 }}>
          <div className="side-label">Cuentas</div>
          <SideItem icon="mail" label="Gmail" color="#ea4335" onClick={() => openApp("browser", { url: "https://mail.google.com", scName: "Gmail" })} />
          <SideItem icon="mail" label="Outlook" color="#0a78d4" onClick={() => openApp("browser", { url: "https://outlook.live.com/mail", scName: "Outlook" })} />
          <SideItem icon="cloud" label="iCloud" color="#3b8ee0" onClick={() => openApp("browser", { url: "https://www.icloud.com/mail", scName: "iCloud" })} />
        </div>
      </div>
      <div style={{ width: 280, flex: "0 0 280px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 15 }}>
          {folder === "fav" ? "Destacados" : folder === "sent" ? "Enviados" : folder === "trash" ? "Papelera" : "Recibidos"}</div>
        <div className="scroll" style={{ flex: 1 }}>
          {list.map(m => (
            <div key={m.id} onClick={() => openMail(m)}
              style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", cursor: "default",
                background: sel === m.id ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "transparent",
                borderLeft: sel === m.id ? "3px solid var(--accent)" : "3px solid transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: m.unread ? 800 : 600, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}>
                  {m.unread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />}{m.from}</span>
                <span className="faint" style={{ fontSize: 11 }}>{m.time}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: m.unread ? 700 : 500, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.subject}</div>
              <div className="faint" style={{ fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(m.body || "").split("\n")[0]}</div>
            </div>
          ))}
          {!list.length && <EmptyState icon="mail" text="Sin mensajes" />}
        </div>
      </div>
      <div className="app-main">
        {cur ? (
          <div className="scroll" style={{ flex: 1, padding: "26px 30px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 16, flex: 1 }}>{cur.subject}</div>
              <button className="tb-btn icon" onClick={() => star(cur.id)} title="Destacar"><Ic name={cur.fav ? "star" : "star_border"} style={{ color: cur.fav ? "#febc2e" : "var(--text-dim)" }} /></button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 18, borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--accent)", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16 }}>{cur.from[0]}</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{cur.from}</div>
                <div className="faint" style={{ fontSize: 12.5 }}>{cur.addr} · {cur.time}</div></div>
              <button className="tb-btn icon" title="Responder" onClick={() => setCompose({ to: cur.addr, subject: "RE: " + cur.subject, body: "\n\n———\n" + cur.body })}><Ic name="reply" /></button>
              <button className="tb-btn icon" title="Eliminar" onClick={del}><Ic name="delete" /></button>
            </div>
            <div style={{ marginTop: 18, fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{cur.body}</div>
          </div>
        ) : <EmptyState icon="mail" text="Selecciona un mensaje" />}
      </div>
      {compose && (
        <div className="compose">
          <div className="compose-head"><span>Nuevo mensaje</span><Ic name="close" size={18} style={{ cursor: "pointer" }} onClick={() => setCompose(null)} /></div>
          <input className="compose-in" placeholder="Para" value={compose.to} onChange={e => setCompose({ ...compose, to: e.target.value })} />
          <input className="compose-in" placeholder="Asunto" value={compose.subject} onChange={e => setCompose({ ...compose, subject: e.target.value })} />
          <textarea className="compose-body" placeholder="Escribe tu mensaje…" value={compose.body} onChange={e => setCompose({ ...compose, body: e.target.value })} />
          <div className="compose-foot"><button className="tb-btn primary" onClick={send}><Ic name="send" size={16} /> Enviar</button></div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Chat -------------------- */
function ChatApp() {
  const [chats, setChats] = useS3(CHATS);
  const [sel, setSel] = useS3(CHATS[0].id);
  const [text, setText] = useS3("");
  const endRef = useR3(null);
  const cur = chats.find(c => c.id === sel);
  useE3(() => { endRef.current?.parentElement?.scrollTo(0, 9e6); }, [cur, chats]);

  const send = () => {
    if (!text.trim()) return;
    const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    setChats(cs => cs.map(c => c.id === sel ? { ...c, messages: [...c.messages, { me: true, who: "Tú", text, time: now }], last: "Tú: " + text } : c));
    setText("");
    setTimeout(() => {
      const reply = "Recibido 👍";
      setChats(cs => cs.map(c => c.id === sel ? { ...c, messages: [...c.messages, { me: false, who: c.name.split(" ")[0], text: reply, time: now }] } : c));
    }, 1100);
  };

  const open = (id) => { setSel(id); setChats(cs => cs.map(c => c.id === id ? { ...c, unread: 0 } : c)); };

  return (
    <div className="app">
      <div style={{ width: 240, flex: "0 0 240px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
          <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Mensajes</span>
          <button className="tb-btn icon"><Ic name="edit_square" /></button>
        </div>
        <div className="scroll" style={{ flex: 1 }}>
          {chats.map(c => (
            <div key={c.id} onClick={() => open(c.id)}
              style={{ padding: "11px 14px", display: "flex", gap: 11, cursor: "default",
                background: sel === c.id ? "var(--hover)" : "transparent" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: c.color, color: "#fff", flex: "0 0 42px",
                display: "grid", placeItems: "center" }}><Ic name={c.group ? "group" : "person"} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span className="faint" style={{ fontSize: 11 }}>{c.time}</span>
                </div>
                <div className="faint" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.last}</div>
              </div>
              {c.unread > 0 && <span style={{ background: "var(--accent)", color: "var(--accent-ink)", fontSize: 11, fontWeight: 700,
                minWidth: 18, height: 18, borderRadius: 9, display: "grid", placeItems: "center", padding: "0 5px" }}>{c.unread}</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="app-main">
        <div style={{ flex: "0 0 52px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: cur.color, color: "#fff", display: "grid", placeItems: "center" }}>
            <Ic name={cur.group ? "group" : "person"} size={20} /></div>
          <div><div style={{ fontWeight: 700, fontSize: 14 }}>{cur.name}</div>
            <div className="faint" style={{ fontSize: 11.5 }}>{cur.group ? "3 participantes" : "En línea"}</div></div>
          <div className="tb-spacer" />
          <button className="tb-btn icon"><Ic name="call" /></button>
          <button className="tb-btn icon"><Ic name="videocam" /></button>
        </div>
        <div className="scroll" style={{ flex: 1, padding: "16px 18px", background: "var(--surface-2)", display: "flex", flexDirection: "column", gap: 8 }}>
          {cur.messages.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start" }}>
              {cur.group && !m.me && <span className="faint" style={{ fontSize: 11, margin: "0 0 2px 12px", fontWeight: 600 }}>{m.who}</span>}
              <div style={{ maxWidth: "70%", padding: "9px 13px", borderRadius: 16,
                background: m.me ? "var(--accent)" : "var(--surface)", color: m.me ? "var(--accent-ink)" : "var(--text)",
                borderBottomRightRadius: m.me ? 5 : 16, borderBottomLeftRadius: m.me ? 16 : 5,
                fontSize: 14, lineHeight: 1.4, boxShadow: "var(--shadow-card)" }}>{m.text}</div>
              <span className="faint" style={{ fontSize: 10.5, margin: "2px 8px 0" }}>{m.time}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div style={{ flex: "0 0 60px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
          <button className="tb-btn icon"><Ic name="add" /></button>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Escribe un mensaje…"
            style={{ flex: 1, height: 38, borderRadius: 19, border: "1px solid var(--border)", background: "var(--surface-2)",
              padding: "0 16px", font: "inherit", fontSize: 14, color: "var(--text)", outline: "none" }} />
          <button className="tb-btn icon" style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "transparent", width: 38, height: 38 }}
            onClick={send}><Ic name="send" /></button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Browser -------------------- */
// el proxy propio de Sotos (server/px.mjs) — ver config.js
const EMBED_HOME = [
  { name: "Wikipedia", icon: "menu_book", color: "#3a3a3a", url: "https://es.wikipedia.org/wiki/Wikipedia:Portada" },
  { name: "OpenStreetMap", icon: "map", color: "#7ebc6f", url: "https://www.openstreetmap.org/export/embed.html?bbox=-3.75%2C40.39%2C-3.66%2C40.44" },
  { name: "Archive.org", icon: "inventory_2", color: "#3a4a78", url: "https://archive.org" },
  { name: "Wikilibros", icon: "auto_stories", color: "#1aa260", url: "https://es.wikibooks.org" },
  { name: "Wikinoticias", icon: "feed", color: "#ff8a00", url: "https://es.wikinews.org" },
  { name: "Wikcionario", icon: "translate", color: "#0aa5b5", url: "https://es.wiktionary.org" },
];

// sitios que, por su propia seguridad, se niegan a funcionar dentro de otra página
// (lo detectan con JavaScript y muestran un aviso). Se respetan: se abren en pestaña nueva.
const NO_FRAME = ["ilovepdf.com", "accounts.google.com", "login.microsoftonline.com", "login.live.com", "appleid.apple.com", "paypal.com",
  "mercadopago.com", "bancolombia.com", "davivienda.com", "bancodebogota.com", "nequi.com.co", "dian.gov.co", "web.whatsapp.com", "discord.com"];
const hostOf = (a) => { try { return new URL(a).hostname.replace(/^www\./, ""); } catch { return ""; } };
export const refusesFrame = (a) => { const h = hostOf(a); return !!h && NO_FRAME.some(d => h === d || h.endsWith("." + d)); };

// muchos sitios bloquean el iframe sin disparar onError (X-Frame-Options / CSP frame-ancestors).
// si no carga en 3.5s, lo damos por bloqueado y avisamos para reintentar por proxy.
// con proxy, la página avisa por postMessage de su URL/título reales.
function SafeFrame({ src, proxied, onBlocked, onNav, onLoading, onCtx }) {
  const loaded = useR3(false);
  const ref = useR3(null);
  useE3(() => {
    loaded.current = false; onLoading && onLoading(true);
    const to = proxied ? null : setTimeout(() => { if (!loaded.current) onBlocked(); }, 3500);
    return () => to && clearTimeout(to);
  }, [src]);
  useE3(() => {
    if (!proxied) return;
    const onMsg = (e) => {
      if (e.origin !== PX_ORIGIN || !ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data; if (d && d.type === "sotos-px" && typeof d.url === "string") onNav(d.url, d.title || "");
      if (d && d.type === "sotos-ctx" && onCtx) {
        const r = ref.current.getBoundingClientRect();
        const send = (cmd, text) => ref.current?.contentWindow?.postMessage({ type: "sotos-cmd", cmd, text }, PX_ORIGIN);
        onCtx({ link: typeof d.link === "string" ? d.link : null, img: typeof d.img === "string" ? d.img : null, text: String(d.text || ""), editable: !!d.editable }, r.left + (+d.x || 0), r.top + (+d.y || 0), send);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [proxied, onNav, onCtx]);
  return <iframe ref={ref} title="web" src={src} style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
    onLoad={() => { loaded.current = true; onLoading && onLoading(false); }}
    // sin allow-top-navigation: la página no puede sacar al usuario de Sotos
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation allow-pointer-lock"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />;
}

// ---- navegador virtual (Neko): un Firefox real en el servidor, para las páginas que no se dejan incrustar ----
let nekoInfo = null;
function useNeko() {
  const mode = useVfs(s => s.mode);
  const [info, setInfo] = useS3(nekoInfo);
  useE3(() => { if (DEMO || mode !== "cloud" || nekoInfo) return; fetch("/api/neko").then(r => r.ok ? r.json() : null).then(j => { nekoInfo = j || { enabled: false }; setInfo(nekoInfo); }).catch(() => {}); }, [mode]);
  return info?.enabled ? info : null;
}
const nekoPost = (p, b) => fetch("/api/neko/" + p, { method: "POST", headers: { "x-sotos": "1", "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Navegador virtual no disponible"); return j; });
function NekoFrame({ addr, neko }) {
  const [src, setSrc] = useS3(null), [err, setErr] = useS3(null);
  useE3(() => { nekoPost("session").then(j => setSrc(j.url)).catch(e => setErr(e.message)); }, []);
  useE3(() => { if (src && neko.canOpen && /^https?:/.test(addr)) { const t = setTimeout(() => nekoPost("open", { url: addr }).catch(e => toast(e.message, { error: true })), 2500); return () => clearTimeout(t); } }, [src, addr]);
  if (err) return <EmptyState icon="desktop_access_disabled" text={err} />;
  return (<div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
    <div className="proxy-bar"><Ic name="desktop_windows" size={14} /> Navegador virtual: un Firefox real en tu servidor de Sotos. Lo que hagas aquí (sesiones, descargas) queda en ese equipo, no en tu PC.{!neko.canOpen && <> Escribe la dirección en su barra.</>}</div>
    {src ? <iframe title="navegador virtual" src={src} className="neko-frame" allow="autoplay; clipboard-read; clipboard-write; fullscreen" allowFullScreen /> : <EmptyState icon="hourglass_empty" text="Conectando con el navegador virtual…" />}
  </div>);
}

let tabSeq = 1;
function BrowserApp({ shortcuts = [], url, scName }) {
  const home = () => ({ id: tabSeq++, addr: "inicio", input: "", title: "Nueva pestaña", hist: ["inicio"], hi: 0 });
  const [tabs, setTabs] = useS3(() => {
    if (url) return [{ id: tabSeq++, addr: url, input: url, title: scName || url, hist: ["inicio", url], hi: 1 }];
    try { const s = JSON.parse(localStorage.getItem("sotos_browser")); if (s && s.tabs && s.tabs.length) { tabSeq = (Math.max(...s.tabs.map(t => t.id)) || 1) + 1; return s.tabs; } } catch (e) {}
    return [home()];
  });
  const [active, setActive] = useS3(() => { if (url) return 0; try { return JSON.parse(localStorage.getItem("sotos_browser"))?.active || 0; } catch { return 0; } });
  const [proxyMode, setProxyMode] = useS3(() => { if (DEMO) return false; try { const v = localStorage.getItem("sotos_proxy"); return v === null ? true : v === "1"; } catch { return true; } });
  const [failed, setFailed] = useS3({});
  const neko = useNeko();
  const t = tabs[active] || tabs[0];

  // una dirección nueva (abrir enlace con la ventana ya abierta) añade pestaña; la inicial ya la creó useState
  const firstUrl = React.useRef(true);
  useE3(() => {
    if (firstUrl.current) { firstUrl.current = false; return; }
    if (url) setTabs(ts => { const n = [...ts, { id: tabSeq++, addr: url, input: url, title: scName || url, hist: ["inicio", url], hi: 1, fresh: true }]; setActive(n.length - 1); return n; });
  }, [url]);
  useE3(() => { if (!url) { try { localStorage.setItem("sotos_browser", JSON.stringify({ tabs, active })); } catch (e) {} } }, [tabs, active]);
  useE3(() => { try { localStorage.setItem("sotos_proxy", proxyMode ? "1" : "0"); } catch (e) {} }, [proxyMode]);

  const [loading, setLoading] = useS3(false);
  const [nonce, setNonce] = useS3(0);
  const svcOf = (a) => WEB_SERVICES.find(s => a.startsWith(s.url));
  const knownBlocked = (a) => { const s = svcOf(a); return s ? !s.embed : false; };
  // servicio con reproductor incrustable oficial (YouTube, Spotify, Maps) solo en su portada
  const officialEmbed = (a) => { const s = svcOf(a); return s && s.embed && a.replace(/\/$/, "") === s.url ? s.embed : null; };
  const isProxied = (a) => proxyMode && !officialEmbed(a);
  const frameSrc = (a) => officialEmbed(a) || (proxyMode ? pxUrl(a) : a);
  // navegación dentro de la página proxificada: actualiza barra, título e historial sin recargar
  const onNav = React.useCallback((url, title) => {
    setTabs(ts => ts.map((x, i) => {
      if (i !== active) return x;
      const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
      let { hist, hi } = x;
      if (x.live === url) return { ...x, title: title || x.title };            // mismo documento (load, cambio de título)
      if (x.fresh) { hist = [...hist]; hist[hi] = url; }                       // 1er aviso tras cargar: refleja redirecciones
      else { hist = [...hist.slice(0, hi + 1), url]; hi = hist.length - 1; }  // clic dentro de la página
      const shown = (() => { try { return decodeURI(url); } catch { return url; } })();
      return { ...x, live: url, fresh: false, input: shown, title: title || host, hist, hi };
    }));
  }, [active]);

  const patch = (p) => setTabs(ts => ts.map((x, i) => i === active ? { ...x, ...p } : x));
  const go = (raw, tab) => {
    let u = (raw || "").trim(); if (!u) return;
    if (!/^https?:\/\//.test(u) && u !== "inicio") {
      if (/\.\w{2,}/.test(u) && !u.includes(" ")) u = "https://" + u;
      else u = "https://duckduckgo.com/?q=" + encodeURIComponent(u);
    }
    const cur = tab || t; const hist = cur.hist.slice(0, cur.hi + 1); hist.push(u);
    patch({ addr: u, live: null, fresh: true, input: u === "inicio" ? "" : u, hist, hi: hist.length - 1, title: u === "inicio" ? "Nueva pestaña" : (svcOf(u)?.name || u.replace(/^https?:\/\//, "").split("/")[0]) });
    setNonce(n => n + 1);
  };
  const jump = (hi) => { patch({ hi, addr: t.hist[hi], live: null, fresh: true, input: t.hist[hi] === "inicio" ? "" : t.hist[hi] }); setNonce(n => n + 1); };
  const back = () => { if (t.hi > 0) jump(t.hi - 1); };
  const fwd = () => { if (t.hi < t.hist.length - 1) jump(t.hi + 1); };
  const newTab = () => { setTabs(ts => { const n = [...ts, home()]; setActive(n.length - 1); return n; }); };
  const closeTab = (i) => setTabs(ts => { if (ts.length === 1) return [home()]; const n = ts.filter((_, j) => j !== i); setActive(a => Math.max(0, Math.min(a >= i ? a - 1 : a, n.length - 1))); return n; });

  // clic derecho dentro de una página proxificada (llega por postMessage desde px.mjs)
  const ctxRef = React.useRef(); ctxRef.current = { back, fwd, go, t, newTabWith: (u) => setTabs(ts => { const n = [...ts, { id: tabSeq++, addr: u, input: u, title: u.replace(/^https?:\/\//, "").split("/")[0], hist: ["inicio", u], hi: 1, fresh: true }]; setActive(n.length - 1); return n; }) };
  const onPageCtx = React.useCallback(({ link, img, text, editable }, x, y, send) => {
    const c = ctxRef.current; const items = [];
    const copy = (s, m) => navigator.clipboard.writeText(s).then(() => toast(m || "Copiado", { icon: "content_copy" })).catch(() => {});
    if (link) items.push(
      { label: "Abrir enlace en una pestaña nueva", icon: "tab", run: () => c.newTabWith(link) },
      { label: "Abrir enlace aquí", icon: "arrow_forward", run: () => c.go(link) },
      { label: "Abrir en el navegador del equipo", icon: "open_in_new", run: () => window.open(link, "_blank", "noopener") },
      { label: "Copiar dirección del enlace", icon: "link", run: () => copy(link, "Enlace copiado") }, { sep: true });
    if (img) items.push(
      { label: "Guardar imagen en Imágenes", icon: "add_photo_alternate", run: () => saveImageFromUrl(pxUrl(img)).catch(e => toast(e.message, { error: true })) },
      { label: "Abrir imagen en una pestaña nueva", icon: "image", run: () => c.newTabWith(img) },
      { label: "Copiar dirección de la imagen", icon: "link", run: () => copy(img, "Dirección copiada") }, { sep: true });
    if (editable) items.push(
      ...(text ? [{ label: "Cortar", icon: "content_cut", run: () => { copy(text, "Cortado"); send("delete"); } }, { label: "Copiar", icon: "content_copy", run: () => copy(text) }] : []),
      { label: "Pegar", icon: "content_paste", run: async () => { try { send("insertText", await navigator.clipboard.readText()); } catch { toast("Permite el acceso al portapapeles para pegar", { error: true }); } } },
      { label: "Seleccionar todo", icon: "select_all", run: () => send("selectAll") }, { sep: true });
    else if (text) items.push(
      { label: "Copiar", icon: "content_copy", run: () => copy(text) },
      { label: `Buscar «${text.length > 24 ? text.slice(0, 23) + "…" : text}» en la web`, icon: "travel_explore", run: () => c.newTabWith("https://duckduckgo.com/?q=" + encodeURIComponent(text)) }, { sep: true });
    items.push(
      { label: "Atrás", icon: "arrow_back", run: c.back },
      { label: "Adelante", icon: "arrow_forward", run: c.fwd },
      { label: "Recargar", icon: "refresh", run: () => setNonce(n => n + 1) },
      { label: "Copiar dirección de la página", icon: "link", run: () => copy(c.t.live || c.t.addr, "Dirección copiada") });
    showMenu(x, y, items);
  }, []);

  const marks = [...EMBED_HOME, ...WEB_SERVICES.slice(0, 6), ...shortcuts.map(s => ({ ...s, sc: true }))];
  const refused = t.addr !== "inicio" && refusesFrame(t.addr);
  const virtual = !!(neko && t.virtual && t.addr !== "inicio");
  const toVirtual = (on = true) => patch({ virtual: on });
  const showBlocked = !virtual && (refused || (knownBlocked(t.addr) && !proxyMode));
  const usingProxy = t.addr !== "inicio" && isProxied(t.addr);
  const realUrl = t.live || t.addr;

  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <div className="br-tabs">
        {tabs.map((tb, i) => (
          <div key={tb.id} className={"br-tab" + (i === active ? " active" : "")} onClick={() => setActive(i)}>
            <Ic name={tb.addr === "inicio" ? "public" : "language"} size={15} style={{ color: i === active ? "var(--accent)" : "var(--text-faint)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{tb.title}</span>
            <span className="br-x" onClick={e => { e.stopPropagation(); closeTab(i); }}><Ic name="close" size={13} /></span>
          </div>
        ))}
        <button className="br-newtab" onClick={newTab} title="Nueva pestaña"><Ic name="add" size={18} /></button>
      </div>
      <Toolbar>
        <button className="tb-btn icon" disabled={t.hi <= 0} style={{ opacity: t.hi <= 0 ? .4 : 1 }} onClick={back}><Ic name="arrow_back" /></button>
        <button className="tb-btn icon" disabled={t.hi >= t.hist.length - 1} style={{ opacity: t.hi >= t.hist.length - 1 ? .4 : 1 }} onClick={fwd}><Ic name="arrow_forward" /></button>
        <button className="tb-btn icon" title="Recargar" onClick={() => { if (t.live && t.live !== t.addr) patch({ addr: t.live, fresh: true }); setNonce(n => n + 1); }}><Ic name={loading && t.addr !== "inicio" ? "progress_activity" : "refresh"} /></button>
        <button className="tb-btn icon" onClick={() => go("inicio")}><Ic name="home" /></button>
        <div className="search-box" style={{ flex: 1, borderRadius: 18 }}>
          <Ic name={t.addr === "inicio" ? "search" : "lock"} size={15} />
          <input placeholder="Busca o escribe una dirección" value={t.input} onChange={e => patch({ input: e.target.value })} onKeyDown={e => e.key === "Enter" && go(t.input)}
            onFocus={e => e.target.select()} onMouseUp={e => e.preventDefault() /* conserva la selección completa al hacer clic */} />
        </div>
        {!DEMO && <button className={"tb-btn" + (proxyMode ? " primary" : "")} title="Modo compatibilidad: intenta cargar sitios bloqueados vía proxy"
          onClick={() => setProxyMode(p => !p)}><Ic name="shield" size={17} /> Proxy</button>}
        {neko && t.addr !== "inicio" && <button className={"tb-btn" + (virtual ? " primary" : "")} title="Abrir esta página en el navegador virtual (Firefox real en el servidor)" onClick={() => toVirtual(!virtual)}><Ic name="desktop_windows" size={17} /> Virtual</button>}
        {t.addr !== "inicio" && <button className="tb-btn icon" title="Abrir en pestaña real" onClick={() => window.open(realUrl, "_blank", "noopener")}><Ic name="open_in_new" /></button>}
      </Toolbar>
      {t.addr === "inicio" ? (
        <div className="scroll" style={{ flex: 1, background: "var(--surface)" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 46 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 32, fontWeight: 800, letterSpacing: "-.03em" }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent)", display: "inline-grid", placeItems: "center" }}>
                <span style={{ width: 13, height: 13, borderRadius: "50%", background: "#fff" }} /></span>Sotos</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, width: 460, maxWidth: "84%",
              border: "1px solid var(--border)", borderRadius: 24, padding: "12px 18px", boxShadow: "var(--shadow-card)" }}>
              <Ic name="search" className="faint" />
              <input placeholder="Busca o escribe una dirección" value={t.input} onChange={e => patch({ input: e.target.value })} onKeyDown={e => e.key === "Enter" && go(t.input)}
                style={{ flex: 1, border: "none", background: "none", outline: "none", font: "inherit", fontSize: 15, color: "var(--text)" }} /></div>
            <div className="faint" style={{ fontSize: 12, marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
              {DEMO ? <><Ic name="info" size={14} /> Demo: se abren aquí las páginas que permiten mostrarse dentro de otra web. Con Sotos instalado, el proxy abre cualquiera.</> : <><Ic name="shield" size={14} /> <b style={{ color: "var(--text-dim)" }}>Modo Proxy</b> activado: las páginas se abren aquí dentro, sin salir de Sotos</>}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,84px)", gap: 18, marginTop: 26, paddingBottom: 30 }}>
              {marks.map((b, i) => (
                <div key={b.name + i} onClick={() => go(b.url)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <div style={{ width: 54, height: 54, borderRadius: 16, background: b.color, display: "grid", placeItems: "center", color: "#fff", boxShadow: "var(--shadow-card)" }}>
                    <Ic name={b.icon} size={26} /></div>
                  <span style={{ fontSize: 12, fontWeight: 500, textAlign: "center", lineHeight: 1.2 }}>{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : virtual ? <NekoFrame key={t.id} addr={t.live || t.addr} neko={neko} />
      : showBlocked ? (
        <div className="app webview-launch" style={{ flex: 1 }}>
          <div className="wl-card">
            <div className="lp-svc" style={{ background: (svcOf(t.addr)?.color) || "#7d8590", width: 72, height: 72, borderRadius: 20 }}><Ic name={svcOf(t.addr)?.icon || "public"} size={38} /></div>
            <div className="wl-title">{svcOf(t.addr)?.name || (refused ? hostOf(t.addr) : "Sitio protegido")}</div>
            <div className="wl-sub">{refused ? <>Este sitio, por seguridad, no permite usarse dentro de otra página. Ábrelo en una pestaña nueva; Sotos sigue abierto aquí.</> : DEMO ? <>Este sitio no permite mostrarse dentro de otra página. En el demo no hay servidor; con Sotos instalado, su <b>proxy</b> lo abre aquí dentro.</> : <>Activa el <b>Modo Proxy</b> para abrirlo aquí dentro sin salir de Sotos.</>}</div>
            <div className="wl-btns">
              {neko && <button className="tb-btn primary" onClick={() => toVirtual()}><Ic name="desktop_windows" /> Abrir aquí en el navegador virtual</button>}
              {refused ? <button className={"tb-btn" + (neko ? "" : " primary")} onClick={() => window.open(t.addr, "_blank", "noopener")}><Ic name="open_in_new" /> Abrir en pestaña nueva</button>
              : DEMO ? <><button className="tb-btn primary" onClick={() => window.open(t.addr, "_blank", "noopener")}><Ic name="open_in_new" /> Abrir en pestaña nueva</button><button className="tb-btn" onClick={() => window.open(SHOWCASE_URL, "_blank", "noopener")}><Ic name="info" /> Conocer Sotos</button></> : <button className="tb-btn primary" onClick={() => setProxyMode(true)}><Ic name="shield" /> Abrir aquí con Proxy</button>}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {!usingProxy && failed[t.addr] && <div className="proxy-bar"><Ic name="shield" size={14} /> Si la página sale en blanco, no permite mostrarse dentro de otra web. {DEMO ? <>Con Sotos instalado, el proxy la abre aquí;</> : <><a onClick={() => setProxyMode(true)}>Activa el Modo Proxy</a> o</>} <a onClick={() => window.open(realUrl, "_blank", "noopener")}>ábrelo en pestaña nueva</a>{neko && <> o <a onClick={() => toVirtual()}>usa el navegador virtual</a></>}.</div>}
          <SafeFrame key={t.id + ":" + nonce + ":" + frameSrc(t.addr)} src={frameSrc(t.addr)} proxied={usingProxy}
            onNav={onNav} onLoading={setLoading} onCtx={onPageCtx}
            onBlocked={() => setFailed(f => f[t.addr] ? f : { ...f, [t.addr]: true })} />
        </div>
      )}
    </div>
  );
}

export { MailApp, ChatApp, BrowserApp };
