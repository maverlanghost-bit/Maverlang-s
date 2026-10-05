"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * Fondos suaves del design system. El texto es `fg` (#0a0a0a): contraste alto sobre todos.
 * El mismo símbolo cae siempre en el mismo tono.
 */
const MONOGRAM_TONES = ["bg-up-bg", "bg-info-bg", "bg-warn-bg", "bg-surface-2", "bg-surface-3"] as const;

/** Letras del símbolo. El sufijo "x" de xStocks no entra. Sin logos de marcas ajenas. TODO-VERIFICAR uso de marcas. */
function monogramLetters(symbol: string) {
  const trimmed = symbol.trim();
  const withoutSuffix = trimmed.replace(/x$/i, "");
  const source = withoutSuffix.length > 0 ? withoutSuffix : trimmed;
  const letters = source.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return letters.length > 0 ? letters : trimmed.slice(0, 2).toUpperCase();
}

function toneFor(symbol: string) {
  const letters = monogramLetters(symbol);
  let hash = 2166136261;
  for (let index = 0; index < letters.length; index += 1) {
    hash ^= letters.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return MONOGRAM_TONES[(hash >>> 0) % MONOGRAM_TONES.length] ?? MONOGRAM_TONES[0];
}

function monogramFont(length: number, size: number) {
  if (length <= 2) return Math.round(size * 0.38);
  if (length === 3) return Math.round(size * 0.32);
  if (length === 4) return Math.round(size * 0.26);
  return Math.round(size * 0.21);
}

export function TickerLogo({
  symbol,
  name,
  logoUrl,
  size = 36,
  decorative = false,
  className,
}: {
  symbol: string;
  name?: string;
  /** Ruta en `public`, por ejemplo `/logos/aapl.svg`. Si falta o falla, monograma. */
  logoUrl?: string | null;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const source = logoUrl?.trim() ? logoUrl : null;
  const showImage = source !== null && failedSrc !== source;
  const imageReady = showImage && readySrc === source;
  const letters = monogramLetters(symbol);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border font-mono leading-none font-medium text-fg select-none",
        toneFor(symbol),
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: monogramFont(letters.length, size),
        letterSpacing: letters.length >= 4 ? "-0.06em" : undefined,
      }}
    >
      <span aria-hidden className={imageReady ? "opacity-0" : undefined}>
        {letters}
      </span>
      {showImage && source ? (
        <Image
          src={source}
          alt={decorative ? "" : (name ?? symbol)}
          width={size}
          height={size}
          unoptimized
          className={cn("absolute inset-0 size-full object-cover", imageReady ? "opacity-100" : "opacity-0")}
          onLoad={() => setReadySrc(source)}
          onError={() => setFailedSrc(source)}
        />
      ) : null}
      {!showImage && !decorative ? <span className="sr-only">{name ?? symbol}</span> : null}
    </span>
  );
}
