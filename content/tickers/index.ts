import type { TickerAbout } from "./types";
import { about as aapl } from "./aaplx";
import { about as amzn } from "./amznx";
import { about as crcl } from "./crclx";
import { about as googl } from "./googlx";
import { about as hood } from "./hoodx";
import { about as meta } from "./metax";
import { about as msft } from "./msftx";
import { about as mstr } from "./mstrx";
import { about as nvda } from "./nvdax";
import { about as qqq } from "./qqqx";
import { about as spy } from "./spyx";
import { about as tsla } from "./tslax";

/** Una ficha por símbolo del allowlist. Sin cifras de negocio. */
const ALL: readonly TickerAbout[] = [aapl, nvda, tsla, spy, qqq, googl, msft, amzn, meta, crcl, hood, mstr];

export function aboutForTicker(symbol: string): { es: string; en: string } | null {
  const row = ALL.find((item) => item.symbol === symbol);
  if (!row) return null;
  return { es: row.es, en: row.en };
}
