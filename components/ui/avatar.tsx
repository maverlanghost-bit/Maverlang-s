"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const sizeClass = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
} as const;

function initials(source: string) {
  const words = source.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/g) ?? [];
  const first = words[0];
  const second = words[1];
  if (first && second) return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase();
  return (first ?? source).slice(0, 2).toUpperCase();
}

export function Avatar({
  src,
  alt,
  fallback,
  size = "md",
  className,
}: {
  src?: string | null;
  alt: string;
  fallback?: string;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const letters = initials(fallback ?? alt);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 font-medium text-fg",
        sizeClass[size],
        className,
      )}
    >
      {showImage && src ? (
        // El archivo puede no existir: si falla, quedan las iniciales.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span aria-hidden>{letters}</span>
      )}
      {showImage ? null : <span className="sr-only">{alt}</span>}
    </span>
  );
}
