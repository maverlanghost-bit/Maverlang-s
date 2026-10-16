import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ACCEPTED_ADVISORIES, collectAdvisoryFindings, summarizeCounts } from "../../scripts/audit-deps.mjs";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

/** Reporte de npm audit reducido a lo que usa el gate. */
function reportOf(vulnerabilities: Record<string, unknown>, total = 0): unknown {
  return {
    vulnerabilities,
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total },
    },
  };
}

/** Advisory hoja con forma npm audit (`via` con objetos). */
function advisory(url: string, severity: string, name: string, title = "Título"): unknown {
  return { url, severity, name, title, cwe: [], cvss: { score: 7 } };
}

describe("CI fix: audit:deps con excepciones documentadas", () => {
  it("cada advisory aceptado está justificado en docs/SEGURIDAD.md", () => {
    const doc = read("docs/SEGURIDAD.md");
    for (const url of Object.keys(ACCEPTED_ADVISORIES)) {
      const id = url.split("/").pop() ?? "";
      expect(doc, `${url} debe estar en docs/SEGURIDAD.md`).toContain(id);
    }
  });

  it("un advisory alto aceptado no rompe el gate", () => {
    const report = reportOf({
      "bigint-buffer": {
        severity: "high",
        via: [advisory("https://github.com/advisories/GHSA-3gc7-fjrx-p6mg", "high", "bigint-buffer")],
      },
    });
    const { blocking, accepted } = collectAdvisoryFindings(report);
    expect(blocking).toEqual([]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.name).toBe("bigint-buffer");
    expect(accepted[0]?.packages).toEqual(["bigint-buffer"]);
  });

  it("un advisory alto NUEVO rompe el gate aunque el paquete sea conocido", () => {
    const report = reportOf({
      "bigint-buffer": {
        severity: "high",
        via: [advisory("https://github.com/advisories/GHSA-XXXX-xxxx-xxxx", "high", "bigint-buffer")],
      },
    });
    const { blocking, accepted } = collectAdvisoryFindings(report);
    expect(blocking).toHaveLength(1);
    expect(blocking[0]?.url).toBe("https://github.com/advisories/GHSA-XXXX-xxxx-xxxx");
    expect(accepted).toEqual([]);
  });

  it("una CRÍTICA nunca está aceptada: siempre rompe el gate", () => {
    const urls = Object.keys(ACCEPTED_ADVISORIES);
    const report = reportOf(
      Object.fromEntries(
        urls.map((url, i) => [
          `pkg-${i}`,
          { severity: "critical", via: [advisory(url, "critical", `pkg-${i}`)] },
        ]),
      ),
    );
    // La aceptación documentada en SEGURIDAD.md es para "high": si npm
    // re-califica el advisory a critical, el gate vuelve a romper.
    const { blocking, accepted } = collectAdvisoryFindings(report);
    expect(blocking).toHaveLength(urls.length);
    expect(accepted).toEqual([]);
  });

  it("las moderadas son informativas y no entran al gate", () => {
    const report = reportOf({
      "decode-uri-component": {
        severity: "moderate",
        via: [advisory("https://github.com/advisories/GHSA-vcc3-ghjq-m6fr", "moderate", "decode-uri-component")],
      },
    });
    const { blocking, accepted } = collectAdvisoryFindings(report);
    expect(blocking).toEqual([]);
    expect(accepted).toEqual([]);
    expect(summarizeCounts(report)).toEqual({ total: 0, moderate: 0, low: 0 });
  });

  it("advisories de dos paquetes con la misma URL se agrupan en un hallazgo", () => {
    const url = "https://github.com/advisories/GHSA-3gc7-fjrx-p6mg";
    const report = reportOf({
      "bigint-buffer": { severity: "high", via: [advisory(url, "high", "bigint-buffer")] },
      "@solana/spl-token": { severity: "high", via: [advisory(url, "high", "bigint-buffer")] },
    });
    const { accepted } = collectAdvisoryFindings(report);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.packages).toEqual(["@solana/spl-token", "bigint-buffer"]);
  });

  it("vía string (heredada) y reporte corrupto no rompen nada", () => {
    const report = reportOf({
      "@solana/web3.js": { severity: "high", via: ["bigint-buffer"] },
    });
    expect(collectAdvisoryFindings(report).blocking).toEqual([]);
    expect(collectAdvisoryFindings(null)).toEqual({ blocking: [], accepted: [] });
    expect(collectAdvisoryFindings({ vulnerabilities: "no-un-objeto" })).toEqual({
      blocking: [],
      accepted: [],
    });
  });

  it("el script vive en package.json como audit:deps", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["audit:deps"]).toBe("node scripts/audit-deps.mjs");
  });
});
