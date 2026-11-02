import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    linterOptions: {
      // Un `eslint-disable` que ya no silencia nada debe fallar, no quedar olvidado.
      reportUnusedDisableDirectives: "error",
    },
  },
  globalIgnores([
    // Build, typegen y mediciones de Next. `.next-*/**` cubre las variantes
    // (`.next-perf`, `.next-e2e`, `.next-verify`, …) que copian el árbol y
    // generan chunks/typegen: no son código fuente y no deben lintarse.
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    // Artefactos de pruebas y cobertura.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "docs/**",
  ]),
]);

export default eslintConfig;
