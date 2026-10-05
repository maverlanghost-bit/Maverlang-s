import { defineConfig } from "@playwright/test";

const port = 3456;
const baseURL = `http://127.0.0.1:${port}`;

/** `npm run e2e` sirve el build (`next start`) y lo cierra al terminar. Hace falta `npm run build` antes. */
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
    env: {
      DATA_MODE: "mock",
      NEXT_PUBLIC_DATA_MODE: "mock",
    },
  },
});
