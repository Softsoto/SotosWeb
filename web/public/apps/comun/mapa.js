/* ============================================================
   Sotos â€” mapa mundial para las apps de la casa (sin bibliotecas)
   Descarga el contorno de los paÃ­ses (Natural Earth 1:110m, dominio pÃºblico, paquete world-atlas)
   por sotos.net.fetch, decodifica el TopoJSON y lo dibuja en un <canvas> con proyecciÃ³n
   equirectangular. Se arrastra, se acerca con la rueda o con dos dedos y da la vuelta al mundo.
     const m = await SotosMapa(canvas, { onDraw(ctx, m) { m.dot(lon, lat, 4, "#c00") } });
     m.proj(lon, lat) â†’ [x, y] Â· m.unproj(x, y) â†’ [lon, lat] Â· m.center(lon, lat, zoom) Â· m.draw()
   La app debe declarar Â«cdn.jsdelivr.netÂ» en sus hosts.
   Â© 2026 Sebastian Sotomontes
   ============================================================ */
(function () {
  "use strict";
  var URL_MUNDO = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
  var cache = null;
  function cargar() {
    if (cache) return cache;
    cache = sotos.net.fetch(URL_MUNDO).then(function (r) { if (!r.ok) throw new Error("No se pudo descargar el mapa (" + r.status + ")"); return r.json(); }).then(decode);
    cache.catch(function () { cache = null; });
    return cache;
  }
  /* TopoJSON: arcos cuantizados con deltas â†’ anillos de [lon, lat] */
  function decode(t) {
    var sx = t.transform.scale[0], sy = t.transform.scale[1], tx = t.transform.translate[0], ty = t.transform.translate[1];
    var arcs = t.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (p) { x += p[0]; y += p[1]; return [x * sx + tx, y * sy + ty]; }); });
    var arc = function (i) { return i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); };
    var ring = function (r) { var out = []; r.forEach(function (i, k) { var a = arc(i); out.push.apply(out, k ? a.slice(1) : a); }); return out; };
    var polys = function (g) { return g.type === "Polygon" ? [g.arcs.map(ring)] : g.type === "MultiPolygon" ? g.arcs.map(function (p) { return p.map(ring); }) : []; };
    var countries = t.objects.countries.geometries.map(function (g) { return { name: g.properties && g.properties.name || "", id: g.id, polys: polys(g) }; });
    var land = []; t.objects.land.geometries.forEach(function (g) { land.push.apply(land, polys(g)); });
    countries.forEach(function (c) { var b = [180, 90, -180, -90]; c.polys.forEach(function (p) { p[0].forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); }); c.bbox = b; });
    return { land: land, countries: countries };
  }
  var css = function (n, d) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || d; };
  var dark = function () { return document.documentElement.getAttribute("data-sotos-theme") === "dark"; };
  /* punto dentro de un polÃ­gono (par-impar), para saber sobre quÃ© paÃ­s estÃ¡ algo */
  function inside(lon, lat, poly) {
    var hit = false; poly.forEach(function (r, k) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } if (k === 0) hit = c; else if (c) hit = false; });
    return hit;
  }

  window.SotosMapa = function (canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext("2d"), world = null, dpr = 1, W = 0, H = 0;
    var view = { lon: opts.lon || 0, lat: opts.lat || 10, z: opts.zoom || 1 }; // z = 1: el mundo entero cabe a lo ancho
    var m = { view: view, world: null, ctx: ctx };
    var k = function () { return W / 360 * view.z; }; // pÃ­xeles por grado
    var minZ = function () { return Math.max(1, H * 2 / W * 0.98); }; // el mapa siempre llena el alto (sin franjas vacÃ­as)
    var clampLat = function () { if (view.z < minZ()) view.z = minZ(); var half = H / 2 / k(); view.lat = Math.max(-90 + half, Math.min(90 - half, view.lat)); if (half >= 90) view.lat = 0; };
    m.proj = function (lon, lat) { var d = lon - view.lon; d = ((d + 540) % 360) - 180; return [W / 2 + d * k(), H / 2 - (lat - view.lat) * k()]; };
    m.unproj = function (x, y) { var lon = view.lon + (x - W / 2) / k(); return [((lon + 540) % 360) - 180, view.lat - (y - H / 2) / k()]; };
    m.scale = k;
    /* traza un anillo de [lon, lat] cortando donde cruza el borde de la vista (para no dibujar rayas horizontales) */
    function trace(r) {
      var px = null; for (var i = 0; i < r.length; i++) { var p = m.proj(r[i][0], r[i][1]); if (px === null || Math.abs(p[0] - px) > W / 2) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); px = p[0]; }
    }
    m.path = function (pts) { ctx.beginPath(); trace(pts); };
    m.dot = function (lon, lat, r, fill, stroke) { var p = m.proj(lon, lat); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } return p; };
    /* cÃ­rculo sobre la Tierra (radio en km) como polÃ­gono de lon/lat */
    m.circle = function (lon, lat, km) {
      var R = 6371, d = km / R, la = lat * Math.PI / 180, lo = lon * Math.PI / 180, out = [];
      for (var i = 0; i <= 72; i++) { var b = i / 72 * 2 * Math.PI, la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b)), lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)); out.push([((lo2 * 180 / Math.PI + 540) % 360) - 180, la2 * 180 / Math.PI]); }
      return out;
    };
    /* sombra de la noche, dado el punto donde el Sol estÃ¡ en el cÃ©nit */
    m.night = function (sunLon, sunLat, fill) {
      var s = sunLat * Math.PI / 180; if (Math.abs(s) < 1e-4) s = 1e-4; var pts = [];
      for (var x = -180; x <= 180; x += 2) { var h = (x - sunLon) * Math.PI / 180; pts.push([x, Math.atan(-Math.cos(h) / Math.tan(s)) * 180 / Math.PI]); }
      var pole = sunLat > 0 ? -90 : 90; ctx.beginPath();
      for (var off = -360; off <= 360; off += 360) { pts.forEach(function (p, i) { var q = m.proj(p[0], p[1]); q[0] = W / 2 + (p[0] + off - view.lon) * k(); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); var e = m.proj(180, pole), b = m.proj(-180, pole); ctx.lineTo(W / 2 + (180 + off - view.lon) * k(), e[1]); ctx.lineTo(W / 2 + (-180 + off - view.lon) * k(), b[1]); ctx.closePath(); }
      ctx.fillStyle = fill || "rgba(10,20,40,.28)"; ctx.fill();
    };
    m.countryAt = function (lon, lat) { if (!world) return null; for (var i = 0; i < world.countries.length; i++) { var c = world.countries[i], b = c.bbox; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue; for (var j = 0; j < c.polys.length; j++) if (inside(lon, lat, c.polys[j])) return c.name; } return null; };
    m.center = function (lon, lat, z) { view.lon = lon; view.lat = lat; if (z) view.z = Math.max(minZ(), Math.min(40, z)); clampLat(); m.draw(); };
    m.bounds = function () { var a = m.unproj(0, 0), b = m.unproj(W, H); return { west: a[0], north: a[1], east: b[0], south: b[1], whole: view.z <= 1.01 }; };

    var raf = 0;
    m.draw = function () { if (!raf) raf = requestAnimationFrame(paint); };
    function paint() {
      raf = 0; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); clampLat();
      var dk = dark(), sea = dk ? "#1d2a33" : "#d6e2e6", landC = dk ? "#3a3830" : css("--panel", "#fbf8f2"), border = dk ? "#5a554a" : css("--line-2", "#c9bca7"), grid = dk ? "rgba(255,255,255,.06)" : "rgba(60,80,90,.10)";
      ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath();
      for (var g = -180; g < 180; g += 30) { var p = m.proj(g, 0); ctx.moveTo(p[0], 0); ctx.lineTo(p[0], H); }
      for (var la = -60; la <= 60; la += 30) { var q = m.proj(0, la); ctx.moveTo(0, q[1]); ctx.lineTo(W, q[1]); } ctx.stroke();
      if (world) {
        // el mundo en tres copias (âˆ’360Â°, 0, +360Â°): los polÃ­gonos ya vienen cortados en el antimeridiano
        var copies = function (fn) { [-360, 0, 360].forEach(function (off) { var x0 = W / 2 + (off - view.lon - 210) * k(); if (x0 > W || x0 + 420 * k() < 0) return; fn(off); }); };
        // algunos polÃ­gonos (Fiyi, Chukotka) cruzan los 180Â°: se desenvuelve la longitud para que el trazo no salte de un lado al otro
        var flat = function (r, off) { var prev = null; for (var i = 0; i < r.length; i++) { var lon = r[i][0]; if (prev !== null) { while (lon - prev > 180) lon -= 360; while (lon - prev < -180) lon += 360; } prev = lon;
          var x = W / 2 + (lon + off - view.lon) * k(), y = H / 2 - (r[i][1] - view.lat) * k(); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          if (r.length && Math.abs(prev - r[0][0]) > 300) { var py = H / 2 - ((r[0][1] < 0 ? -90 : 90) - view.lat) * k(); ctx.lineTo(W / 2 + (prev + off - view.lon) * k(), py); ctx.lineTo(W / 2 + (r[0][0] + off - view.lon) * k(), py); } // la AntÃ¡rtida da la vuelta entera: se cierra por el polo
          ctx.closePath(); };
        ctx.beginPath(); copies(function (off) { world.land.forEach(function (poly) { poly.forEach(function (r) { flat(r, off); }); }); }); ctx.fillStyle = landC; ctx.fill("evenodd");
        ctx.beginPath(); copies(function (off) { world.countries.forEach(function (c) { c.polys.forEach(function (poly) { poly.forEach(function (r) { flat(r, off); }); }); }); }); ctx.strokeStyle = border; ctx.lineWidth = .7; ctx.stroke();
        if (opts.labels !== false && view.z >= 2.5) { ctx.font = "11px " + css("--font", "sans-serif"); ctx.fillStyle = dk ? "rgba(236,229,218,.55)" : "rgba(42,37,32,.5)"; ctx.textAlign = "center";
          world.countries.forEach(function (c) { var b = c.bbox; if ((b[2] - b[0]) * k() < 60 || b[2] - b[0] > 180) return; var p = m.proj((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); if (p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H) ctx.fillText(c.name, p[0], p[1]); }); }
      }
      if (opts.onDraw) opts.onDraw(ctx, m);
    }
    function resize() { var r = canvas.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = Math.max(1, r.width); H = Math.max(1, r.height); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); paint(); }
    new ResizeObserver(resize).observe(canvas);

    /* arrastrar, rueda y pellizco */
    var pts = new Map(), last = null, moved = 0;
    canvas.style.touchAction = "none"; canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", function (e) { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); moved = 0; canvas.style.cursor = "grabbing"; });
    canvas.addEventListener("pointermove", function (e) {
      if (!pts.has(e.pointerId)) { if (opts.onHover) opts.onHover(m.unproj(e.offsetX, e.offsetY), e); return; }
      var prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pts.size === 2) { var a = Array.from(pts.values()), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if (last) zoomAt((a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2, d / last); last = d; return; }
      var dx = e.offsetX - prev[0], dy = e.offsetY - prev[1]; moved += Math.abs(dx) + Math.abs(dy);
      view.lon = ((view.lon - dx / k() + 540) % 360) - 180; view.lat += dy / k(); m.draw(); if (opts.onMove) opts.onMove(m);
    });
    var up = function (e) { if (pts.has(e.pointerId) && pts.size === 1 && moved < 5 && opts.onClick) opts.onClick(m.unproj(e.offsetX, e.offsetY), e); pts.delete(e.pointerId); last = null; canvas.style.cursor = "grab"; };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    function zoomAt(x, y, f) { var before = m.unproj(x, y); view.z = Math.max(minZ(), Math.min(40, view.z * f)); var after = m.unproj(x, y); view.lon = ((view.lon + before[0] - after[0] + 540) % 360) - 180; view.lat += before[1] - after[1]; m.draw(); if (opts.onMove) opts.onMove(m); }
    canvas.addEventListener("wheel", function (e) { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    m.zoom = function (f) { zoomAt(W / 2, H / 2, f); };
    new MutationObserver(function () { m.draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-sotos-theme"] });

    resize();
    return cargar().then(function (w) { world = w; m.world = w; m.draw(); return m; }, function (e) { m.error = e; m.draw(); return m; });
  };
})();
