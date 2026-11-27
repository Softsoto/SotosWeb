/* ============================================================
   SOTO en el navegador — cifrado y formato .soto v1, compatible con SOTO de escritorio
   (D:\Sebastian\Proyectos\SOTO, Soto.Core/Format.cs). Sin dependencias: WebCrypto + scrypt propio.

     Cabecera (56 B, en claro y autenticada): "SOTO" · v1 · flags · kdf · log2N · r · p · 0 0
                                              salt[16] · nonce_prefix[8] · chunk u32 BE · verificador[16]
     Clave:  maestra = scrypt(NFC(contraseña), salt, 2^log2N, r, p, 32)
             AES     = HMAC-SHA256(maestra, "SOTO/aes-256-gcm")   verificador = HMAC(maestra, "SOTO/verify")[0..16]
     Cuerpo: bloques AES-256-GCM de «chunk» bytes; nonce = prefijo ‖ índice u32 BE;
             AAD = cabecera ‖ índice u32 BE ‖ final u8
     Flujo:  datos de cada archivo · índice (JSON + zlib) · len u64 BE · "SOTT" · SHA-256(índice)[0..16]

   SotoCrypto.read(bytes, contraseña?) → { encrypted, app, comment, created, entries, extract(entry) }
   SotoCrypto.write([{ name, data, mtime? }], contraseña?, { comment, logN, method }) → Uint8Array
   SotoCrypto.scrypt(pw, salt, N, r, p, dkLen) → Uint8Array (RFC 7914)
   © 2026 Sebastian Sotomontes
   ============================================================ */
