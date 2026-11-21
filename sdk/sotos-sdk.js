/* ============================================================
   Sotos SDK — para apps de la Tienda de Sotos
   Inclúyelo en tu app:   <script src="/sdk/sotos-sdk.js"></script>
   y usa el objeto global `sotos`. Todo devuelve promesas.

     const info = await sotos.ready;              // { app, lang, theme, user? }
     const [f] = await sotos.files.pick({ exts: ["md", "txt"] });
     const texto = await (await sotos.files.read(f)).text();
     await sotos.files.save({ name: "nota.md", data: texto });
     await sotos.storage.set("ajustes", { fuente: 16 });
     sotos.notify({ title: "Listo", body: "Se guardó tu nota" });
     sotos.on("theme", t => document.body.classList.toggle("oscuro", t.dark));
     sotos.on("open", file => abrir(file));        // «Abrir con» desde Archivos

   Tu app corre aislada: no ve la sesión ni la API de Sotos. Cada función pide al
   escritorio lo que necesita, y este comprueba los permisos de tu sotos-app.json.
   Versión 1 · © 2026 Sebastian Sotomontes · Licencia MIT
   ============================================================ */
(function () {
  "use strict";
  if (window.sotos) return;
  var parentWin = window.parent !== window ? window.parent : null;
  var seq = 0, pending = {}, handlers = {}, queue = [];
  function call(method, params) {
    if (!parentWin) return Promise.reject(new Error("Esta app debe abrirse dentro de Sotos"));
    return new Promise(function (resolve, reject) {
      var id = ++seq; pending[id] = { resolve: resolve, reject: reject };
      parentWin.postMessage({ sotos: "req", v: 1, id: id, method: method, params: params || {} }, "*");
    });
  }
  window.addEventListener("message", function (e) {
    if (e.source !== parentWin) return; var m = e.data; if (!m || typeof m !== "object") return;
    if (m.sotos === "res" && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; m.ok ? p.resolve(m.result) : p.reject(Object.assign(new Error(m.error || "Error"), { code: m.code })); }
    else if (m.sotos === "event") { (handlers[m.name] || []).forEach(function (f) { try { f(m.data); } catch (err) { console.error(err); } }); if (!handlers[m.name] && m.name === "open") queue.push(m.data); }
  });
  var toData = function (d) { return d instanceof Blob || d instanceof ArrayBuffer || ArrayBuffer.isView(d) ? d : typeof d === "string" ? d : JSON.stringify(d); };
  var sotos = {
    version: 1,
    /** se resuelve cuando el escritorio responde: { app, lang, theme: { dark, accent }, user? } */
    ready: null,
    /** nombre, idioma y avatar de quien usa la app (permiso «user») */
    user: function () { return call("user"); },
    files: {
      /** abre el selector de Sotos: { title?, types?: ["img"...], exts?: ["md"...], multiple? } → [archivo] o [] si se cancela */
      pick: function (o) { return call("files.pick", o); },
      /** contenido de un archivo elegido → Blob (permiso «files.read») */
      read: function (f) { return call("files.read", { id: f && f.id || f }); },
      /** guarda con «Guardar como»: { name, data: Blob|string|ArrayBuffer, type?, title? } → archivo o null (permiso «files.write») */
      save: function (o) { return call("files.save", Object.assign({}, o, { data: toData(o && o.data) })); },
      /** reescribe un archivo que el usuario ya te dio (permiso «files.write») */
      write: function (f, data) { return call("files.write", { id: f && f.id || f, data: toData(data) }); }
    },
    /** aviso en la campana de Sotos: { title, body? } (permiso «notify») */
    notify: function (o) { return call("notify", typeof o === "string" ? { title: o } : o); },
    /** datos de tu app en la cuenta de la persona, hasta 2 MB (permiso «storage») */
    storage: {
      get: function (k) { return call("storage.get", { key: k }); },
      set: function (k, v) { return call("storage.set", { key: k, value: v }); },
      remove: function (k) { return call("storage.remove", { key: k }); },
      keys: function () { return call("storage.keys"); }
    },
    window: {
      /** texto de la barra de título de la ventana */
      setTitle: function (t) { return call("window.setTitle", { title: String(t) }); },
      close: function () { return call("window.close"); }
    },
    /** eventos: "theme" ({ dark, accent }), "open" (archivo de «Abrir con») */
    on: function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); if (name === "open") { var q = queue; queue = []; q.forEach(function (d) { fn(d); }); } return function () { handlers[name] = (handlers[name] || []).filter(function (f) { return f !== fn; }); }; }
  };
  sotos.ready = call("hello", { sdk: 1 }).then(function (info) {
    var t = info && info.theme; if (t) { document.documentElement.dataset.sotosTheme = t.dark ? "dark" : "light"; document.documentElement.style.setProperty("--sotos-accent", t.accent || "#c4532f"); }
    return info;
  });
  sotos.on("theme", function (t) { document.documentElement.dataset.sotosTheme = t.dark ? "dark" : "light"; document.documentElement.style.setProperty("--sotos-accent", t.accent || "#c4532f"); });
  window.sotos = sotos;
})();
