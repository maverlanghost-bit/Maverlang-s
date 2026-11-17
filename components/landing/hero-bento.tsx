import { TickerRow } from "@/components/domain/ticker-row";
import { BentoCard, BentoGrid } from "@/components/landing/bento";
import { HeroQuoteCard } from "@/components/landing/hero-quote-card";
import { HeroTicketCard } from "@/components/landing/hero-ticket-card";
import { LandingLiveBadge, LandingPrice } from "@/components/landing/live-landing-prices";
import { StatTile } from "@/components/landing/stat-tile";
import type { LandingQuote } from "@/lib/mocks/landing";

/**
 * Bento de producto del hero (T70). Seis tarjetas; en escritorio (6 columnas):
 *
 *   fila 1-2  Mercado (2 col, 2 filas) · Ficha con gráfico (4 col)
 *   fila 2                                Boleta (2 col) · Saldo demo (2 col)
 *   fila 3    Tu billetera (3 col) · Bolsa de EE.UU. y on-chain (3 col)
 *
 * El orden del DOM es el de lectura en escritorio (foco de teclado de izquierda
 * a derecha); en móvil `order-*` sube la ficha: Ficha, Mercado, Boleta y las
 * tres tarjetas pequeñas. Todo viene de las cotizaciones que ya recibe el hero.
 */
export function HeroBento({
  heroQuotes,
  reference,
  live,
}: {
  heroQuotes: LandingQuote[];
  /** Cotización de la ficha y de la boleta; sin ella, ambas muestran su estado vacío. */
  reference: LandingQuote | undefined;
  live: boolean;
}) {
  return (
    <BentoGrid>
      <MarketCard quotes={heroQuotes} live={live} />

      {reference ? (
        <HeroQuoteCard
          quote={reference}
          live={live}
          className="order-1 sm:col-span-2 lg:order-none lg:col-span-4 lg:col-start-3 lg:row-start-1"
        />
      ) : (
        <EmptyCard className="order-1 sm:col-span-2 lg:order-none lg:col-span-4 lg:col-start-3 lg:row-start-1" />
      )}

      {reference ? (
        <HeroTicketCard
          quote={reference}
          className="order-3 lg:order-none lg:col-span-2 lg:col-start-3 lg:row-start-2"
        />
      ) : (
        <EmptyCard className="order-3 lg:order-none lg:col-span-2 lg:col-start-3 lg:row-start-2" />
      )}

      <BentoCard
        tone="inverse"
        className="order-6 lg:order-none lg:col-span-2 lg:col-start-5 lg:row-start-2"
        visual={
          <StatTile
            inverse
            label="Saldo demo"
            value="US$10.000"
            hint="Saldo ficticio para practicar: no es dinero real."
          />
        }
      />

      <WalletCard />
      <ScheduleCard />
    </BentoGrid>
  );
}

function EmptyCard({ className }: { className?: string }) {
  return (
    <BentoCard tone="muted" className={className}>
      <p className="text-sm text-fg-muted">La acción de ejemplo no está disponible en este momento.</p>
    </BentoCard>
  );
}

