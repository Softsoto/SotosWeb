/* ============================================================
   Sotos — cliente S3 mínimo (Backblaze B2, Cloudflare R2, Wasabi, AWS S3, MinIO…)
   Firma AWS Signature v4 propia, sin dependencias ni base de datos (lo usan la copia
   fuera del servidor y el script de restauración).
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import fs from "node:fs";
/* ---------------- S3 (firma v4) ---------------- */
const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();
const hex = (b) => crypto.createHash("sha256").update(b).digest("hex");
const encKey = (k) => k.split("/").map(encodeURIComponent).join("/");
/** firma AWS Signature v4 (la cabecera Authorization) */
export function sigV4({ method, pathname, qs = "", headers, payload, region, accessKey, secretKey, amz }) {
  const day = amz.slice(0, 8), lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, " ")]));
  const names = Object.keys(lower).sort();
  const canon = [method, pathname, qs, names.map(n => `${n}:${lower[n]}`).join("\n") + "\n", names.join(";"), payload].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", amz, scope, hex(canon)].join("\n");
  const sk = hmac(hmac(hmac(hmac("AWS4" + secretKey, day), region), "s3"), "aws4_request");
  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${crypto.createHmac("sha256", sk).update(sts).digest("hex")}`;
}
/** c = { endpoint, region, bucket, accessKey, secret } */
export function s3client(c) {
  const secretKey = c.secret; const u = new URL(c.endpoint);
  const vhost = /amazonaws\.com$/i.test(u.hostname); // AWS: bucket en el nombre; el resto: en la ruta
  const host = vhost ? `${c.bucket}.${u.host}` : u.host, base = vhost ? "" : "/" + c.bucket;
  async function req(method, key = "", { query = {}, body = null, headers = {}, stream = null, length = 0 } = {}) {
    const t = new Date(), amz = t.toISOString().replace(/[-:]|\.\d{3}/g, ""), day = amz.slice(0, 8);
    const pathname = base + "/" + encKey(key); const qs = Object.keys(query).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join("&");
    const payload = stream ? "UNSIGNED-PAYLOAD" : hex(body || "");
    const h = { host, "x-amz-date": amz, "x-amz-content-sha256": payload, ...headers }; if (stream) h["content-length"] = String(length); else if (body) h["content-length"] = String(Buffer.byteLength(body));
    h.authorization = sigV4({ method, pathname, qs, headers: h, payload, region: c.region, accessKey: c.accessKey, secretKey, amz });
    delete h.host;
    const r = await fetch(`${u.protocol}//${host}${pathname}${qs ? "?" + qs : ""}`, { method, headers: h, body: stream || body || undefined, duplex: stream ? "half" : undefined, signal: AbortSignal.timeout(stream ? 3600_000 : 60_000) });
    if (!r.ok && !(method === "DELETE" && r.status === 404)) { const t2 = await r.text().catch(() => ""); const code = /<Code>([^<]+)/.exec(t2)?.[1], msg = /<Message>([^<]+)/.exec(t2)?.[1]; throw new Error(`El almacenamiento respondió ${r.status}${code ? " " + code : ""}${msg ? ": " + msg : ""}`); }
    return r;
  }
  return {
    put: (k, file) => { const size = fs.statSync(file).size; return req("PUT", k, { stream: fs.createReadStream(file), length: size }); },
    putText: (k, text, type = "application/json") => req("PUT", k, { body: text, headers: { "content-type": type } }),
    get: async (k) => (await req("GET", k)).text(),
    getStream: (k) => req("GET", k),
    del: (k) => req("DELETE", k),
    async list(prefix) { const out = new Map(); let token = null;
      do { const q = { "list-type": "2", prefix, "max-keys": "1000" }; if (token) q["continuation-token"] = token;
        const x = await (await req("GET", "", { query: q })).text();
        for (const m of x.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) { const k = /<Key>([^<]+)/.exec(m[1])?.[1]; const sz = Number(/<Size>(\d+)/.exec(m[1])?.[1] || 0); if (k) out.set(k.replace(/&amp;/g, "&"), sz); }
        token = /<IsTruncated>true<\/IsTruncated>/.test(x) ? /<NextContinuationToken>([^<]+)/.exec(x)?.[1] : null; } while (token);
      return out; },
  };
}

