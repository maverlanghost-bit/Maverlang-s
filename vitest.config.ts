import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Varios tests importan rutas de la app (compilación TS) o tocan el árbol de
    // archivos (scan-secrets): en una PC con 8 GB de RAM eso supera los 5 s por
    // defecto de vitest y marcaba timeout aunque la lógica fuera correcta.
    // 20 s deja margen real sin esconder tests verdaderamente colgados.
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.join(root, "node_modules", "server-only", "empty.js"),
    },
  },
});
