import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Sotos OS — © 2026 Sebastian Sotomontes
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    // el backend (proxy, cuentas, archivos) corre en :8787 durante el desarrollo
    proxy: { "/api": "http://localhost:8787", "/px": "http://localhost:8787", "/dav": "http://localhost:8787", "/jellyfin": { target: "http://localhost:8787", ws: true } },
  },
});
