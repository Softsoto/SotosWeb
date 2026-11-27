/* ============================================================
   Sotos — utilidades comunes de las apps de la casa
   ap.toast(texto) · ap.ask({ title, text, fields, ok }) · ap.confirm(texto) · ap.store (sotos.storage con respaldo local)
   © 2026 Sebastian Sotomontes
   ============================================================ */
(function () {
  "use strict";
  var hasSdk = function () { return !!(window.sotos && window.parent !== window); };
  var ap = {};
  var tt;
  ap.toast = function (msg, ms) {
    var old = document.querySelector(".ap-toast"); if (old) old.remove(); clearTimeout(tt);
    var d = document.createElement("div"); d.className = "ap-toast"; d.textContent = msg; document.body.appendChild(d);
    tt = setTimeout(function () { d.remove(); }, ms || 2200);
  };
  ap.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  /** ventana con campos: fields = [{ key, label, type, value, options:[[v,t]], placeholder }] → objeto o null */
  ap.ask = function (o) {
    return new Promise(function (resolve) {
      var m = document.createElement("div"); m.className = "ap-modal";
      var f = (o.fields || []).map(function (x, i) {
        var input = x.type === "select" ? '<select class="ap-in" data-k="' + x.key + '">' + x.options.map(function (p) { return '<option value="' + ap.esc(p[0]) + '"' + (String(p[0]) === String(x.value) ? " selected" : "") + ">" + ap.esc(p[1]) + "</option>"; }).join("") + "</select>"
          : x.type === "textarea" ? '<textarea class="ap-in" rows="' + (x.rows || 4) + '" data-k="' + x.key + '" placeholder="' + ap.esc(x.placeholder || "") + '">' + ap.esc(x.value || "") + "</textarea>"
          : '<input class="ap-in" data-k="' + x.key + '" type="' + (x.type || "text") + '" value="' + ap.esc(x.value == null ? "" : x.value) + '" placeholder="' + ap.esc(x.placeholder || "") + '"' + (x.min != null ? ' min="' + x.min + '"' : "") + (x.max != null ? ' max="' + x.max + '"' : "") + (x.step != null ? ' step="' + x.step + '"' : "") + ">";
        return '<label class="ap-field">' + ap.esc(x.label || "") + input + "</label>";
      }).join("");
      m.innerHTML = '<div class="ap-card" role="dialog" aria-modal="true"><h2>' + ap.esc(o.title || "") + "</h2>" + (o.text ? '<div class="ap-muted">' + ap.esc(o.text) + "</div>" : "") + f +
        '<div class="row"><button class="ap-btn" data-x="no">' + ap.esc(o.cancel || "Cancelar") + '</button><button class="ap-btn ' + (o.danger ? "" : "primary") + '" data-x="ok" ' + (o.danger ? 'style="background:var(--bad);color:#fff;border-color:var(--bad)"' : "") + ">" + ap.esc(o.ok || "Aceptar") + "</button></div></div>";
      document.body.appendChild(m);
      var first = m.querySelector("[data-k]"); (first || m.querySelector('[data-x="ok"]')).focus(); if (first && first.select) first.select();
      var done = function (ok) {
        var out = null; if (ok) { out = {}; m.querySelectorAll("[data-k]").forEach(function (el) { out[el.dataset.k] = el.value; }); }
        m.remove(); document.removeEventListener("keydown", key, true); resolve(out);
      };
      var key = function (e) { if (e.key === "Escape") { e.stopPropagation(); done(false); } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); done(true); } };
      document.addEventListener("keydown", key, true);
      m.addEventListener("mousedown", function (e) { if (e.target === m) done(false); });
      m.querySelector('[data-x="no"]').onclick = function () { done(false); };
      m.querySelector('[data-x="ok"]').onclick = function () { done(true); };
    });
  };
  ap.confirm = function (text, opts) { return ap.ask(Object.assign({ title: text, ok: "Sí", danger: true }, opts || {})).then(function (r) { return !!r; }); };
  /** datos de la app: en tu cuenta (SDK) o, fuera de Sotos, en este navegador */
  ap.store = {
    get: function (k) { if (hasSdk()) return sotos.storage.get(k).catch(function () { return null; }); try { return Promise.resolve(JSON.parse(localStorage.getItem("ap:" + k))); } catch (e) { return Promise.resolve(null); } },
    set: function (k, v) { if (hasSdk()) return sotos.storage.set(k, v).catch(function (e) { ap.toast("No se pudo guardar: " + e.message); }); try { localStorage.setItem("ap:" + k, JSON.stringify(v)); } catch (e) {} return Promise.resolve(true); },
  };
  /** guarda un archivo en Sotos («Guardar como») o, fuera de Sotos, lo descarga */
  ap.save = function (name, blob) {
    if (hasSdk()) return sotos.files.save({ name: name, data: blob }).then(function (f) { if (f) ap.toast("Guardado: " + f.name); return f; }).catch(function (e) { ap.toast(e.message); return null; });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); return Promise.resolve({ name: name });
  };
  ap.ready = hasSdk() ? sotos.ready.catch(function () { return {}; }) : Promise.resolve({});
  window.ap = ap;
})();
