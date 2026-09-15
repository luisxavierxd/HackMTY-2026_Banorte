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
    // Por default Vite bindea `localhost`, que en Windows resuelve a ::1
    // (IPv6) y deja `http://127.0.0.1:5173` sin escuchar — conexión rechazada,
    // no 404. Confunde de más aquí, porque el gate de la app le pide a la
    // persona que use `127.0.0.1` (para el harness), así que es lo primero que
    // teclea. Bindear todas las interfaces sirve las dos loopback.
    //
    // OJO: esto también expone el server de desarrollo a la red local. Es el
    // comportamiento de `vite --host` y no hay secretos del lado del server
    // (no hay backend), pero en una red que no controles, quítalo.
    host: true,
    allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
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
