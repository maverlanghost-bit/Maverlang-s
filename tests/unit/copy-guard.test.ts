import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  collectFiles,
  isSkipped,
  normalizeText,
  scanAll,
  scanFile,
} from "@/lib/content/copy-guard";

/**
 * M83: la guardia de copy. Escanea content/, lib/content/, components/ y app/
 * y falla con archivo y línea si encuentra una frase prohibida. Los fixtures
 * viven en una carpeta temporal (no en tests/: el escáner no la vigila).
 */

const FORBIDDEN: { phrase: string; rule: string }[] = [
  { phrase: "Rentabilidad Garantizada en Maverlang", rule: "rentabilidad-garantizada" },
  { phrase: "Invierte sin riesgo desde hoy", rule: "sin-riesgo" },
  { phrase: "Ganancia segura todas las semanas", rule: "ganancia-segura" },
  { phrase: "Con esto eres accionista de Apple", rule: "eres-accionista" },
  { phrase: "Mañana serás accionista registrado", rule: "seras-accionista" },
  { phrase: "Serás el dueño de la acción", rule: "dueño-de-la-accion" },
  { phrase: "Ofrecemos asesoría financiera personalizada", rule: "asesoria-financiera" },
  { phrase: "Estamos regulados por la CMF", rule: "regulado-por-la-cmf" },
  { phrase: "Siempre custodiamos tus activos", rule: "custodiamos-tus" },
  { phrase: "Depositas pesos en Maverlang y listo", rule: "depositas-pesos-en-maverlang" },
  { phrase: "Pagas con pesos en Maverlang sin comisión", rule: "pagas-con-pesos-en-maverlang" },
  { phrase: "Get guaranteed returns every month", rule: "en-guaranteed-returns" },
  { phrase: "This investment is risk-free", rule: "en-risk-free" },
  { phrase: "You own the share from day one", rule: "en-you-own-the-share" },
];

const ALLOWED: string[] = [
  "Nosotros no custodiamos tus activos",
  "no es asesoría financiera",
  "El servicio no constituye asesoría de inversión",
  "No estamos regulados por la CMF",
  "No es una plataforma regulada por la CMF",
  "No eres accionista registrado de la empresa",
  "El token es tuyo: serás dueño del token, no dueño de la acción",
  "Opera 24/7",
  "Invertir implica riesgos",
  "Compras en dólares (US$) y operas 24/7",
];

describe("M83: copy-guard — normalización", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(normalizeText("Asesoría Financiera")).toBe("asesoria financiera");
    expect(normalizeText("DUEÑO DE LA ACCIÓN")).toBe("dueno de la accion");
    expect(normalizeText("Serás")).toBe("seras");
  });
});

describe("M83: copy-guard — reglas", () => {
  it("detecta cada frase prohibida con su regla", () => {
    for (const { phrase, rule } of FORBIDDEN) {
      const findings = scanFile("fixture.tsx", `<p>${phrase}</p>`);
      expect(findings, `debe detectar: ${phrase}`).toHaveLength(1);
      expect(findings[0]?.rule).toBe(rule);
      expect(findings[0]?.line).toBe(1);
    }
  });

  it("no distingue mayúsculas ni tildes al detectar", () => {
    expect(scanFile("a.md", "ASESORÍA FINANCIERA PROFESIONAL")).toHaveLength(1);
    expect(scanFile("a.md", "Sin Riesgo de cambio")).toHaveLength(1);
    expect(scanFile("a.md", "GUARANTEED RETURNS")).toHaveLength(1);
    expect(scanFile("a.md", "RISK-FREE")).toHaveLength(1);
  });

  it("reporta archivo y línea correctos", () => {
    const findings = scanFile("content/i18n/es-CL.ts", 'a: "ok",\nb: "ganancia segura",\n');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe("content/i18n/es-CL.ts");
    expect(findings[0]?.line).toBe(2);
  });

  it("permite las frases con negación y las neutras", () => {
    for (const phrase of ALLOWED) {
      const findings = scanFile("fixture.tsx", phrase);
      expect(findings, `no debe detectar: ${phrase}`).toHaveLength(0);
    }
  });

  it("la negación vale aunque la frase quede cortada en otra línea (párrafo)", () => {
    const source = [
      "<p>El servicio",
      "no es asesoría financiera</p>",
      "",
      "<p>Ofrecemos asesoría financiera</p>",
    ].join("\n");
    const findings = scanFile("fixture.tsx", source);
    expect(findings).toHaveLength(1);
    // La detección queda en la frase real ("Ofrecemos...", línea 4); la del
    // párrafo 1 se anula porque ahí la frase está negada.
    expect(findings[0]?.line).toBe(4);
  });

  it("acepta una frase prohibida dentro de un comentario que la niega", () => {
    // La negación en la misma línea anula el match.
    expect(scanFile("a.tsx", "{/* no es asesoría financiera */}")).toHaveLength(0);
  });
});

describe("M83: copy-guard — cobertura de archivos", () => {
  it("vigila content, lib/content, components y app", () => {
    const root = mkdtempSync(path.join(tmpdir(), "copy-guard-"));
    try {
      mkdirSync(path.join(root, "content/i18n"), { recursive: true });
      mkdirSync(path.join(root, "lib/content"), { recursive: true });
      mkdirSync(path.join(root, "components/landing"), { recursive: true });
      mkdirSync(path.join(root, "app/(marketing)"), { recursive: true });
      mkdirSync(path.join(root, "tests/unit"), { recursive: true });
      writeFileSync(path.join(root, "content/i18n/es-CL.ts"), 'x: "hola",');
      writeFileSync(path.join(root, "lib/content/faq.ts"), "export const faq = [];");
      writeFileSync(path.join(root, "components/landing/hero.tsx"), "export default () => null;");
      writeFileSync(path.join(root, "app/(marketing)/page.tsx"), "export default () => null;");
      writeFileSync(path.join(root, "app/(marketing)/nota.md"), "texto");
      writeFileSync(path.join(root, "tests/unit/x.test.ts"), 'x: "ganancia segura",');
      writeFileSync(path.join(root, "app/(marketing)/img.gif"), "GIF");
      const files = collectFiles(root);
      expect(files).toContain("content/i18n/es-CL.ts");
      expect(files).toContain("lib/content/faq.ts");
      expect(files).toContain("components/landing/hero.tsx");
      expect(files).toContain("app/(marketing)/page.tsx");
      expect(files).toContain("app/(marketing)/nota.md");
      expect(files.some((file) => file.startsWith("tests/"))).toBe(false);
      expect(files.some((file) => file.endsWith(".gif"))).toBe(false);
      expect(isSkipped("tests/unit/x.test.ts")).toBe(true);
      expect(isSkipped("components/landing/hero.tsx")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("el repo real pasa limpio (ninguna frase prohibida en el código)", () => {
    const root = path.resolve(__dirname, "..", "..");
    const findings = scanAll(root);
    expect(
      findings,
      `frases prohibidas encontradas:\n${findings.map((f) => `${f.file}:${f.line} [${f.rule}] ${f.text}`).join("\n")}`,
    ).toHaveLength(0);
  });
});
