/* ============================================================
   Sotos — PDF propio para las apps de la casa (sin bibliotecas)
   PDF 1.4 con Helvetica y Helvetica-Bold (WinAnsi: tildes, ñ, ¿¡, €), texto con ajuste de línea,
   rectángulos, líneas, imágenes JPEG y varias páginas. Coordenadas en puntos desde arriba a la izquierda.
     const pdf = new SotosPDF({ size: "letter" });   // o "a4"
     pdf.text("Hola", 40, 60, { size: 18, bold: true, color: "#c4532f", align: "left" });
     pdf.rect(40, 80, 200, 1, { fill: "#ddd" }); pdf.image(jpegBytes, 40, 100, 120, 60, wPx, hPx);
     const y = pdf.para("texto largo…", 40, 120, 300, { size: 10 }); pdf.addPage(); pdf.blob()
   © 2026 Sebastian Sotomontes
   ============================================================ */
(function () {
  "use strict";
  // anchos de Helvetica (1/1000 em) para los caracteres 32–126, de las métricas estándar de Adobe
  var HV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  var BASE = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n", "ü": "u", "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ñ": "N", "Ü": "U", "à": "a", "è": "e", "ç": "c", "Ç": "C" };
  var WIN = { "€": 128, "‚": 130, "„": 132, "…": 133, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "™": 153 };
  function code(ch) { var c = ch.charCodeAt(0); if (WIN[ch]) return WIN[ch]; if (c < 256) return c; return 63; }
  function charW(ch, bold) { var t = bold ? HB : HV, c = ch.charCodeAt(0); if (c >= 32 && c <= 126) return t[c - 32]; if (BASE[ch]) return t[BASE[ch].charCodeAt(0) - 32]; if (ch === "€") return 556; if (ch === "¡" || ch === "¿") return bold ? 611 : 333; if (ch === "°") return 400; if (ch === "–") return 556; if (ch === "—") return 1000; return 556; }
  function rgb(hex) { hex = String(hex || "#000").replace("#", ""); if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join(""); return [0, 2, 4].map(function (i) { return (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3); }).join(" "); }
  function esc(s) { var out = ""; for (var i = 0; i < s.length; i++) { var c = code(s[i]); if (c === 40 || c === 41 || c === 92) out += "\\" + String.fromCharCode(c); else if (c < 32 || c > 126) out += "\\" + ("00" + c.toString(8)).slice(-3); else out += String.fromCharCode(c); } return out; }
  var n2 = function (v) { return (Math.round(v * 100) / 100).toString(); };

  function SotosPDF(o) {
    o = o || {}; var s = o.size === "a4" ? [595.28, 841.89] : [612, 792];
    this.W = s[0]; this.H = s[1]; this.pages = []; this.images = []; this.addPage();
  }
  SotosPDF.prototype.addPage = function () { this.cur = []; this.pages.push(this.cur); return this; };
  SotosPDF.prototype.width = function (str, size, bold) { var w = 0; str = String(str); for (var i = 0; i < str.length; i++) w += charW(str[i], bold); return w * (size || 11) / 1000; };
  SotosPDF.prototype.text = function (str, x, y, o) {
    o = o || {}; str = String(str == null ? "" : str); var size = o.size || 11, w = this.width(str, size, o.bold);
    if (o.align === "right") x -= w; else if (o.align === "center") x -= w / 2;
    this.cur.push("BT /" + (o.bold ? "F2" : "F1") + " " + n2(size) + " Tf " + rgb(o.color) + " rg " + n2(x) + " " + n2(this.H - y) + " Td (" + esc(str) + ") Tj ET");
    return w;
  };
  /* párrafo con ajuste de línea; devuelve la y de la línea siguiente */
  SotosPDF.prototype.lines = function (str, maxW, o) {
    o = o || {}; var size = o.size || 11, self = this, out = [];
    String(str == null ? "" : str).split(/\n/).forEach(function (par) { var line = ""; par.split(/\s+/).forEach(function (word) { var t = line ? line + " " + word : word; if (self.width(t, size, o.bold) > maxW && line) { out.push(line); line = word; } else line = t; }); out.push(line); });
    return out;
  };
  SotosPDF.prototype.para = function (str, x, y, maxW, o) { o = o || {}; var lh = (o.size || 11) * (o.lineHeight || 1.35), self = this; this.lines(str, maxW, o).forEach(function (l) { self.text(l, x, y, o); y += lh; }); return y; };
  SotosPDF.prototype.rect = function (x, y, w, h, o) { o = o || {}; var p = n2(x) + " " + n2(this.H - y - h) + " " + n2(w) + " " + n2(h) + " re";
    if (o.fill && o.stroke) this.cur.push(rgb(o.fill) + " rg " + rgb(o.stroke) + " RG " + n2(o.lineWidth || 0.5) + " w " + p + " B");
    else if (o.stroke) this.cur.push(rgb(o.stroke) + " RG " + n2(o.lineWidth || 0.5) + " w " + p + " S"); else this.cur.push(rgb(o.fill || "#000") + " rg " + p + " f"); return this; };
  SotosPDF.prototype.line = function (x1, y1, x2, y2, o) { o = o || {}; this.cur.push(rgb(o.color || "#000") + " RG " + n2(o.width || 0.5) + " w " + n2(x1) + " " + n2(this.H - y1) + " m " + n2(x2) + " " + n2(this.H - y2) + " l S"); return this; };
  /* imagen JPEG (bytes) dibujada en x, y con ancho y alto en puntos */
  SotosPDF.prototype.image = function (bytes, x, y, w, h, pxW, pxH) { var id = "Im" + (this.images.length + 1); this.images.push({ id: id, bytes: bytes, w: pxW, h: pxH }); this.cur.push("q " + n2(w) + " 0 0 " + n2(h) + " " + n2(x) + " " + n2(this.H - y - h) + " cm /" + id + " Do Q"); return this; };
  SotosPDF.prototype.blob = function (meta) {
    meta = meta || {}; var parts = [], offs = [], len = 0, self = this;
    var add = function (s) { var b = typeof s === "string" ? latin1(s) : s; parts.push(b); len += b.length; };
    var obj = function (n, body) { offs[n] = len; add(n + " 0 obj\n"); if (Array.isArray(body)) body.forEach(add); else add(body); add("\nendobj\n"); };
    var np = this.pages.length, ni = this.images.length, first = 5 + ni; // 1 catálogo, 2 páginas, 3-4 fuentes, imágenes, luego página+contenido
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    var kids = []; for (var i = 0; i < np; i++) kids.push((first + i * 2) + " 0 R");
    obj(2, "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + np + " >>");
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    var xo = this.images.map(function (im, k) { obj(5 + k, ["<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.bytes.length + " >>\nstream\n", im.bytes, "\nendstream"]); return "/" + im.id + " " + (5 + k) + " 0 R"; }).join(" ");
    this.pages.forEach(function (p, k) {
      var content = latin1(p.join("\n")), pn = first + k * 2;
      obj(pn, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + n2(self.W) + " " + n2(self.H) + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>" + (xo ? " /XObject << " + xo + " >>" : "") + " >> /Contents " + (pn + 1) + " 0 R >>");
      obj(pn + 1, ["<< /Length " + content.length + " >>\nstream\n", content, "\nendstream"]);
    });
    var infoN = first + np * 2; obj(infoN, "<< /Producer (Sotos) /Title (" + esc(meta.title || "") + ") /Author (" + esc(meta.author || "") + ") >>");
    var xref = len, total = infoN + 1, x = "xref\n0 " + total + "\n0000000000 65535 f \n"; for (var j = 1; j < total; j++) x += ("0000000000" + offs[j]).slice(-10) + " 00000 n \n";
    add(x + "trailer\n<< /Size " + total + " /Root 1 0 R /Info " + infoN + " 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    return new Blob(parts, { type: "application/pdf" });
  };
  function latin1(s) { var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }
  /* convierte una imagen (Blob) a JPEG para el PDF: { bytes, w, h } */
  SotosPDF.jpeg = function (blob, maxPx) {
    return createImageBitmap(blob).then(function (bmp) { var k = Math.min(1, (maxPx || 600) / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (ok) { c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { ok({ bytes: new Uint8Array(ab), w: c.width, h: c.height }); }); }, "image/jpeg", 0.88); }); });
  };
  /* número en letras (pesos colombianos): 1250000 → «un millón doscientos cincuenta mil» */
  SotosPDF.letras = function (n) {
    n = Math.floor(Math.abs(n)); if (n === 0) return "cero";
    var U = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
    var D = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"], C = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
    var cien = function (x) { if (x === 100) return "cien"; var c = Math.floor(x / 100), r = x % 100, s = C[c]; if (r) s += (s ? " " : "") + (r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? " y " + U[r % 10] : "")); return s; };
    var mil = function (x) { var m = Math.floor(x / 1000), r = x % 1000, s = m ? (m === 1 ? "mil" : cien(m) + " mil") : ""; if (r) s += (s ? " " : "") + cien(r); return s; };
    var out = [], mm = Math.floor(n / 1e12), m = Math.floor(n / 1e6) % 1e6, r = n % 1e6;
    if (mm) out.push(mm === 1 ? "un billón" : mil(mm) + " billones");
    if (m) out.push(m === 1 ? "un millón" : mil(m) + " millones");
    if (r) out.push(mil(r));
    return out.join(" ");
  };
  window.SotosPDF = SotosPDF;
})();
