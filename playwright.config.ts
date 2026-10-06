import { defineConfig } from "@playwright/test";

const port = 3456;
const baseURL = `http://127.0.0.1:${port}`;
const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next-e2e";

function serverEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  const authE2e = process.env.E2E_AUTH?.trim() === "supabase";
  env.DATA_MODE = "mock";
  env.NEXT_PUBLIC_DATA_MODE = "mock";
  env.AUTH_MODE = authE2e ? "supabase" : "mock";
  env.NEXT_PUBLIC_AUTH_MODE = authE2e ? "supabase" : "mock";
  env.NEXT_DIST_DIR = distDir;
  return env;
}

/**
 * `npm run e2e` construye con auth mock (`scripts/e2e.mjs`) y sirve ese build.
 * `npm run e2e:auth` pone `E2E_AUTH=supabase` y usa `.next-e2e-auth`.
 * `NEXT_PUBLIC_*` se incrusta en el build: el process env gana sobre `.env.local`.
 * El distDir es `.next-e2e` para no pisar `.next` del dev.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    locale: "es-CL",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next start -H 127.0.0.1 -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: serverEnv(),
  },
});
