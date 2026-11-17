import { Reveal } from "@/components/landing/reveal";
import { LandingSection, SectionHeader } from "@/components/landing/section";
import { site } from "@/config/site";

const scheduleComparison = [
  {
    market: "Bolsa tradicional de EE.UU.",
    hours: "Lun a Vie · 09:30 a 16:00 ET",
    status: "Cierra las tardes, fines de semana y feriados",
    highlight: false,
  },
  {
    market: `${site.name} (xStocks en Solana)`,
    hours: "Lunes a Domingo · 24/7 on-chain",
    status: "Opera a cualquier hora · El token queda en tu billetera",
    highlight: true,
  },
] as const;

const DAYS = ["L", "M", "X", "J", "V", "S", "D"] as const;

/** 9:30 y 16:00 sobre 24 h: el tramo de la sesión regular dentro de cada día. */
const SESSION_LEFT = `${(9.5 / 24) * 100}%`;
const SESSION_WIDTH = `${((16 - 9.5) / 24) * 100}%`;

/**
 * La semana en dos barras (decorativa: el texto de abajo ya dice lo mismo).
 * Bolsa de EE.UU.: sólo el tramo 9:30 a 16:00, de lunes a viernes. On-chain:
 * los siete días completos.
 */
function WeekBar() {
  return (
    <div
      aria-hidden
      className="rounded-bento border border-inverse-border bg-inverse-surface p-5 md:p-7"
    >
      <div className="grid grid-cols-[5.5rem_repeat(7,minmax(0,1fr))] items-center gap-x-1.5 gap-y-3 sm:grid-cols-[7rem_repeat(7,minmax(0,1fr))] sm:gap-x-2">
        <span />
        {DAYS.map((day) => (
          <span key={day} className="num text-center text-[13px] leading-none text-inverse-muted">
            {day}
          </span>
        ))}

        <span className="text-[13px] leading-snug text-inverse-muted">Bolsa de EE.UU.</span>
        {DAYS.map((day, index) => (
          <span
            key={day}
            className="relative h-9 overflow-hidden rounded-md bg-inverse-surface sm:h-10"
          >
            {index < 5 ? (
              <span
                className="absolute inset-y-0 rounded-[3px] bg-white/45"
                style={{ left: SESSION_LEFT, width: SESSION_WIDTH }}
              />
            ) : null}
          </span>
        ))}

        <span className="text-[13px] leading-snug font-medium text-white">On-chain</span>
        {DAYS.map((day) => (
          <span key={day} className="h-9 rounded-md bg-white sm:h-10" />
        ))}
      </div>
      <p className="mt-5 text-[13px] leading-snug text-inverse-muted">
        Cada columna es un día completo. Sesión regular de EE.UU.: 9:30 a 16:00, hora de Nueva York.
      </p>
    </div>
  );
}

/**
 * Banda invertida de la portada (T70): el manifiesto de horario que antes
 * cerraba la página. Una sola banda negra por página.
 */
export function HoursBand() {
  return (
    <LandingSection id="horario" titleId="horario-title" tone="inverse">
      <Reveal>
        <SectionHeader
          id="horario-title"
          eyebrow="Mercado on-chain · Operas 24/7"
          align="split"
          inverse
          title={
            <>
              La bolsa de EE.UU. abre de 9:30 a 16:00.{" "}
              <span className="text-inverse-muted">El mercado on-chain sigue abierto.</span>
            </>
          }
        >
          Cuando la bolsa de EE.UU. cierra —cada tarde, fin de semana y feriado—, el mercado on-chain
          sigue operando. Compra fracciones de acciones tokenizadas a cualquier hora, directo en tu
          billetera.
        </SectionHeader>
      </Reveal>

      <div className="mt-10 grid gap-8 md:mt-14 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-7">
          <WeekBar />
        </Reveal>

        <Reveal delay={80} className="lg:col-span-5">
          <div className="divide-y divide-inverse-border border-y border-inverse-border">
            {scheduleComparison.map((row) => (
              <div key={row.market} className="grid gap-1 py-4">
                <p
                  className={
                    row.highlight
                      ? "text-[15px] font-medium text-white"
                      : "text-[15px] text-inverse-muted"
                  }
                >
                  {row.market}
                </p>
                <p className="num text-sm tabular-nums text-white">{row.hours}</p>
                <p className="text-[15px] leading-relaxed text-inverse-muted">{row.status}</p>
              </div>
            ))}
            <p className="py-4 text-[15px] leading-relaxed text-inverse-muted">
              Fuera del horario regular de la bolsa de EE.UU. (9:30 a 16:00, hora de Nueva York, lunes
              a viernes) hay menos liquidez y el precio puede variar más.
            </p>
          </div>
        </Reveal>
      </div>
    </LandingSection>
  );
}