(function () {
  "use strict";
  const enc = new TextEncoder(), dec = new TextDecoder();
  const S = crypto.subtle;
  const u8 = (x) => x instanceof Uint8Array ? x : new Uint8Array(x);
  const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
  const hex = (b) => [...u8(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  const sha256 = async (b) => u8(await S.digest("SHA-256", b));
  const hmac = async (key, msg) => u8(await S.sign("HMAC", await S.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), enc.encode(msg)));
  const be32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; };
  const pipe = async (data, stream) => u8(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());

  /* ---------- scrypt (RFC 7914): PBKDF2-SHA256 + ROMix con Salsa20/8 ---------- */
  function salsa8(B, x) {
    x.set(B);
    for (let i = 0; i < 8; i += 2) {
      let t;
      t = x[0] + x[12]; x[4] ^= t << 7 | t >>> 25; t = x[4] + x[0]; x[8] ^= t << 9 | t >>> 23; t = x[8] + x[4]; x[12] ^= t << 13 | t >>> 19; t = x[12] + x[8]; x[0] ^= t << 18 | t >>> 14;
      t = x[5] + x[1]; x[9] ^= t << 7 | t >>> 25; t = x[9] + x[5]; x[13] ^= t << 9 | t >>> 23; t = x[13] + x[9]; x[1] ^= t << 13 | t >>> 19; t = x[1] + x[13]; x[5] ^= t << 18 | t >>> 14;
      t = x[10] + x[6]; x[14] ^= t << 7 | t >>> 25; t = x[14] + x[10]; x[2] ^= t << 9 | t >>> 23; t = x[2] + x[14]; x[6] ^= t << 13 | t >>> 19; t = x[6] + x[2]; x[10] ^= t << 18 | t >>> 14;
      t = x[15] + x[11]; x[3] ^= t << 7 | t >>> 25; t = x[3] + x[15]; x[7] ^= t << 9 | t >>> 23; t = x[7] + x[3]; x[11] ^= t << 13 | t >>> 19; t = x[11] + x[7]; x[15] ^= t << 18 | t >>> 14;
      t = x[0] + x[3]; x[1] ^= t << 7 | t >>> 25; t = x[1] + x[0]; x[2] ^= t << 9 | t >>> 23; t = x[2] + x[1]; x[3] ^= t << 13 | t >>> 19; t = x[3] + x[2]; x[0] ^= t << 18 | t >>> 14;
      t = x[5] + x[4]; x[6] ^= t << 7 | t >>> 25; t = x[6] + x[5]; x[7] ^= t << 9 | t >>> 23; t = x[7] + x[6]; x[4] ^= t << 13 | t >>> 19; t = x[4] + x[7]; x[5] ^= t << 18 | t >>> 14;
      t = x[10] + x[9]; x[11] ^= t << 7 | t >>> 25; t = x[11] + x[10]; x[8] ^= t << 9 | t >>> 23; t = x[8] + x[11]; x[9] ^= t << 13 | t >>> 19; t = x[9] + x[8]; x[10] ^= t << 18 | t >>> 14;
      t = x[15] + x[14]; x[12] ^= t << 7 | t >>> 25; t = x[12] + x[15]; x[13] ^= t << 9 | t >>> 23; t = x[13] + x[12]; x[14] ^= t << 13 | t >>> 19; t = x[14] + x[13]; x[15] ^= t << 18 | t >>> 14;
    }
    for (let i = 0; i < 16; i++) B[i] = B[i] + x[i] | 0;
  }
  function blockMix(B, Y, r, X, x) { // B, Y: 32r palabras
    X.set(B.subarray((2 * r - 1) * 16, 2 * r * 16));
    for (let i = 0; i < 2 * r; i++) { for (let k = 0; k < 16; k++) X[k] ^= B[i * 16 + k]; salsa8(X, x); Y.set(X, (i % 2 ? r + (i >> 1) : i >> 1) * 16); }
  }
  async function scrypt(pw, salt, N, r, p, dkLen, onProgress) {
    if (N < 2 || (N & (N - 1))) throw new Error("scrypt: N debe ser potencia de 2");
    const pwKey = await S.importKey("raw", u8(pw), "PBKDF2", false, ["deriveBits"]);
    const B = u8(await S.deriveBits({ name: "PBKDF2", salt: u8(salt), iterations: 1, hash: "SHA-256" }, pwKey, p * 128 * r * 8));
    const W = 32 * r, V = new Uint32Array(W * N), Xw = new Uint32Array(W), Yw = new Uint32Array(W), T = new Uint32Array(16), tmp = new Uint32Array(16);
    const dv = new DataView(B.buffer);
    for (let k = 0; k < p; k++) {
      for (let i = 0; i < W; i++) Xw[i] = dv.getUint32(k * 128 * r + i * 4, true);
      for (let i = 0; i < N; i++) { V.set(Xw, i * W); blockMix(Xw, Yw, r, T, tmp); Xw.set(Yw); if (onProgress && (i & 4095) === 0) { onProgress((k * 2 * N + i) / (2 * N * p)); await new Promise(z => setTimeout(z)); } }
      for (let i = 0; i < N; i++) { const j = Xw[(2 * r - 1) * 16] & (N - 1); for (let q = 0; q < W; q++) Xw[q] ^= V[j * W + q]; blockMix(Xw, Yw, r, T, tmp); Xw.set(Yw); if (onProgress && (i & 4095) === 0) { onProgress((k * 2 * N + N + i) / (2 * N * p)); await new Promise(z => setTimeout(z)); } }
      for (let i = 0; i < W; i++) dv.setUint32(k * 128 * r + i * 4, Xw[i], true);
    }
    return u8(await S.deriveBits({ name: "PBKDF2", salt: B, iterations: 1, hash: "SHA-256" }, pwKey, dkLen * 8));
  }

  /* ---------- cabecera y claves ---------- */
  const HEAD = 56;
  function parseHeader(b) {
    if (b.length < HEAD || dec.decode(b.subarray(0, 4)) !== "SOTO") throw new Error("No es un archivo .soto válido.");
    if (b[4] !== 1) throw new Error("Versión de formato .soto no soportada: " + b[4]);
    const dv = new DataView(b.buffer, b.byteOffset); const h = { flags: b[5], kdf: b[6], logN: b[7], r: b[8], p: b[9], salt: b.slice(12, 28), prefix: b.slice(28, 36), chunk: dv.getUint32(36), verifier: b.slice(40, 56), raw: b.slice(0, HEAD) };
    h.encrypted = (h.flags & 1) === 1;
    if (h.chunk < 4096 || h.chunk > 64 << 20) throw new Error("Tamaño de bloque inválido en la cabecera.");
    if (h.encrypted && (h.kdf !== 1 || h.logN < 10 || h.logN > 22 || h.r < 1 || h.r > 32 || h.p < 1 || h.p > 16)) throw new Error("Parámetros de clave inválidos.");
    return h;
  }
  async function keys(password, h, onProgress) {
    const master = await scrypt(enc.encode(String(password).normalize("NFC")), h.salt, 1 << h.logN, h.r, h.p, 32, onProgress);
    const raw = await hmac(master, "SOTO/aes-256-gcm"), ver = (await hmac(master, "SOTO/verify")).slice(0, 16); master.fill(0);
    return { key: await S.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]), ver };
  }
  const nonceOf = (h, i) => cat(h.prefix, be32(i));
  const aadOf = (h, i, final) => cat(h.raw, be32(i), new Uint8Array([final ? 1 : 0]));

  /* ---------- leer ---------- */
  async function read(bytes, password, onProgress) {
    const b = u8(bytes), h = parseHeader(b); let logical;
    if (h.encrypted) {
      if (!password) throw Object.assign(new Error("Este archivo está cifrado: escribe la contraseña."), { code: "password" });
      const { key, ver } = await keys(password, h, onProgress);
      if (hex(ver) !== hex(h.verifier)) throw Object.assign(new Error("Contraseña incorrecta."), { code: "password" });
      const body = b.subarray(HEAD), per = h.chunk + 16, count = Math.ceil(body.length / per); if (!count) throw new Error("El archivo está truncado.");
      const parts = [];
      for (let i = 0; i < count; i++) {
        const c = body.subarray(i * per, Math.min(body.length, (i + 1) * per));
        try { parts.push(u8(await S.decrypt({ name: "AES-GCM", iv: nonceOf(h, i), additionalData: aadOf(h, i, i === count - 1), tagLength: 128 }, key, c))); }
        catch { throw new Error("El archivo fue modificado o está dañado (falló la autenticación AES-GCM)."); }
      }
      logical = cat(...parts);
    } else logical = b.subarray(HEAD);
    if (logical.length < 28) throw new Error("El archivo está truncado.");
    const tr = logical.subarray(logical.length - 28), tdv = new DataView(tr.buffer, tr.byteOffset);
    const tocLen = Number(tdv.getBigUint64(0)); if (dec.decode(tr.subarray(8, 12)) !== "SOTT" || tocLen > logical.length - 28) throw new Error("No se encontró el índice del archivo.");
    const tocRaw = logical.subarray(logical.length - 28 - tocLen, logical.length - 28);
    if (hex((await sha256(tocRaw)).slice(0, 16)) !== hex(tr.subarray(12, 28))) throw new Error("El índice del archivo está dañado.");
    const toc = JSON.parse(dec.decode(await pipe(tocRaw, new DecompressionStream("deflate"))));
    if (toc.v > 2) throw new Error("Este .soto usa una versión de índice más nueva (" + toc.v + ").");
    const blocks = toc.blocks || [], cache = new Map();
    const unpack = async (m, data) => {
      if (m === "store") return data;
      if (m === "deflate") return pipe(data, new DecompressionStream("deflate-raw"));
      throw Object.assign(new Error(`Comprimido con ${({ zstd: "Zstandard", brotli: "Brotli", sotom: "SOTO-M" })[m] || m}: ábrelo en SOTO de escritorio`), { code: "method" });
    };
    // en un bloque sólido, el comprimido de cada archivo es su parte proporcional del bloque (igual que SOTO de escritorio)
    const packedOf = (e) => e.m === "solid" && blocks[e.b] ? (blocks[e.b].s > 0 ? Math.round((e.s || 0) * blocks[e.b].c / blocks[e.b].s) : 0) : e.c || 0;
    const entries = (toc.entries || []).map(e => ({ name: e.n, dir: e.d === 1, size: e.s || 0, packed: packedOf(e), method: e.m === "solid" ? (blocks[e.b]?.m || "?") : (e.m || "store"), hash: e.h || "", time: e.t ? new Date(e.t * 1000) : null, _e: e }));
    return {
      encrypted: h.encrypted, app: toc.app || "", comment: toc.comment || "", created: toc.created ? new Date(toc.created * 1000) : null, entries,
      supported: (en) => ["store", "deflate"].includes(en.method),
      async extract(en) {
        const e = en._e; let data;
        if (e.d === 1) return new Uint8Array(0);
        if (e.m === "solid") { const bl = blocks[e.b]; if (!cache.has(e.b)) cache.set(e.b, await unpack(bl.m, logical.subarray(bl.o, bl.o + bl.c))); data = cache.get(e.b).subarray(e.o, e.o + e.s); }
        else data = await unpack(e.m || "store", logical.subarray(e.o, e.o + e.c));
        if (data.length !== (e.s || 0) || (e.h && hex(await sha256(data)) !== e.h)) throw new Error(`Verificación fallida en «${e.n}»: el contenido no coincide.`);
        return data;
      },
    };
  }

  /* ---------- escribir (deflate por archivo, índice v1) ---------- */
  async function write(files, password, o = {}) {
    const method = o.method === "store" ? "store" : "deflate", parts = [], entries = []; let off = 0;
    for (const f of files) {
      const raw = u8(f.data instanceof Blob ? await f.data.arrayBuffer() : f.data), name = String(f.name).replace(/\\/g, "/").replace(/^\/+/, "");
      let data = method === "deflate" ? await pipe(raw, new CompressionStream("deflate-raw")) : raw, m = method;
      if (m === "deflate" && data.length >= raw.length) { data = raw; m = "store"; } // no ganó nada: se guarda tal cual
      entries.push({ n: name, s: raw.length, c: data.length, o: off, m, t: (f.mtime || Date.now()) / 1000, h: hex(await sha256(raw)) }); parts.push(data); off += data.length;
    }
    const toc = { v: 1, app: o.app || "SOTO web (Sotos)", created: Date.now() / 1000, comment: o.comment || "", entries };
    const tocRaw = await pipe(enc.encode(JSON.stringify(toc)), new CompressionStream("deflate"));
    const trailer = new Uint8Array(28), tdv = new DataView(trailer.buffer); tdv.setBigUint64(0, BigInt(tocRaw.length)); trailer.set(enc.encode("SOTT"), 8); trailer.set((await sha256(tocRaw)).slice(0, 16), 12);
    const logical = cat(...parts, tocRaw, trailer);
    const head = new Uint8Array(HEAD), hdv = new DataView(head.buffer); head.set(enc.encode("SOTO")); head[4] = 1;
    const chunk = 1 << 20; hdv.setUint32(36, chunk);
    if (!password) { head[5] = 0; return cat(head, logical); }
    const logN = Math.max(10, Math.min(22, o.logN || 16));
    head[5] = 1; head[6] = 1; head[7] = logN; head[8] = 8; head[9] = 1;
    const h = { salt: crypto.getRandomValues(new Uint8Array(16)), prefix: crypto.getRandomValues(new Uint8Array(8)), logN, r: 8, p: 1 };
    head.set(h.salt, 12); head.set(h.prefix, 28);
    const { key, ver } = await keys(password, h, o.onProgress); head.set(ver, 40); h.raw = head;
    const count = Math.max(1, Math.ceil(logical.length / chunk)), out = [head];
    for (let i = 0; i < count; i++) out.push(u8(await S.encrypt({ name: "AES-GCM", iv: nonceOf(h, i), additionalData: aadOf(h, i, i === count - 1), tagLength: 128 }, key, logical.subarray(i * chunk, (i + 1) * chunk))));
    return cat(...out);
  }

  /* el cifrado del navegador (WebCrypto) solo existe con HTTPS o en el propio equipo (localhost) */
  const available = !!(globalThis.crypto && crypto.subtle);
  const need = (fn) => async (...a) => { if (!available) throw Object.assign(new Error("El cifrado solo funciona cuando entras a Sotos con HTTPS o desde el mismo equipo (localhost). Por una dirección http:// de la red, el navegador no lo permite."), { code: "insecure" }); return fn(...a); };
  window.SotoCrypto = { available, read: need(read), write: need(write), scrypt: need(scrypt), sha256hex: need(async (b) => hex(await sha256(u8(b)))) };
})();
