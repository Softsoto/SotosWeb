// Lector de .zip mínimo para el navegador (almacenado o deflate, con DecompressionStream)
// © 2026 Sebastian Sotomontes · MIT
window.leerZip = async function (blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
  let fin = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("No es un archivo .zip/.epub válido");
  const n = dv.getUint16(fin + 10, true); let p = dv.getUint32(fin + 16, true); const entradas = new Map(), dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const metodo = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nombre = dec.decode(buf.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    entradas.set(nombre, { metodo, comp, off });
  }
  const datos = async (nombre) => {
    const e = entradas.get(nombre); if (!e) return null;
    const lnl = dv.getUint16(e.off + 26, true), lxl = dv.getUint16(e.off + 28, true), ini = e.off + 30 + lnl + lxl, crudo = buf.subarray(ini, ini + e.comp);
    if (e.metodo === 0) return crudo;
    if (e.metodo !== 8) throw new Error("Compresión no soportada en " + nombre);
    return new Uint8Array(await new Response(new Blob([crudo]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  };
  return { nombres: [...entradas.keys()], datos, texto: async (n) => { const d = await datos(n); return d ? dec.decode(d) : null; } };
};
