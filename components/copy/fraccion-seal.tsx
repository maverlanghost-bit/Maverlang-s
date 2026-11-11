import { cn } from "@/lib/cn";

/**
 * Sello de atribución de Fraccion.si: texto pequeño, no es un logo.
 * Va en el título del catálogo, el pie de cada tarjeta, la cabecera de la
 * ficha, el pie del carrito y los planes. Enlaza a la metodología pública.
 */
export function FraccionSeal({ className }: { className?: string }) {
  return (
    <a
      href="https://fraccion.si/metodologia"
      target="_blank"
      rel="noopener noreferrer"
      title="Cómo calcula Fraccion.si"
      aria-label="Cómo calcula Fraccion.si (se abre en una pestaña nueva)"
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-sm py-1 text-[11px] leading-none text-fg-muted transition-colors duration-150 hover:text-fg-body focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20",
        className,
      )}
    >
      <span>tecnología de</span>
      <span className="font-medium">Fraccion.si</span>
    </a>
  );
}
