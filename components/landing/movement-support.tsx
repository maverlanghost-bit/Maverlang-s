import Link from "next/link";

import { LandingSection } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { IconBack, IconChevron, IconClock, IconHelp, IconWallet } from "@/components/ui/icons";
import { supportMailto } from "@/config/site";

const ACTIVITY_HREF = "/app/billetera#actividad";

const topics = [
  {
    title: "Mi depósito no aparece",
    icon: IconBack,
    iconClassName: "-rotate-90",
    steps: [
      "Busca la firma en la billetera desde la que enviaste el depósito.",
      "Comprueba que la red sea Solana y que el destino coincida con la dirección que ves en Billetera → Recibir.",
    ],
  },
  {
    title: "Mi operación sigue pendiente",
    icon: IconClock,
    iconClassName: undefined,
    steps: [
      "Abre el movimiento en Billetera → Actividad y selecciona Consultar estado.",
      "Guarda el folio y espera la confirmación antes de volver a operar.",
    ],
  },
  {
    title: "Mi saldo no coincide",
    icon: IconWallet,
    iconClassName: undefined,
    steps: [
      "Vuelve a cargar la billetera y comprueba si estás en la cuenta demo o real.",
      "Compara las unidades del activo con las que figuran en el movimiento.",
    ],
  },
] as const;

export function MovementSupport() {
  const contactHref = supportMailto();

  return (
    <LandingSection titleId="movimientos" density="compact">
      <h2 id="movimientos" className="text-title text-balance text-fg">Ayuda con movimientos</h2>
      <div className="mt-6 grid items-stretch gap-4 md:mt-8 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-6">
        <div className="overflow-hidden rounded-bento border border-border bg-bg shadow-frame">
          <div className="divide-y divide-border">
            {topics.map(({ title, icon: Icon, iconClassName, steps }) => (
              <details key={title} className="group">
                <summary className="grid min-h-[4.5rem] cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-4 py-4 text-left transition-colors group-open:bg-surface-1/60 hover:bg-surface-1 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-fg sm:gap-4 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span className="grid size-10 place-items-center rounded-xl bg-surface-1 text-fg">
                    <Icon className={iconClassName} />
                  </span>
                  <span className="text-base leading-snug font-semibold tracking-tight text-pretty text-fg">{title}</span>
                  <span className="grid size-7 place-items-center rounded-full border border-border bg-bg text-fg-muted">
                    <IconChevron className="disclosure-chevron size-3.5 transition-transform duration-200 motion-reduce:transition-none" />
                  </span>
                </summary>
                <ol className="ml-12 list-decimal space-y-2 px-4 pt-2 pb-5 text-sm leading-relaxed text-pretty text-fg-body marker:font-medium marker:text-fg-muted sm:ml-16 sm:pr-6">
                  {steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </details>
            ))}
          </div>
        </div>

        <aside aria-labelledby="movimientos-contacto" className="flex min-w-0 flex-col rounded-bento bg-fg p-5 text-white sm:p-6 lg:p-7">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-inverse-surface ring-1 ring-inset ring-inverse-border">
            <IconHelp className="size-5" />
          </span>
          <h3 id="movimientos-contacto" className="mt-4 text-xl leading-tight font-semibold tracking-tight text-balance text-white">
            {contactHref ? "¿Necesitas más ayuda?" : "Revisa tu actividad"}
          </h3>
          <p className="mt-2 max-w-[36ch] text-sm leading-relaxed text-pretty text-inverse-muted">
            {contactHref
              ? "Ten a mano el folio o, si el movimiento no aparece, la firma pública y la hora aproximada."
              : "Abre un movimiento para consultar su estado y copiar su ID."}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
            {contactHref ? (
              <Button asChild size="sm" variant="secondary" className="w-full border-white bg-white text-fg hover:bg-surface-2 focus-visible:ring-white focus-visible:ring-offset-fg sm:w-auto">
                <a href={contactHref}>Contactar a soporte <IconBack className="size-3.5 rotate-[135deg]" /></a>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="secondary" className="w-full border-white/40 bg-transparent text-white hover:bg-inverse-surface focus-visible:ring-white focus-visible:ring-offset-fg sm:w-auto">
              <Link href={ACTIVITY_HREF}>Abrir actividad <IconBack className="size-3.5 rotate-180" /></Link>
            </Button>
          </div>
        </aside>
      </div>
    </LandingSection>
  );
}
