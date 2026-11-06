"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { IconCheck, IconCopy } from "@/components/ui/icons";
import { tickerBySymbol } from "@/config/tickers";
import { cn } from "@/lib/cn";

/**
 * Renderizador rico (estilo Grok / Perplexity Finance) del texto plano que
 * devuelve el asistente. No usa `dangerouslySetInnerHTML` ni librerías de
 * markdown: sólo reconoce un subconjunto acotado y seguro.
 *
 * Contrato de render: cada párrafo o ítem que no contiene un ticker del
 * catálogo queda como UN nodo de texto contiguo, sin spans ni separadores.
 */

const TICKER_SOURCE = "\\b[A-Z]{2,6}x\\b";
const INLINE_SOURCE = `\\*\\*[^*\\n]+\\*\\*|${TICKER_SOURCE}`;
const BULLET_PREFIX = /^\s*[-•]\s+/;
const HEADING_PATTERN = /^\*\*(.+?)\*\*\s*:?$/;
const METRIC_PATTERN = /^([^:\n]{2,28}):\s+(\S.{0,79})$/;
const NUMERIC_VALUE = /^[~$€£¥]?\s?[-+−]?\d/;

type TickerHandler = ((ticker: string) => void) | undefined;

/** Aviso fijo: la respuesta nunca es asesoría personalizada. */
const DISCLAIMER = "Información educativa. No es recomendación de inversión.";

const FOLLOW_UPS = [
  "¿Cuáles son sus riesgos clave?",
  "Comparar contra SPYx",
  "¿Cómo funciona su dividendo tokenizado?",
] as const;

function TickerPill({
  symbol,
  label,
  onTickerClick,
}: {
  symbol: string;
  label: string;
  onTickerClick: TickerHandler;
}) {
  return (
    <Link
      href={`/app/accion/${symbol}`}
      onClick={() => onTickerClick?.(symbol)}
      aria-label={`Ver ${symbol} en el mercado`}
      className="mx-0.5 inline-flex items-baseline gap-1 rounded-full border border-border/70 bg-surface-1 px-2 py-px align-baseline text-[0.875em] font-medium text-fg tabular-nums transition-colors duration-[140ms] ease-[var(--ease-inout)] hover:border-fg/25 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
    >
      {label}
    </Link>
  );
}

/**
 * Convierte un tramo de texto en nodos: devuelve el string tal cual cuando no
 * hay nada especial (garantiza un único nodo de texto) y sólo fragmenta
 * cuando encuentra `**negrita**` o un ticker presente en `config/tickers`.
 */
function renderInline(content: string, onTickerClick: TickerHandler, keyHint: string): ReactNode {
  if (!content) return null;

  const pattern = new RegExp(INLINE_SOURCE, "g");
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(content);

  while (match !== null) {
    const token = match[0];

    if (match.index > cursor) parts.push(content.slice(cursor, match.index));

    if (token.startsWith("**")) {
      const inner = token.slice(2, -2).trim();
      parts.push(
        inner ? (
          <strong key={`${keyHint}-b${match.index}`} className="font-semibold text-fg">
            {renderInline(inner, onTickerClick, `${keyHint}-b${match.index}`)}
          </strong>
        ) : null,
      );
    } else {
      const ticker = tickerBySymbol(token);
      parts.push(
        ticker ? (
          <TickerPill
            key={`${keyHint}-t${match.index}`}
            symbol={ticker.symbol}
            label={token}
            onTickerClick={onTickerClick}
          />
        ) : (
          token
        ),
      );
    }

    cursor = match.index + token.length;
    match = pattern.exec(content);
  }

  if (cursor < content.length) parts.push(content.slice(cursor));

  const visible = parts.filter((part) => part !== null && part !== "");
  if (visible.length === 0) return null;
  return visible.length === 1 ? visible[0] : visible;
}

/**
 * Detecta líneas de métricas del tipo "clave: valor" sin confundirlas con
 * oraciones ("Riesgo: la volatilidad puede ser alta.").
 */
function parseMetric(line: string): { key: string; value: string } | null {
  if (BULLET_PREFIX.test(line) || HEADING_PATTERN.test(line)) return null;
  if (/^(?:https?:\/\/|www\.)/i.test(line)) return null;

  const match = METRIC_PATTERN.exec(line);
  if (!match) return null;

  const key = match[1].trim();
  const value = match[2].trim();
  if (!key || !value || key.startsWith("**")) return null;

  const quantitative = NUMERIC_VALUE.test(value);
  const shortLabel = value.length <= 24 && !/[.!?…]$/.test(value) && !/\s—\s/.test(value);
  if (!quantitative && !shortLabel) return null;

  return { key, value };
}

