"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";

import { cn } from "@/lib/cn";

/**
 * Bloque de código del asistente: cabecera con lenguaje, número de líneas y
 * botón de copiar; cuerpo monoespaciado con números de línea opcionales.
 * Sin resaltado de sintaxis ni dependencias (sólo SVG inline).
 */

/** Señales independientes que delatan un snippet; hacen falta al menos 2. */
const SNIPPET_SIGNALS: readonly ((text: string) => boolean)[] = [
  (text) => /[{}]/.test(text),
  (text) => text.includes("=>"),
  (text) => /\bfunction\s/.test(text),
  (text) => /\bconst\s/.test(text),
  (text) => /\blet\s/.test(text),
  (text) => /\bdef\s/.test(text),
  (text) => /\bclass\s/.test(text),
  (text) => /\bimport\s/.test(text),
  (text) => /\bSELECT\s/.test(text),
  (text) => text.includes("</"),
  (text) => /;\s*$/m.test(text),
  (text) => text.includes("#include"),
  (text) => text.includes("console."),
  (text) => text.includes("print("),
];

const TYPESCRIPT_PATTERN =
  /^\s*(?:export\s+)?(?:interface|type)\s+[A-Za-z_$][\w$]*|:\s*string\b/m;

const PYTHON_DEF_PATTERN = /(?:^|\n)\s*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/;

const PYTHON_IMPORT_PATTERN =
  /(?:^|\n)\s*(?:from\s+[\w.]+\s+import\s+|import\s+[\w.]+(?:\s+as\s+\w+)?\s*(?:\n|$))/;

const SQL_PATTERN =
  /\b(?:select\b[\s\S]{0,400}?\bfrom\b|insert\s+into|create\s+table|delete\s+from|update\s+\w+\s+set)\b/i;

const HTML_PATTERN = /<!doctype\s+html|<\/html>|<html\b|<div\b/i;

const CSS_PATTERN =
  /(?:^|\n|})\s*[.#@]?[a-zA-Z][^{}\n]*\{[^{}]*[\w-]+\s*:\s*[^;{}]+;/;

const SHELL_PATTERN =
  /^#!\s*\/bin\/|(?:^|\n)\s*\$\s+\S|(?:^|\n)\s*(?:npm|npx|pnpm|yarn|git|cd|ls|curl)\s+\S/m;

const JAVASCRIPT_PATTERN = /\bfunction\b|\bconst\b|\blet\b|=>/;

/** Texto normal en español (sin llaves, sin operadores, sin punto y coma) da `false`. */
export function isCodeSnippet(text: string): boolean {
  if (!text || !text.includes("\n")) return false;

  let signals = 0;
  for (const matches of SNIPPET_SIGNALS) {
    if (matches(text)) {
      signals += 1;
      if (signals >= 2) return true;
    }
  }
  return false;
}

function looksLikeJson(source: string): boolean {
  if (!/^[[{]/.test(source)) return false;
  try {
    const parsed: unknown = JSON.parse(source);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

function looksLikePython(source: string): boolean {
  if (PYTHON_DEF_PATTERN.test(source) || PYTHON_IMPORT_PATTERN.test(source)) return true;
  return /\bprint\s*\(/.test(source) && !/console\.|=>|\bfunction\b/.test(source);
}

/** Heurística simple y sin dependencias; ante la duda devuelve `"text"`. */
export function detectCodeLanguage(code: string): string {
  const source = code.trim();
  if (!source) return "text";

  if (TYPESCRIPT_PATTERN.test(source)) return "typescript";
  if (looksLikePython(source)) return "python";
  if (SQL_PATTERN.test(source)) return "sql";
  if (looksLikeJson(source)) return "json";
  if (HTML_PATTERN.test(source)) return "html";
  if (CSS_PATTERN.test(source)) return "css";
  if (SHELL_PATTERN.test(source)) return "bash";
  if (JAVASCRIPT_PATTERN.test(source)) return "javascript";
  return "text";
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="size-3.5"
    >
      <rect
        x="5.5"
        y="5.5"
        width="8"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v5.4A1.3 1.3 0 0 0 3.8 10.5H5.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="size-3.5"
    >
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  className,
}: {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Sólo cleanup: el timeout del "Copiado" no debe sobrevivir al desmontaje.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const normalized = code.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const lines = normalized.split("\n");
  const lineCount = lines.length;
  const lineLabel = lineCount === 1 ? "1 línea" : `${lineCount} líneas`;
  const languageLabel = (language?.trim() || detectCodeLanguage(code)).toUpperCase();
  const lineNumbers = lines.map((_, index) => String(index + 1)).join("\n");

  const handleCopy = async (): Promise<void> => {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 2000);
    } catch {
      // Portapapeles denegado o contexto no seguro: fallo silencioso.
    }
  };

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-xl border border-border bg-zinc-950 text-zinc-100",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
          {languageLabel}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-zinc-500">{lineLabel}</span>
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            aria-label="Copiar código"
            title="Copiar código"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 transition-colors duration-150 hover:text-white focus-visible:ring-4 focus-visible:ring-white/20 focus-visible:outline-none"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span>{copied ? "Copiado" : "Copiar"}</span>
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-3 text-[12.5px] leading-relaxed">
        <code className="block whitespace-pre font-mono">
          {showLineNumbers ? (
            <span className="flex">
              <span
                aria-hidden="true"
                className="select-none whitespace-pre pr-3 text-right tabular-nums text-zinc-600"
              >
                {lineNumbers}
              </span>
              <span className="whitespace-pre">{normalized}</span>
            </span>
          ) : (
            normalized
          )}
        </code>
      </pre>
    </div>
  );
}
