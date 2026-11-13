import { COPY_CTA_NOTE, COPY_DISCLAIMER, COPY_LEGAL_PENDING_LABEL } from "@/content/copy-legal";
import { cn } from "@/lib/cn";

/**
 * Nota legal de «Copiar carteras».
 *
 * Por defecto sólo muestra la etiqueta discreta de revisión pendiente: las
 * pantallas que ya publican el descargo largo pasan `disclaimer`; las que
 * están junto a un botón de copiar pasan `cta`. Los textos son borrador de
 * `content/copy-legal.ts` y no prometen rentabilidad.
 * Se lee como un dato más: hairline arriba, 13px y sin caja de color.
 */
export function LegalNote({
  cta = false,
  disclaimer = false,
  className,
}: {
  cta?: boolean;
  disclaimer?: boolean;
  className?: string;
}) {
  if (!cta && !disclaimer) {
    return (
      <p className={cn("text-[13px] leading-relaxed text-fg-muted", className)}>{COPY_LEGAL_PENDING_LABEL}</p>
    );
  }

  return (
    <aside
      aria-label="Aviso legal"
      className={cn(
        "flex max-w-prose flex-col gap-3 border-t border-border pt-5 text-[13px] leading-relaxed text-fg-muted",
        className,
      )}
    >
      {cta ? <p className="text-fg-body">{COPY_CTA_NOTE}</p> : null}
      {disclaimer ? <p>{COPY_DISCLAIMER}</p> : null}
      <p className="text-fg-muted">{COPY_LEGAL_PENDING_LABEL}</p>
    </aside>
  );
}
