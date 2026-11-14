/* ============================================================
   Sotos OS — servidor
   © 2026 Sebastian Sotomontes

   :8787  /api/*  -> API (cuentas, archivos… próximas fases)
          resto   -> proxy del Navegador (px.mjs)
   En producción el proxy debe vivir en un subdominio propio
   (p. ej. px.tudominio) para aislarlo del escritorio.
   ============================================================ */
import http from "node:http";
import { handleProxy } from "./px.mjs";

const PORT = Number(process.env.PORT || 8787);

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      return res.end(JSON.stringify({ ok: true, name: "Sotos OS", by: "Sebastian Sotomontes" }));
    }
    if (req.url === "/favicon.ico" && !(req.headers.referer || "").includes("/px/")) { res.writeHead(204); return res.end(); }
    await handleProxy(req, res);
  } catch (e) {
    console.error("[sotos]", req.method, req.url, e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Error interno");
  }
});

server.listen(PORT, () => console.log(`[sotos] servidor en http://localhost:${PORT}`));
