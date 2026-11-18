/* ============================================================
   Sotos OS — integración con ONLYOFFICE Docs (Word / Excel / PowerPoint)
   © 2026 Sebastian Sotomontes

   Variables:
     OO_URL           URL pública del Document Server (la carga el navegador), p. ej. https://office.midominio
     OO_INTERNAL      URL con la que el servidor de Sotos descarga lo guardado (por defecto OO_URL)
     SOTOS_INTERNAL   URL con la que ONLYOFFICE llega a Sotos (p. ej. http://sotos:8787 en Docker)
     SOTOS_OO_JWT     secreto compartido (si no, se genera en data/secrets.json)
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { secret } from "./db.mjs";
import { fail, json, readJson, jwtSign, jwtVerify } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { loadState, blobPath, applyOps, userNode, snapshotVersion } from "./fs.mjs";
import { resolveShare } from "./shares.mjs";
import { index } from "../web/src/os/tree-ops.js";

const OO_URL = (process.env.OO_URL || "").replace(/\/$/, "");
const OO_INTERNAL = (process.env.OO_INTERNAL || OO_URL).replace(/\/$/, "");
const SOTOS_INTERNAL = (process.env.SOTOS_INTERNAL || "http://host.docker.internal:8787").replace(/\/$/, "");
const KEY = () => secret("oo_jwt");
const DOC_TYPE = { docx: "word", doc: "word", odt: "word", rtf: "word", txt: "word", xlsx: "cell", xls: "cell", ods: "cell", csv: "cell", pptx: "slide", ppt: "slide", odp: "slide" };
const extOf = (n) => (/\.([^.]+)$/.exec(n) || [])[1]?.toLowerCase() || "";
export const ooEnabled = () => !!OO_URL;

export async function handleOO(req, res, parts) {
  const [a] = parts;
  if (a === "status") return json(res, 200, { enabled: ooEnabled(), url: OO_URL || null, engine: /euro/i.test(process.env.OO_ENGINE || "") ? "Euro-Office" : "ONLYOFFICE" });
  if (!ooEnabled()) fail(503, "ONLYOFFICE no está configurado en este servidor");

  // configuración firmada para abrir un documento (propio o compartido con permiso)
  if (a === "config" && req.method === "POST") {
    const user = requireUser(req);
    const { nodeId, share } = await readJson(req, 4096);
    let owner = user.id, canEdit = true, node;
    if (share) {
      const r = resolveShare(String(share), req);
      node = index(r.node).get(nodeId)?.node; owner = r.s.user_id; canEdit = r.s.perm === "edit";
    } else node = userNode(user.id, nodeId);
    if (!node || node.children) fail(404, "No existe");
    const ext = extOf(node.name); const documentType = DOC_TYPE[ext];
    if (!documentType) fail(415, "ONLYOFFICE no abre este tipo de archivo");
    const fileTok = jwtSign({ u: owner, n: node.id }, KEY(), 3600 * 12);
    const cbTok = jwtSign({ u: owner, n: node.id, by: user.id }, KEY(), 3600 * 48);
    const config = {
      documentType,
      document: {
        fileType: ext, title: node.name,
        key: `${node.id}-${(node.mtime || 0).toString(36)}-${(node.size || 0).toString(36)}`,
        url: `${SOTOS_INTERNAL}/api/oo/file?t=${fileTok}`,
        permissions: { edit: canEdit, download: true, print: true, comment: canEdit, review: canEdit },
      },
      editorConfig: {
        callbackUrl: `${SOTOS_INTERNAL}/api/oo/callback?t=${cbTok}`,
        lang: "es", region: "es-ES", mode: canEdit ? "edit" : "view",
        user: { id: user.id, name: user.name },
        customization: { autosave: true, forcesave: true, compactHeader: true, toolbarNoTabs: false, uiTheme: "theme-classic-light", goback: false, about: true, feedback: false },
      },
    };
    config.token = jwtSign(config, KEY(), 3600 * 12);
    return json(res, 200, { config, url: OO_URL });
  }

  // el Document Server descarga el archivo
  if (a === "file" && req.method === "GET") {
    const t = jwtVerify(new URL(req.url, "http://x").searchParams.get("t"), KEY());
    const p = blobPath(t.u, t.n);
    if (!fs.existsSync(p)) fail(404, "Sin contenido");
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": fs.statSync(p).size });
    return pipeline(fs.createReadStream(p), res);
  }

  // el Document Server avisa de que hay una versión nueva
  if (a === "callback" && req.method === "POST") {
    const t = jwtVerify(new URL(req.url, "http://x").searchParams.get("t"), KEY());
    let body = await readJson(req, 1024 * 1024);
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (body.token) body = jwtVerify(body.token, KEY());            // JWT en el cuerpo
    else if (bearer) body = jwtVerify(bearer, KEY()).payload || body; // o en la cabecera
    else fail(401, "Falta la firma de ONLYOFFICE");
    if ((body.status === 2 || body.status === 6) && body.url) {
      const src = new URL(body.url);
      const allowed = [OO_URL, OO_INTERNAL].filter(Boolean).map(u => new URL(u).host);
      if (!allowed.includes(src.host)) fail(400, "Origen de descarga no permitido");
      const fetchUrl = OO_INTERNAL && src.host !== new URL(OO_INTERNAL).host ? OO_INTERNAL + src.pathname + src.search : body.url;
      const r = await fetch(fetchUrl, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) fail(502, "No se pudo descargar la versión guardada");
      const p = blobPath(t.u, t.n); const tmp = p + ".oo-" + process.pid;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      await pipeline(r.body, fs.createWriteStream(tmp));
      try { snapshotVersion(t.u, t.n); } catch {} // la versión anterior queda en el historial
      fs.renameSync(tmp, p);
      if (userNode(t.u, t.n)) applyOps(t.u, [{ t: "write", id: t.n, size: fs.statSync(p).size, mtime: Date.now() }], "onlyoffice");
    }
    return json(res, 200, { error: 0 });
  }
  fail(404, "No encontrado");
}
