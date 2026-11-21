"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { tickerBySymbol } from "@/config/tickers";

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
const BULLET_PREFIX = /^\s*[-*•]\s+/;
const NUMBERED_PREFIX = /^\s*(\d+)\.\s+/;
const H2_PATTERN = /^##\s+(.+)$/;
const H3_PATTERN = /^###\s+(.+)$/;
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
      className="mx-0.5 inline-flex items-baseline gap-1 rounded-full border border-border/70 bg-surface-1/90 px-2 py-0.5 align-baseline text-[0.85em] font-semibold text-fg tabular-nums shadow-2xs transition-all duration-150 hover:border-border hover:bg-surface-2 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
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

function renderBlocks(text: string, onTickerClick: TickerHandler, cursor?: ReactNode): ReactNode[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const nodes: ReactNode[] = [];

  blocks.forEach((rawBlock, blockIndex) => {
    const isLastBlock = blockIndex === blocks.length - 1;
    const lines = rawBlock
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return;

    let index = 0;
    let plainLines: string[] = [];

    const flushPlain = (isAtBlockEnd = false) => {
      if (plainLines.length === 0) return;
      const joined = plainLines.join("\n");
      plainLines = [];
      const key = `p-${blockIndex}-${nodes.length}`;
      const attachCursor = isLastBlock && isAtBlockEnd && cursor != null;
      nodes.push(
        <p key={key} className="text-[15px] leading-[1.68] text-pretty whitespace-pre-line text-fg-body [overflow-wrap:anywhere] sm:text-base">
          {renderInline(joined, onTickerClick, key)}
          {attachCursor ? cursor : null}
        </p>,
      );
    };

    while (index < lines.length) {
      const line = lines[index];

      // Encabezado nivel 2: ## Título
      const h2Match = H2_PATTERN.exec(line);
      if (h2Match) {
        flushPlain();
        const key = `h2-${blockIndex}-${nodes.length}`;
        const isAtBlockEnd = index === lines.length - 1;
        const attachCursor = isLastBlock && isAtBlockEnd && cursor != null;
        nodes.push(
          <h2 key={key} className="mt-2 mb-0.5 text-base font-semibold tracking-tight text-pretty text-fg sm:text-lg">
            {renderInline(h2Match[1].trim(), onTickerClick, key)}
            {attachCursor ? cursor : null}
          </h2>,
        );
        index += 1;
        continue;
      }

      // Encabezado nivel 3: ### Título
      const h3Match = H3_PATTERN.exec(line);
      if (h3Match) {
        flushPlain();
        const key = `h3-${blockIndex}-${nodes.length}`;
        const isAtBlockEnd = index === lines.length - 1;
        const attachCursor = isLastBlock && isAtBlockEnd && cursor != null;
        nodes.push(
          <h3 key={key} className="text-pretty text-[15px] font-semibold tracking-[-0.01em] text-fg mt-1.5 mb-0.5">
            {renderInline(h3Match[1].trim(), onTickerClick, key)}
            {attachCursor ? cursor : null}
          </h3>,
        );
        index += 1;
        continue;
      }

      // Lista numerada: 1. Item
      if (NUMBERED_PREFIX.test(line)) {
        flushPlain();
        const numberedItems: { num: string; text: string }[] = [];
        while (index < lines.length && NUMBERED_PREFIX.test(lines[index])) {
          const match = NUMBERED_PREFIX.exec(lines[index]);
          if (match) {
            numberedItems.push({
              num: match[1],
              text: lines[index].replace(NUMBERED_PREFIX, ""),
            });
          }
          index += 1;
        }
        const key = `ol-${blockIndex}-${nodes.length}`;
        const isAtBlockEnd = index === lines.length;
        nodes.push(
          <ol key={key} className="flex flex-col gap-1.5 my-1">
            {numberedItems.map((item, itemIndex) => {
              const isLastItem = itemIndex === numberedItems.length - 1;
              const attachCursor = isLastBlock && isAtBlockEnd && isLastItem && cursor != null;
              return (
                <li key={`${key}-n${itemIndex}`} className="flex gap-2.5">
                  <span aria-hidden="true" className="min-w-[1.25rem] shrink-0 text-right text-[13px] font-medium text-fg-muted tabular-nums select-none pt-[0.1em]">
                    {item.num}.
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] leading-relaxed text-pretty text-fg-body [overflow-wrap:anywhere] sm:text-base">
                    {renderInline(item.text, onTickerClick, `${key}-n${itemIndex}`)}
                    {attachCursor ? cursor : null}
                  </span>
                </li>
              );
            })}
          </ol>,
        );
        continue;
      }

      // Lista con viñetas: -, *, •
      if (BULLET_PREFIX.test(line)) {
        flushPlain();
        const items: string[] = [];
        while (index < lines.length && BULLET_PREFIX.test(lines[index])) {
          items.push(lines[index].replace(BULLET_PREFIX, ""));
          index += 1;
        }
        const key = `ul-${blockIndex}-${nodes.length}`;
        const isAtBlockEnd = index === lines.length;
        nodes.push(
          <ul key={key} className="flex flex-col gap-1.5 my-1">
            {items.map((item, itemIndex) => {
              const isLastItem = itemIndex === items.length - 1;
              const attachCursor = isLastBlock && isAtBlockEnd && isLastItem && cursor != null;
              return (
                <li key={`${key}-i${itemIndex}`} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[0.62em] size-1.5 shrink-0 rounded-full bg-fg-subtle" />
                  <span className="min-w-0 flex-1 text-[15px] leading-relaxed text-pretty text-fg-body [overflow-wrap:anywhere] sm:text-base">
                    {renderInline(item, onTickerClick, `${key}-i${itemIndex}`)}
                    {attachCursor ? cursor : null}
                  </span>
                </li>
              );
            })}
          </ul>,
        );
        continue;
      }

      // Encabezado en negrita simple: **Título**
      const heading = HEADING_PATTERN.exec(line);
      if (heading) {
        flushPlain();
        const key = `h-${blockIndex}-${nodes.length}`;
        const isAtBlockEnd = index === lines.length - 1;
        const attachCursor = isLastBlock && isAtBlockEnd && cursor != null;
        nodes.push(
          <h3 key={key} className="text-pretty text-[15px] font-semibold tracking-[-0.01em] text-fg mt-1">
            {renderInline(heading[1].trim(), onTickerClick, key)}
            {attachCursor ? cursor : null}
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
          <dl key={key} className="my-1 max-w-full divide-y divide-border border-y border-border">
            {rows.map((row, rowIndex) => (
              <div
                key={`${key}-r${rowIndex}`}
                className="flex items-baseline justify-between gap-3 py-2 text-sm leading-snug"
              >
                <dt className="min-w-0 text-fg-muted [overflow-wrap:anywhere]">{renderInline(row.key, onTickerClick, `${key}-k${rowIndex}`)}</dt>
                <dd className="max-w-[62%] shrink-0 text-right font-medium text-fg tabular-nums break-words">
                  {renderInline(row.value, onTickerClick, `${key}-v${rowIndex}`)}
                </dd>
              </div>
            ))}
          </dl>
        );
        continue;
      }

      plainLines.push(line);
      index += 1;
    }

    flushPlain(true);
  });

  return nodes;
}

export function RichAssistantMessage({
  text,
  onTickerClick,
  onFollowUp,
  cursor,
}: {
  text: string;
  onTickerClick?: (ticker: string) => void;
  onFollowUp?: (prompt: string) => void;
  cursor?: ReactNode;
}) {
  const content = typeof text === "string" ? text : "";
  const blocks = content.trim().length > 0 ? renderBlocks(content, onTickerClick, cursor) : [];

  if (blocks.length === 0) return null;

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
              className="inline-flex min-h-11 max-w-full items-center rounded-full border border-border/70 bg-surface-1 px-3 py-2 text-left text-[12px] leading-snug font-medium text-fg-muted transition-colors duration-[140ms] ease-[var(--ease-inout)] hover:border-fg/20 hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none sm:min-h-0 sm:px-2.5 sm:py-1"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <p className="border-t border-border/70 pt-2 text-[11px] leading-snug text-fg-subtle">{DISCLAIMER}</p>
    </div>
  );
}