/** Lista de mercado: las mismas filas y el mismo rótulo de origen que antes. */
function MarketCard({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  return (
    <BentoCard
      padded={false}
      className="order-2 sm:col-span-2 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1"
    >
      <div className="px-5 pt-5 md:px-6 md:pt-6">
        <h2 className="text-lg font-semibold tracking-tight text-fg">Mercado</h2>
        <p className="mt-0.5 text-sm text-fg-muted">xStocks en Solana, 24/7</p>
        <div className="mt-3">
          {quotes.length > 0 ? (
            <LandingLiveBadge live={live} />
          ) : (
            <span className="text-xs font-medium text-fg-muted">Sin datos</span>
          )}
        </div>
      </div>

      {quotes.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-t border-border px-1.5 md:px-2.5">
          {quotes.map((quote) => (
            <li key={quote.symbol}>
              <TickerRow
                href={quote.href}
                symbol={quote.symbol}
                name={quote.name}
                logoUrl={quote.logo}
                price={quote.priceUsd}
                currency="USD"
                change={quote.change}
                priceSlot={
                  <LandingPrice
                    symbol={quote.symbol}
                    initial={{ priceUsd: quote.priceUsd, change: quote.change }}
                  />
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-border px-5 py-4 text-sm text-fg-muted md:px-6">
          Las cotizaciones no están disponibles en este momento.
        </p>
      )}
    </BentoCard>
  );
}

/** Billetera propia → token. Dibujo monocromo y decorativo; el texto lo dice todo. */
function WalletCard() {
  return (
    <BentoCard
      tone="muted"
      headingLevel="h2"
      title="Tu billetera"
      className="order-4 lg:order-none lg:col-span-3 lg:col-start-1 lg:row-start-3"
      visual={
        <div aria-hidden className="text-fg">
          <svg viewBox="0 0 240 56" className="h-14 w-full max-w-[15rem]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="8" width="64" height="40" rx="10" />
            <rect x="44" y="21" width="24" height="14" rx="7" />
            <circle cx="56" cy="28" r="1.5" fill="currentColor" stroke="none" />
            <path d="M88 28h52" strokeDasharray="3 5" />
            <path d="M134 22l6 6-6 6" />
            <circle cx="196" cy="28" r="22" />
            <circle cx="196" cy="28" r="11" />
          </svg>
          <div className="mt-1 grid max-w-[15rem] grid-cols-[4.5rem_1fr_5.5rem] text-xs text-fg-muted">
            <span>Tu billetera</span>
            <span />
            <span className="text-center">Token xStock</span>
          </div>
        </div>
      }
    >
      Tus acciones tokenizadas viven en tu propia billetera, nunca en custodia nuestra.
    </BentoCard>
  );
}

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** 9:30 a 16:00 sobre 24 h, en porcentaje del día. */
const SESSION_LEFT_PCT = (9.5 / 24) * 100;
const SESSION_WIDTH_PCT = (6.5 / 24) * 100;

/**
 * Semana estática: bolsa de EE.UU. (lunes a viernes, 9:30 a 16:00, hora de
 * Nueva York) frente a on-chain (siempre). No dice «abierto» ni «cerrado ahora»:
 * eso requeriría un dato en vivo que el hero no recibe.
 */
function ScheduleCard() {
  return (
    <BentoCard
      headingLevel="h2"
      title="Bolsa de EE.UU. y on-chain"
      className="order-5 lg:order-none lg:col-span-3 lg:col-start-4 lg:row-start-3"
      visual={
        <div>
          <div aria-hidden className="space-y-2.5">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] leading-none text-fg-muted">
              {WEEK_DAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <WeekRow label="Bolsa" session />
            <WeekRow label="On-chain" />
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline text-fg-muted">Bolsa: </dt>
              <dd className="inline text-fg">
                lun a vie, <span className="num">9:30 a 16:00</span> (Nueva York)
              </dd>
            </div>
            <div>
              <dt className="inline text-fg-muted">On-chain: </dt>
              <dd className="num inline text-fg">24/7</dd>
            </div>
          </dl>
        </div>
      }
    >
      Fuera del horario de la bolsa hay menos liquidez y el precio puede variar más.
    </BentoCard>
  );
}

function WeekRow({ label, session = false }: { label: string; session?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[11px] leading-none font-medium text-fg-muted">{label}</p>
      <div className="grid grid-cols-7 gap-1">
        {WEEK_DAYS.map((day, index) => {
          const weekday = index < 5;
          return (
            <span key={day} className="relative h-2.5 overflow-hidden rounded-xs bg-surface-2">
              {session ? (
                weekday ? (
                  <span
                    className="absolute inset-y-0 bg-fg"
                    style={{ left: `${SESSION_LEFT_PCT}%`, width: `${SESSION_WIDTH_PCT}%` }}
                  />
                ) : null
              ) : (
                <span className="absolute inset-0 bg-fg" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
