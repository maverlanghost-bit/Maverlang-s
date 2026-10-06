/**
 * Construye y corre Playwright siempre con auth mock.
 * `next build` incrusta `NEXT_PUBLIC_*`. El process env gana sobre `.env.local`.
 * `NEXT_DIST_DIR=.next-e2e` no pisa `.next` del dev.
 *
 * Uso: node scripts/e2e.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === "string") env[key] = value;
}
env.AUTH_MODE = "mock";
env.NEXT_PUBLIC_AUTH_MODE = "mock";
env.NEXT_DIST_DIR = ".next-e2e";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(" ")} terminó con código ${code ?? "null"}`));
    });
  });
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");

await run([nextBin, "build"]);
await run([playwrightCli, "test"]);
