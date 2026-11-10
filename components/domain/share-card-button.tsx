"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconShare } from "@/components/ui/icons";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";
import { formatSharePct, parseSharePct, shareCardPath } from "@/lib/share-card";

type ShareStatus = "idle" | "working" | "copied" | "failed";

const STATUS_MESSAGE: Record<"copied" | "failed", string> = {
  copied: "Enlace copiado",
  failed: "No se pudo compartir",
};

/** Nombre de archivo seguro para el PNG que se comparte. */
function fileNameFor(id: string): string {
  const base = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "accion"}.png`;
}

/**
 * Botón "Compartir" de la tarjeta 1200×630. Intenta la hoja del sistema con el
 * PNG y el enlace; si el navegador no la soporta, abre la imagen y copia el
 * enlace. Nunca muestra montos: sólo el porcentaje que recibe por `pct`.
 */
export function ShareCardButton({
  id,
  name,
  pct = null,
  className,
}: {
  id: string;
  name: string;
  pct?: number | null;
  className?: string;
}) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function announce(next: "copied" | "failed") {
    setStatus(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), 4000);
  }

  async function onShare() {
    if (status === "working") return;
    setStatus("working");
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }

    const pctValue = parseSharePct(pct === null ? null : String(pct));
    const path = shareCardPath(id, pctValue);
    const url = new URL(path, window.location.origin).toString();
    const text =
      pctValue === null ? `${name} en ${site.name}` : `${name}: ${formatSharePct(pctValue)} en mi cartera`;

    // El PNG se pide una vez; si falla, igual se comparte el enlace.
    let file: File | null = null;
    try {
      const response = await fetch(path, { headers: { Accept: "image/png" } });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0 && blob.type.startsWith("image/")) {
          file = new File([blob], fileNameFor(id), { type: blob.type });
        }
      }
    } catch {
      file = null;
    }

    const shareFile = file;
    let canShareFiles = false;
    if (shareFile && typeof navigator.canShare === "function") {
      try {
        canShareFiles = navigator.canShare({ files: [shareFile] });
      } catch {
        canShareFiles = false;
      }
    }

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(
          canShareFiles && shareFile
            ? { title: name, text, url, files: [shareFile] }
            : { title: name, text, url },
        );
        setStatus("idle");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus("idle");
          return;
        }
        // Sin hoja del sistema: sigue el respaldo de abajo.
      }
    }

    // Respaldo: la imagen en otra pestaña y el enlace al portapapeles.
    window.open(path, "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(url);
      announce("copied");
    } catch {
      announce("failed");
    }
  }

  const message = status === "copied" || status === "failed" ? STATUS_MESSAGE[status] : null;

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant="secondary"
        size="md"
        loading={status === "working"}
        onClick={() => void onShare()}
        aria-label={`Compartir ${name}`}
      >
        <IconShare />
        Compartir
      </Button>
      <span
        role="status"
        aria-live="polite"
        className={cn("text-xs", status === "failed" ? "text-down" : "text-fg-body", message ? null : "sr-only")}
      >
        {message ?? ""}
      </span>
    </span>
  );
}
