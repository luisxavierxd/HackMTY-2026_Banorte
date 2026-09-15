import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Por defecto `node`: los goldens y el motor grabado no tocan el DOM y
    // corren en milisegundos. Solo los tests de UI pagan el costo de jsdom,
    // vía el comentario `@vitest-environment jsdom` en su cabecera.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
