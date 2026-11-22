import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  findBundleSecrets,
  findWorktreeSecrets,
  isServiceRoleJwt,
  maskSecret,
} from "../../scripts/scan-secrets.mjs";
import { supabaseRefOf } from "../../scripts/project-guard.mjs";

const ROOT = path.resolve(__dirname, "..", "..");

// El prefijo se arma por partes: el fuente nunca contiene el patrón contiguo.
const SB_PREFIX = ["sb", "secret"].join("_") + "_";
const PUB_PREFIX = ["sb", "publishable"].join("_") + "_";

function base64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function unsignedJwt(payload: unknown): string {
  return `${base64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${base64Url(JSON.stringify(payload))}.firmalarga1234`;
}

describe("M46: escáner de secretos", () => {
  it("detecta una clave de Supabase en el árbol, enmascarada", () => {
    const secret = SB_PREFIX + "abcdefghijklmnop";
    const findings = findWorktreeSecrets(`key=${secret}`, "lib/x.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0].name).toBe("sb_secret");
    const line = `SECRETO ${findings[0].name} lib/x.ts:1 ${maskSecret(findings[0].match)}`;
    expect(line).toContain("sb_sec…");
    expect(line).not.toContain(secret);
  });

  it("el escáner nunca expone el valor completo (sólo 6 + …)", () => {
    const secret = SB_PREFIX + "abcdefghijklmnop";
    expect(maskSecret(secret)).toBe(secret.slice(0, 6) + "…");
    expect(maskSecret(secret)).not.toContain(secret.slice(6));
  });

  it("el `sb_publishable_` del .env.example no es hallazgo; fuera sí", () => {
    const key = PUB_PREFIX + "abcdefghijklmnop";
    expect(findWorktreeSecrets(`K=${key}`, ".env.example")).toEqual([]);
    expect(findWorktreeSecrets(`K=${key}`, "lib/x.ts")).toHaveLength(1);
  });

  it("en el bundle, el prefijo suelto de supabase-js no es hallazgo", () => {
    // Bare prefix, como el `startsWith` dentro de `@supabase/supabase-js`.
    const chunk = `if(key.indexOf("sb_"+"secret_")===0){pivot=true}`;
    expect(findBundleSecrets(chunk)).toEqual([]);
    const withKey = `var k="${SB_PREFIX}${"a".repeat(20)}";`;
    const findings = findBundleSecrets(withKey);
    expect(findings.some((f) => f.name === "sb_secret")).toBe(true);
  });

  it("en el bundle, un JWT sólo cuenta con rol de servicio", () => {
    const service = unsignedJwt({ role: "service_role", sub: "x" });
    expect(isServiceRoleJwt(service)).toBe(true);
    expect(findBundleSecrets(`token="${service}"`)).toHaveLength(1);
    const user = unsignedJwt({ role: "authenticated", sub: "y" });
    expect(isServiceRoleJwt(user)).toBe(false);
    expect(findBundleSecrets(`token="${user}"`)).toEqual([]);
  });

  it("detecta JWT, llave privada, arreglo Solana, resend, stripe, slack y AWS", () => {
    const jwt = unsignedJwt({ sub: "prueba-larga", exp: 9999999999 });
    expect(findWorktreeSecrets(`t=${jwt}`, "a.ts").some((f) => f.name === "jwt")).toBe(true);
    // Los valores se arman por partes: el fuente nunca trae el patrón contiguo.
    const begin = "-----BEGIN " + "PRIVATE KEY-----";
    expect(findWorktreeSecrets(`k=${begin}`, "a.ts").some((f) => f.name === "private-key")).toBe(true);
    const arr = `[${Array.from({ length: 64 }, (_, i) => i % 250).join(",")}]`;
    expect(findWorktreeSecrets(`k=${arr}`, "a.ts").some((f) => f.name === "solana-key-array")).toBe(true);
    const resend = "re_" + "abcdefghij" + "1234567890";
    expect(findWorktreeSecrets(`k=${resend}`, "a.ts").some((f) => f.name === "resend")).toBe(true);
    const stripe = "sk_" + "live_" + "abcdefghij1234";
    expect(findWorktreeSecrets(`k=${stripe}`, "a.ts").some((f) => f.name === "stripe-live")).toBe(true);
    const slack = "xox" + "b-123456789012";
    expect(findWorktreeSecrets(`k=${slack}`, "a.ts").some((f) => f.name === "slack")).toBe(true);
    const aws = "AKIA" + "IOSFODNN7EXAMPLE";
    expect(findWorktreeSecrets(`k=${aws}`, "a.ts").some((f) => f.name === "aws-key")).toBe(true);
  });

  it("un archivo temporal con clave se detecta y el repo sigue limpio", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "scan-"));
    const secret = SB_PREFIX + "abcdefghijklmnop";
    writeFileSync(path.join(dir, "probe.txt"), `SUPABASE=${secret}\n`, "utf8");
    const findings = findWorktreeSecrets(readFileSync(path.join(dir, "probe.txt"), "utf8"), "probe.txt");
    expect(findings).toHaveLength(1);
    expect(maskSecret(findings[0].match)).toBe("sb_sec…");
    // El árbol versionado real sale con 0 (criterio de aceptación).
    const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", "scan-secrets.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
    });
    expect(out).toContain("scan:secrets: limpio.");
    expect(out).not.toContain(secret);
  }, 120_000);

  it("project-guard: sólo imprime el ref, nunca valores", () => {
    expect(supabaseRefOf("https://abcdefgh1234.supabase.co")).toBe("abcdefgh1234");
    expect(supabaseRefOf("no-es-url")).toBeNull();
  });
});

