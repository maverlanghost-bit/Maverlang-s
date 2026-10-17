/**
 * M83: guardia de copy. Escanea los textos fuente de la app y falla con archivo
 * y línea si aparece una frase prohibida (promesas, confusión sobre lo que se
 * compra, o frases ya corregidas que no deben volver). "24/7" no se bloquea.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type Finding = {
  rule: string;
  file: string;
  line: number;
  text: string;
};

type Rule = {
  id: string;
  /** Expresión normalizada que decide si la frase aparece. */
  match: RegExp;
  /** Si existe, anula el match (negaciones y aclaraciones permitidas). */
  allow?: RegExp;
  /** Revisa el párrafo entero en vez de sólo la línea del match. */
  paragraph?: boolean;
};

/** Quita tildes, diacríticos y la eñe (ñ→n), y baja a minúsculas. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const ES = {
  guaranteedProfit: /rentabilidad garantizada/,
  noRisk: /sin riesgo/,
  safeProfit: /ganancia segura/,
  shareholderYou: /\beres accionista\b/,
  shareholderYouWill: /\bseras accionista\b/,
  shareOwner: /\bdueno de la accion\b/,
  adviceService: /\basesoria financiera\b/,
  cmfRegulated: /regulados? por la cmf/,
  custody: /custodiamos tus/,
  depositPesos: /depositas pesos en maverlang/,
  payPesos: /pagas con pesos en maverlang/,
} as const;

const EN = {
  guaranteedReturns: /guaranteed returns/,
  riskFree: /risk[- ]?free/,
  youOwnTheShare: /you own the share/,
} as const;

/**
 * Negaciones válidas: "no es asesoría financiera", "no constituye asesoría",
 * "no está regulado por la CMF", "no custodiamos", "no eres accionista" y "no
 * serás accionista". "Dueño de la acción" vale sólo si el párrafo aclara el
 * token ("dueño del token", nunca de la acción ni de la empresa).
 */
const ALLOW = {
  advice: /no\s+(?:es|constituye|ofrecemos|damos|prestamos|somos)\s+(?:una\s+)?asesoria/,
  cmf: /no\s+(?:esta|estamos|somos)\s+(?:[a-z]+\s+)?regulado/,
  custody: /no\s+custodiamos/,
  shareholder: /no\s+(?:eres|seras)\s+accionista/,
  token: /\btoken\b/,
} as const;

const RULES: Rule[] = [
  { id: "rentabilidad-garantizada", match: ES.guaranteedProfit },
  { id: "sin-riesgo", match: ES.noRisk },
  { id: "ganancia-segura", match: ES.safeProfit },
  { id: "eres-accionista", match: ES.shareholderYou, paragraph: true, allow: ALLOW.shareholder },
  { id: "seras-accionista", match: ES.shareholderYouWill, paragraph: true, allow: ALLOW.shareholder },
  { id: "dueño-de-la-accion", match: ES.shareOwner, paragraph: true, allow: ALLOW.token },
  { id: "asesoria-financiera", match: ES.adviceService, allow: ALLOW.advice },
  { id: "regulado-por-la-cmf", match: ES.cmfRegulated, allow: ALLOW.cmf },
  { id: "custodiamos-tus", match: ES.custody, allow: ALLOW.custody },
  { id: "depositas-pesos-en-maverlang", match: ES.depositPesos },
  { id: "pagas-con-pesos-en-maverlang", match: ES.payPesos },
  { id: "en-guaranteed-returns", match: EN.guaranteedReturns },
  { id: "en-risk-free", match: EN.riskFree },
  { id: "en-you-own-the-share", match: EN.youOwnTheShare },
];

const DIRS = ["content", "lib/content", "components", "app"];
const EXTENSIONS = new Set([".ts", ".tsx", ".md"]);

/** Rutas que el escáner no revisa: fixtures del propio test y tests unitarios. */
export function isSkipped(relative: string): boolean {
  const normalized = relative.replaceAll("\\", "/");
  return (
    // El propio guardia define las frases prohibidas como regex: no se escanea
    // a sí mismo (se dispararía con sus propias reglas).
    normalized === "lib/content/copy-guard.ts" ||
    normalized.startsWith("tests/") ||
    normalized.startsWith("node_modules/") ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith("data/")
  );
}

/** Recorre los directorios vigilados y devuelve las rutas relativas (con /). */
export function collectFiles(root: string): string[] {
  const found: string[] = [];
  for (const dir of DIRS) {
    const abs = path.join(root, dir);
    walk(abs, root, found);
  }
  return found;
}

function walk(abs: string, root: string, found: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".next-verify") continue;
    const absEntry = path.join(abs, entry);
    const relative = path.relative(root, absEntry);
    let stats;
    try {
      stats = statSync(absEntry);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      walk(absEntry, root, found);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry))) continue;
    if (isSkipped(relative)) continue;
    found.push(relative.replaceAll("\\", "/"));
  }
}

type Paragraph = { start: number; end: number; text: string };

/** Parte el archivo en párrafos: bloques separados por línea en blanco. */
function splitParagraphs(lines: string[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: string[] = [];
  let start = 0;
  const flush = (end: number) => {
    if (current.length > 0) paragraphs.push({ start, end, text: current.join(" ") });
    current = [];
  };
  lines.forEach((line, index) => {
    if (line.trim() === "") {
      flush(index);
      start = 0;
    } else {
      if (current.length === 0) start = index + 1;
      current.push(line);
    }
  });
  flush(lines.length);
  return paragraphs;
}

/**
 * Escanea un archivo: cada regla compara la línea normalizada (o el párrafo,
 * para las frases que pueden quedar cortadas en dos líneas del código).
 */
export function scanFile(relative: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split(/\r?\n/);
  const paragraphs = splitParagraphs(lines);

  for (const rule of RULES) {
    lines.forEach((line, index) => {
      const number = index + 1;
      const normalized = normalizeText(line);
      if (!rule.match.test(normalized)) return;
      if (rule.paragraph) {
        const paragraph = paragraphs.find((item) => number >= item.start && number <= item.end);
        const haystack = paragraph ? normalizeText(paragraph.text) : normalized;
        if (rule.allow && rule.allow.test(haystack)) return;
      } else if (rule.allow && rule.allow.test(normalized)) {
        return;
      }
      findings.push({ rule: rule.id, file: relative, line: number, text: line.trim().slice(0, 120) });
    });
  }
  return findings;
}

/** Escanea todos los archivos vigilados y devuelve todas las detecciones. */
export function scanAll(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const relative of collectFiles(root)) {
    const abs = path.join(root, relative);
    const source = readFileSync(abs, "utf8");
    findings.push(...scanFile(relative, source));
  }
  return findings;
}
