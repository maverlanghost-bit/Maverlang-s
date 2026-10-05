"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

function initials(name: string | undefined, symbol: string) {
  const source = name ?? symbol.replace(/x$/i, "");
  const words = source.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/g) ?? [];
  const first = words[0];
  const second = words[1];
  if (first && second) return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase();
  return (first ?? symbol).slice(0, 2).toUpperCase();
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
  logoUrl?: string | null;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(logoUrl) && failedSrc !== logoUrl;
  const letters = initials(name, symbol);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 font-medium text-fg",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
    >
      {showImage && logoUrl ? (
        <Image
          src={logoUrl}
          alt={decorative ? "" : (name ?? symbol)}
          width={size}
          height={size}
          unoptimized
          className="size-full object-cover"
          onError={() => setFailedSrc(logoUrl)}
        />
      ) : (
        <span aria-hidden>{letters}</span>
      )}
      {!showImage && !decorative ? <span className="sr-only">{name ?? symbol}</span> : null}
    </span>
  );
}
