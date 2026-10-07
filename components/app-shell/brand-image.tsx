"use client";

import { useState } from "react";
import Image from "next/image";

import { site } from "@/config/site";
import { cn } from "@/lib/cn";

/**
 * Logo ancho de Maverlang. Si el PNG aún no está en `public/brand/`,
 * muestra el nombre en texto en vez de un ícono de archivo roto.
 */
export function BrandLogoImage({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="truncate text-sm font-medium tracking-tight text-fg">{site.name}</span>;
  }
  return (
    <Image
      src="/brand/maverlang-logo.png"
      alt={site.name}
      width={148}
      height={26}
      priority
      className={cn("h-6 w-auto dark:invert", className)}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Marca cuadrada (sidebar colapsada, CTA). Sin PNG, letra M.
 */
export function BrandMarkImage({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg",
          className,
        )}
      >
        M
      </span>
    );
  }
  return (
    <Image
      src="/brand/maverlang-mark.png"
      alt=""
      width={40}
      height={40}
      className={cn("size-10 rounded-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}