describe("OPS-7: patrones nuevos del escáner", () => {
  // Los valores se arman en runtime: el fuente nunca los trae contiguos.
  const real = ["Zq8", "Lm2", "Xv9", "Tp4", "Rk7"].join("");
  const scan = (text: string, file = "lib/x.ts") => findWorktreeSecrets(text, file).map((f) => f.name);

  it("detecta asignaciones de secretos con valor real", () => {
    for (const name of [
      "UPSTASH_REDIS_REST_TOKEN",
      "PRIVY_APP_SECRET",
      "JUPITER_API_KEY",
      "CRON_SECRET",
      "REVALIDATE_SECRET",
      "FRACCION_REVALIDATE_SECRET",
      "DEMO_TOKEN_SECRET",
      "SHARE_SIGNING_SECRET",
      "ONRAMP_WEBHOOK_SECRET",
      "COPY_PLAN_HMAC_SECRET",
    ]) {
      expect(scan(`${name}=${real}`, "docs/x.md"), name).toEqual([`env-assign:${name}`]);
    }
  });

  it("ignora vacíos, placeholders y código", () => {
    for (const value of ['""', "***", "<tu-secreto>", "xxx", "changeme", "", "${{ secrets.X }}", "optionalText()"]) {
      expect(scan(`CRON_SECRET=${value}`, "docs/x.md"), value).toEqual([]);
    }
    expect(scan("CRON_SECRET: optionalText(),", "lib/env.ts")).toEqual([]);
  });

  it("no marca .env.example ni tests", () => {
    expect(scan(`CRON_SECRET=${real}`, ".env.example")).toEqual([]);
    expect(scan(`CRON_SECRET=${real}`, "tests/unit/a.test.ts")).toEqual([]);
  });

  it("detecta api-key en query con valor real y no con placeholder", () => {
    expect(scan(`https://rpc.test/?api-key=${real}`)).toEqual(["api-key-param"]);
    expect(scan(`https://rpc.test/?apikey=${real}&x=1`)).toEqual(["api-key-param"]);
    expect(scan("https://rpc.test/?api_key=<TU_CLAVE>")).toEqual([]);
    expect(scan("https://rpc.test/?api-key=")).toEqual([]);
  });

  it("detecta base58 de 87-88 caracteres y no direcciones de 44", () => {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const b58 = (n: number) => Array.from({ length: n }, (_, i) => alphabet[(i * 7) % alphabet.length]).join("");
    expect(scan(`k="${b58(88)}"`)).toEqual(["base58-secret-key"]);
    expect(scan(`k="${b58(87)}"`)).toEqual(["base58-secret-key"]);
    expect(scan(`k="${b58(44)}"`)).toEqual([]);
  });

  it("detecta el arreglo JSON de 64 enteros de un keypair de Solana", () => {
    const arr = `[${Array.from({ length: 64 }, (_, i) => i * 3).join(",")}]`;
    expect(scan(arr)).toContain("solana-key-array");
  });

  it("el bundle rechaza los nombres nuevos", async () => {
    const { BUNDLE_SECRET_NAMES } = await import("../../scripts/scan-secrets.mjs");
    for (const n of ["DEMO_TOKEN_SECRET", "SHARE_SIGNING_SECRET", "ONRAMP_WEBHOOK_SECRET", "FRACCION_REVALIDATE_SECRET"]) {
      expect(BUNDLE_SECRET_NAMES).toContain(n);
    }
  });
});

describe("OPS-2: hook pre-commit y .gitignore", () => {
  it(".githooks/pre-commit corre el escáner con --staged", () => {
    const hook = readFileSync(path.join(ROOT, ".githooks", "pre-commit"), "utf8");
    expect(hook.startsWith("#!/bin/sh")).toBe(true);
    expect(hook).toContain("node scripts/scan-secrets.mjs --staged");
  });

  it(".gitignore cubre la basura de la raíz", () => {
    const ignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    for (const p of ["scratch*/", "*.zip", "continuo/", "relanzar_*.ps1", "STOP_*.txt", ".claude/"]) {
      expect(ignore).toContain(p);
    }
  });
});
