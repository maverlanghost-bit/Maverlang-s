import { cn } from "@/lib/cn";

/**
 * Sello de atribución de Fraccion.si: texto pequeño, no es un logo.
 * Va en el título del catálogo, el pie de cada tarjeta, la cabecera de la
 * ficha, el pie del carrito y los planes. Enlaza a la metodología pública.
 * Sin cápsula: una línea de tinta discreta, con el alto táctil de 44px.
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
        "inline-flex min-h-11 w-fit items-center gap-1 text-[13px] leading-5 text-fg-muted transition-colors duration-150 hover:text-fg",
        className,
      )}
    >
      <span>tecnología de</span>
      <span className="font-medium">Fraccion.si</span>
    </a>
  );
}