function renderBlocks(text: string, onTickerClick: TickerHandler): ReactNode[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const nodes: ReactNode[] = [];

  blocks.forEach((rawBlock, blockIndex) => {
    const lines = rawBlock
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return;

    let index = 0;
    let plainLines: string[] = [];

    const flushPlain = () => {
      if (plainLines.length === 0) return;
      const joined = plainLines.join("\n");
      plainLines = [];
      const key = `p-${blockIndex}-${nodes.length}`;
      nodes.push(
        <p key={key} className="text-pretty text-[14.5px] leading-[1.68] whitespace-pre-line text-fg-body">
          {renderInline(joined, onTickerClick, key)}
        </p>,
      );
    };

    while (index < lines.length) {
      const line = lines[index];

      if (BULLET_PREFIX.test(line)) {
        flushPlain();
        const items: string[] = [];
        while (index < lines.length && BULLET_PREFIX.test(lines[index])) {
          items.push(lines[index].replace(BULLET_PREFIX, ""));
          index += 1;
        }
        const key = `ul-${blockIndex}-${nodes.length}`;
        nodes.push(
          <ul key={key} className="flex flex-col gap-1.5">
            {items.map((item, itemIndex) => (
              <li key={`${key}-i${itemIndex}`} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[0.62em] size-1 shrink-0 rounded-full bg-fg-subtle" />
                <span className="min-w-0 flex-1 text-pretty text-[14.5px] leading-[1.6] text-fg-body [overflow-wrap:anywhere]">
                  {renderInline(item, onTickerClick, `${key}-i${itemIndex}`)}
                </span>
              </li>
            ))}
          </ul>,
        );
        continue;
      }

      const heading = HEADING_PATTERN.exec(line);
      if (heading) {
        flushPlain();
        const key = `h-${blockIndex}-${nodes.length}`;
        nodes.push(
          <h3 key={key} className="text-pretty text-[15px] font-semibold tracking-[-0.01em] text-fg">
            {renderInline(heading[1].trim(), onTickerClick, key)}
          </h3>,
        );
        index += 1;
        continue;
      }

      const metric = parseMetric(line);
      if (metric) {
        flushPlain();
        const rows: { key: string; value: string }[] = [metric];
        index += 1;
        while (index < lines.length) {
          const next = parseMetric(lines[index]);
          if (!next) break;
          rows.push(next);
          index += 1;
        }
        const key = `dl-${blockIndex}-${nodes.length}`;
        nodes.push(
          <dl key={key} className="rounded-2xl border border-border/70 bg-surface-1/70 px-3.5 py-2">
            {rows.map((row, rowIndex) => (
              <div
                key={`${key}-r${rowIndex}`}
                className="flex items-baseline justify-between gap-4 py-0.5 text-[13px] leading-snug"
              >
                <dt className="min-w-0 text-fg-muted">{renderInline(row.key, onTickerClick, `${key}-k${rowIndex}`)}</dt>
                <dd className="shrink-0 text-right font-medium text-fg tabular-nums">
                  {renderInline(row.value, onTickerClick, `${key}-v${rowIndex}`)}
                </dd>
              </div>
            ))}
          </dl>,
        );
        continue;
      }

      plainLines.push(line);
      index += 1;
    }

    flushPlain();
  });

  return nodes;
}

export function RichAssistantMessage({
  text,
  onTickerClick,
  onFollowUp,
}: {
  text: string;
  onTickerClick?: (ticker: string) => void;
  onFollowUp?: (prompt: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const content = typeof text === "string" ? text : "";
  const blocks = content.trim().length > 0 ? renderBlocks(content, onTickerClick) : [];

  if (blocks.length === 0) return null;

  async function handleCopy() {
    if (typeof navigator === "undefined") return;
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return;

    try {
      await clipboard.writeText(content);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
        timer.current = null;
      }, 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div data-ai-rich-message className="flex w-full min-w-0 flex-col gap-3 text-fg-body">
      <div className="flex min-w-0 flex-col gap-2.5">{blocks}</div>

      {onFollowUp ? (
        <div role="group" aria-label="Preguntas de seguimiento" className="flex flex-wrap gap-1.5">
          {FOLLOW_UPS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onFollowUp(prompt)}
              className="inline-flex max-w-full items-center rounded-full border border-border/70 bg-surface-1 px-2.5 py-1 text-left text-[12px] leading-snug font-medium text-fg-muted transition-colors duration-[140ms] ease-[var(--ease-inout)] hover:border-fg/20 hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-2">
        <p className="min-w-0 text-[11px] leading-snug text-fg-subtle">{DISCLAIMER}</p>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copiado" : "Copiar"}
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1",
            "text-[12px] font-medium text-fg-muted transition duration-[140ms] ease-[var(--ease-inout)]",
            "hover:border-border/70 hover:bg-surface-1 hover:text-fg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            "motion-reduce:transition-none",
          )}
        >
          {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
          <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
        </button>
      </div>
    </div>
  );
}
