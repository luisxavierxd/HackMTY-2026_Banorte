import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El sitio vive en la raíz cuando hay custom domain (banky.mx) y en un subpath
// cuando se cae al fallback de Pages. Se lee de env para poder cambiarlo sin
// editar código el día que venza el dominio (~sep-2027, ver README §dominio):
//   VITE_BASE=/HackMTY-2026_Banorte/ npm run build
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
      "/a2ui": "http://127.0.0.1:8080",
      "/v1": "http://127.0.0.1:8080",
      "/readyz": "http://127.0.0.1:8080",
      "/healthz": "http://127.0.0.1:8080",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
