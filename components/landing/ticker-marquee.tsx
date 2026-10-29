import { TickerTape } from "@/components/landing/ticker-tape";
import { landingNotice } from "@/lib/landing/live-quotes";
import { ILLUSTRATIVE_NOTICE, type LandingQuote } from "@/lib/mocks/landing";

/**
 * Cinta con precio en dólares (US$) y variación (M42). Los números son
 * cliente (`<LandingPrice>` liviano). La línea de abajo nombra el catálogo;
 * no es un contador de frescura. La pausa vive en el cliente; esta pieza
 * sigue en el servidor para no importar `landingNotice` desde el browser.
 */
export function TickerMarquee({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const notice = live ? `${landingNotice(true)}.` : `${ILLUSTRATIVE_NOTICE}. No son cotizaciones en vivo.`;
  return <TickerTape quotes={quotes} notice={notice} />;
}
