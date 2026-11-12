import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { CompareChart } from "@/components/landing/compare-chart";
import { LandingSection } from "@/components/landing/section";
import { StockLivePrice } from "@/components/landing/stock-live-price";
import { buttonClasses } from "@/components/ui/button";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";
import { COMPARE_PAIRS, comparePath, sectorFor } from "@/lib/seo/categories";
import { COMPANY_SNAPSHOT_DATE, companyProfile, formatUsdCompact } from "@/lib/seo/company-profile";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets, resolvePublicAsset, type PublicAsset } from "@/lib/seo/public-catalog";

export const revalidate = 3600;
/** Un par desconocido entra a la página y muestra el 404 dentro del layout. */
export const dynamicParams = true;

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;
const DESCRIPTION_MIN = 120;

const linkClass =
  "inline-flex min-h-11 items-center font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

/** Rótulo mono de 13 px: el mínimo legible del comparador. */
const eyebrowClass = "font-mono text-[13px] font-medium uppercase tracking-[0.045em] text-fg-muted";

const headerCellClass =
  "py-2.5 font-mono text-[13px] font-medium uppercase tracking-[0.045em] text-fg-muted";

/** Importe por acción de la SEC (EPS o dividendos): dólares, dos decimales, es-CL. */
function usdPerShare(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `US$${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Frase con la cifra mayor, en palabras y sin juicio de valor. */
function winnerLabel(
  row: {
    left: string | null;
    right: string | null;
    leftValue: number | null;
    rightValue: number | null;
    numeric: boolean;
  },
  a: PublicAsset,
  b: PublicAsset,
): string | null {
  if (!row.numeric) return null;
  if (row.left === null && row.right === null) return null;
  if (row.left === null) return `Sólo ${b.ticker} publica el dato`;
  if (row.right === null) return `Sólo ${a.ticker} publica el dato`;
  const left = row.leftValue;
  const right = row.rightValue;
  if (left === null || right === null) return null;
  if (left === right) return "Iguales";
  return `Cifra mayor: ${left > right ? a.ticker : b.ticker}`;
}

/** Fecha larga del snapshot, sin corrimiento de zona: el ISO es UTC. */
function longDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Title ≤ 60: primero con nombres y tickers, después sólo nombres, al final tickers. */
function pairTitle(a: PublicAsset, b: PublicAsset): string {
  const names = `Comparar ${a.name} y ${b.name}`;
  const tickers = `Comparar ${a.ticker} y ${b.ticker}`;
  const candidates = [`${names} (${a.ticker} vs ${b.ticker})`, names, tickers];
  return candidates.find((value) => value.length <= TITLE_MAX) ?? tickers.slice(0, TITLE_MAX);
}

/** Description de 120 a 155, única por par, sin hablar de la demo ni prometer nada. */
function pairDescription(a: PublicAsset, b: PublicAsset): string {
  const head = `Compara ${a.name} (${a.ticker}) y ${b.name} (${b.ticker})`;
  const tail = " Información, no recomendación de inversión.";
  const clauses = [
    " con datos públicos de la SEC",
    " y precio en vivo",
    ", con gráfico de rendimiento relativo a un mes",
  ];
  let body = head;
  for (const clause of clauses) {
    if (`${body}${clause}${tail}`.length > DESCRIPTION_MAX) break;
    body = `${body}${clause}`;
    if (`${body}${tail}`.length >= DESCRIPTION_MIN) return `${body}${tail}`;
  }
  // Hueco entre 120 y 155 caracteres: una frase corta lo completa sin pasarse.
  const filler = " de ambas empresas";
  if (`${body}${filler}${tail}`.length <= DESCRIPTION_MAX) body = `${body}${filler}`;
  const text = `${body}${tail}`;
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : text;
}

/**
 * Resuelve el par `{a}-vs-{b}`. Prueba cada separador por si un slug contuviera
 * `-vs-`; sólo acepta lados que existan en el catálogo y sean distintos.
 */
async function parsePair(raw: string): Promise<{ a: PublicAsset; b: PublicAsset } | null> {
  const value = raw.trim();
  const marker = "-vs-";
  let start = value.toLowerCase().indexOf(marker);
  while (start !== -1) {
    const left = value.slice(0, start);
    const right = value.slice(start + marker.length);
    if (left && right) {
      const a = await resolvePublicAsset(left);
      const b = await resolvePublicAsset(right);
      if (a && b && a.slug !== b.slug) return { a, b };
    }
    start = value.toLowerCase().indexOf(marker, start + 1);
  }
  return null;
}

/** Orden editorial del par en `COMPARE_PAIRS`, aceptando los tickers al revés. */
function listedOrder(a: PublicAsset, b: PublicAsset): [PublicAsset, PublicAsset] | null {
  const left = a.ticker.toLowerCase();
  const right = b.ticker.toLowerCase();
  for (const [first, second] of COMPARE_PAIRS) {
    if (left === first.toLowerCase() && right === second.toLowerCase()) return [a, b];
    if (left === second.toLowerCase() && right === first.toLowerCase()) return [b, a];
  }
  return null;
}

/** Pares sugeridos cuyos dos tickers existen hoy en el catálogo público. */
function validPairs(assets: readonly PublicAsset[]): { a: PublicAsset; b: PublicAsset }[] {
  const byTicker = new Map<string, PublicAsset>();
  for (const asset of assets) byTicker.set(asset.ticker.toLowerCase(), asset);
  const pairs: { a: PublicAsset; b: PublicAsset }[] = [];
  for (const [left, right] of COMPARE_PAIRS) {
    const a = byTicker.get(left.toLowerCase());
    const b = byTicker.get(right.toLowerCase());
    if (a && b && a.slug !== b.slug) pairs.push({ a, b });
  }
  return pairs;
}

export async function generateStaticParams() {
  const assets = await listPublicAssets();
  return validPairs(assets).map(({ a, b }) => ({ pair: `${a.slug}-vs-${b.slug}` }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair } = await params;
  const parsed = await parsePair(pair);
  if (!parsed) {
    return pageMetadata({
      title: "Comparación no encontrada",
      description: "La comparación no existe o cambió de dirección.",
      path: `/comparar/${pair}`,
      index: false,
      follow: false,
    });
  }
  const listed = listedOrder(parsed.a, parsed.b);
  const a = listed ? listed[0] : parsed.a;
  const b = listed ? listed[1] : parsed.b;
  return pageMetadata({
    title: pairTitle(a, b),
    description: pairDescription(a, b),
    path: comparePath(a, b),
    absolute: true,
    index: listed !== null,
  });
}

/** Cabecera de cada activo: sin tarjeta, sólo hairlines y el precio en vivo. */
function SideSummary({ asset }: { asset: PublicAsset }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <TickerLogo
          symbol={asset.symbol}
          name={asset.name}
          logoUrl={logoPathFromSymbol(asset.symbol)}
          size={36}
          decorative
          loading="lazy"
          sizes="36px"
        />
        <div className="min-w-0">
          <p className={eyebrowClass}>{asset.ticker}</p>
          <p className="mt-1 truncate text-base font-medium text-fg">{asset.name}</p>
        </div>
      </div>
      <StockLivePrice symbol={asset.symbol} />
      <p className="text-[13px] leading-relaxed text-fg-muted">
        {asset.symbol} · {asset.etf ? "ETF" : "Acción EE.UU."}
      </p>
      <Link href={`/acciones/${asset.slug}`} className={`${linkClass} mt-auto`}>
        Ver ficha de {asset.name}
      </Link>
    </div>
  );
}

/**
 * Barras proporcionales al mayor valor absoluto de la fila, con la línea base
 * siempre al 50 % del ancho: un valor positivo crece hacia la derecha y uno
 * negativo hacia la izquierda. Así una pérdida no se ve igual que una
 * ganancia. Sólo se dibujan con datos publicados; un nulo queda como
 * "Sin dato", nunca como 0.
 */
function MetricBars({
  label,
  a,
  b,
  left,
  right,
}: {
  label: string;
  a: PublicAsset;
  b: PublicAsset;
  left: number | null;
  right: number | null;
}) {
  const values = [left, right].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const max = values.length > 0 ? Math.max(...values.map((value) => Math.abs(value))) : 0;
  const sides = [
    { asset: a, value: left },
    { asset: b, value: right },
  ];

  return (
    <div>
      <p className="text-[13px] font-medium text-fg-body">{label}</p>
      <div className="mt-2.5 space-y-3">
        {sides.map(({ asset, value }) => {
          const formatted = formatUsdCompact(value);
          const magnitude =
            value !== null && value !== 0 && max > 0 ? Math.max((Math.abs(value) / max) * 50, 0.8) : 0;
          const negative = value !== null && value < 0;
          return (
            <div key={asset.slug}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-mono text-fg-muted">{asset.ticker}</span>
                <span className="num text-fg">{formatted ?? "Sin dato"}</span>
              </div>
              <span aria-hidden className="relative mt-1.5 block h-1.5 w-full bg-border">
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-fg/30" />
                {magnitude > 0 ? (
                  <span
                    className={cn("absolute inset-y-0", negative ? "bg-down" : "bg-fg")}
                    style={{
                      left: negative ? `${50 - magnitude}%` : "50%",
                      width: `${magnitude}%`,
                    }}
                  />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function CompararParPage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  const parsed = await parsePair(pair);
  if (!parsed) notFound();

  const listed = listedOrder(parsed.a, parsed.b);
  const a = listed ? listed[0] : parsed.a;
  const b = listed ? listed[1] : parsed.b;
  const canonical = comparePath(a, b);
  if (`/comparar/${pair.trim()}` !== canonical) permanentRedirect(canonical);

  const leftProfile = companyProfile(a.ticker);
  const rightProfile = companyProfile(b.ticker);
  const snapshotDate = longDate(COMPANY_SNAPSHOT_DATE);

  const rows: {
    label: string;
    left: string | null;
    right: string | null;
    /** Valor crudo para señalar la cifra mayor en móvil. */
    leftValue: number | null;
    rightValue: number | null;
    numeric: boolean;
  }[] = [
    {
      label: "Ingresos (12 meses)",
      left: formatUsdCompact(leftProfile?.revenueTtm ?? null),
      right: formatUsdCompact(rightProfile?.revenueTtm ?? null),
      leftValue: leftProfile?.revenueTtm ?? null,
      rightValue: rightProfile?.revenueTtm ?? null,
      numeric: true,
    },
    {
      label: "Utilidad neta (12 meses)",
      left: formatUsdCompact(leftProfile?.netIncomeTtm ?? null),
      right: formatUsdCompact(rightProfile?.netIncomeTtm ?? null),
      leftValue: leftProfile?.netIncomeTtm ?? null,
      rightValue: rightProfile?.netIncomeTtm ?? null,
      numeric: true,
    },
    {
      label: "Utilidad por acción (12 meses)",
      left: usdPerShare(leftProfile?.epsTtm ?? null),
      right: usdPerShare(rightProfile?.epsTtm ?? null),
      leftValue: leftProfile?.epsTtm ?? null,
      rightValue: rightProfile?.epsTtm ?? null,
      numeric: true,
    },
    {
      label: "Dividendos por acción (12 meses)",
      left: usdPerShare(leftProfile?.dividendsPerShareTtm ?? null),
      right: usdPerShare(rightProfile?.dividendsPerShareTtm ?? null),
      leftValue: leftProfile?.dividendsPerShareTtm ?? null,
      rightValue: rightProfile?.dividendsPerShareTtm ?? null,
      numeric: true,
    },
    {
      label: "Bolsa",
      left: leftProfile?.exchange ?? null,
      right: rightProfile?.exchange ?? null,
      leftValue: null,
      rightValue: null,
      numeric: false,
    },
    {
      label: "Sector",
      left: sectorFor(a)?.name ?? null,
      right: sectorFor(b)?.name ?? null,
      leftValue: null,
      rightValue: null,
      numeric: false,
    },
  ];
  if (leftProfile?.fundNetAssets != null || rightProfile?.fundNetAssets != null) {
    rows.push({
      label: "Activos netos del fondo",
      left: formatUsdCompact(leftProfile?.fundNetAssets ?? null),
      right: formatUsdCompact(rightProfile?.fundNetAssets ?? null),
      leftValue: leftProfile?.fundNetAssets ?? null,
      rightValue: rightProfile?.fundNetAssets ?? null,
      numeric: true,
    });
  }
  const visibleRows = rows.filter((row) => row.left !== null || row.right !== null);

  const metrics = [
    {
      label: "Ingresos (12 meses)",
      left: leftProfile?.revenueTtm ?? null,
      right: rightProfile?.revenueTtm ?? null,
    },
    {
      label: "Utilidad neta (12 meses)",
      left: leftProfile?.netIncomeTtm ?? null,
      right: rightProfile?.netIncomeTtm ?? null,
    },
  ].filter((metric) => metric.left !== null || metric.right !== null);

  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: "Comparar", path: "/comparar" },
    { name: `${a.name} vs ${b.name}`, path: canonical },
  ];

  return (
    <LandingSection titleId="comparar-title" density="compact">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <article>
        <nav aria-label="Migas" className="text-sm text-fg-muted">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              <Link href="/" className="underline decoration-border underline-offset-4 hover:decoration-fg">
                Inicio
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/comparar" className="underline decoration-border underline-offset-4 hover:decoration-fg">
                Comparar
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-fg">
              {a.name} vs {b.name}
            </li>
          </ol>
        </nav>

        <header className="mt-8 border-b border-border pb-8">
          <p className={eyebrowClass}>Comparación</p>
          <h1 id="comparar-title" className="mt-2 text-3xl text-balance sm:text-4xl">
            {a.name} vs {b.name}
          </h1>
          <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-fg-body">
            Dos activos lado a lado: cifras de la empresa según la SEC, precio del token y rendimiento relativo del
            último mes. Comparar no es recomendar.
          </p>
        </header>

        <div className="mt-8 grid sm:grid-cols-2 sm:divide-x sm:divide-border">
          <div className="border-b border-border py-5 sm:border-b-0 sm:pr-6 lg:pr-8">
            <SideSummary asset={a} />
          </div>
          <div className="py-5 sm:pl-6 lg:pl-8">
            <SideSummary asset={b} />
          </div>
        </div>

        <CompareChart
          key={canonical}
          a={{ symbol: a.symbol, name: a.name, ticker: a.ticker }}
          b={{ symbol: b.symbol, name: b.name, ticker: b.ticker }}
          path={canonical}
        />

        <section aria-labelledby="comparar-datos" className="mt-10">
          <h2 id="comparar-datos" className="text-2xl sm:text-3xl">
            Datos de la empresa
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-muted">
            Cifras de los últimos 12 meses según la SEC. Si la empresa no publica un dato, se muestra “Sin dato”: no se
            completa con cero.
          </p>

          {visibleRows.length > 0 ? (
            <>
              {/* <sm: una fila por métrica, dos valores y la cifra mayor en palabras.
                  Reemplaza la tabla de 3 columnas que a 390 px caía a 11 px. */}
              <ul className="mt-4 border-t border-border sm:hidden">
                {visibleRows.map((row) => {
                  const winner = winnerLabel(row, a, b);
                  return (
                    <li key={row.label} className="border-b border-border py-4">
                      <p className="text-[13px] font-medium text-fg-body">{row.label}</p>
                      <dl className="mt-2 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="font-mono text-[13px] text-fg-muted">{a.ticker}</dt>
                          <dd
                            className={cn(
                              "text-right text-sm text-fg",
                              row.numeric && row.left !== null && "num",
                              row.left === null && "text-fg-muted",
                            )}
                          >
                            {row.left ?? "Sin dato"}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="font-mono text-[13px] text-fg-muted">{b.ticker}</dt>
                          <dd
                            className={cn(
                              "text-right text-sm text-fg",
                              row.numeric && row.right !== null && "num",
                              row.right === null && "text-fg-muted",
                            )}
                          >
                            {row.right ?? "Sin dato"}
                          </dd>
                        </div>
                      </dl>
                      {winner ? <p className="mt-2 text-[13px] text-fg-muted">{winner}</p> : null}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 hidden max-w-3xl sm:block">
                <table className="w-full border-collapse text-left text-[13px]">
                  <caption className="sr-only">
                    Comparación de datos de empresa de {a.name} y {b.name}
                  </caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className={cn(headerCellClass, "w-[32%] pr-4 text-left")}>
                        Dato
                      </th>
                      <th scope="col" className={cn(headerCellClass, "px-4 text-right text-fg")}>
                        {a.ticker}
                      </th>
                      <th scope="col" className={cn(headerCellClass, "pl-4 text-right text-fg")}>
                        {b.ticker}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.label} className="border-b border-border">
                        <th scope="row" className="py-3 pr-4 align-baseline font-normal text-fg-body">
                          {row.label}
                        </th>
                        <td
                          className={cn(
                            "px-4 py-3 text-right align-baseline",
                            row.numeric && "num",
                            row.left === null ? "text-fg-muted" : "text-fg",
                          )}
                        >
                          {row.left ?? "Sin dato"}
                        </td>
                        <td
                          className={cn(
                            "pl-4 py-3 text-right align-baseline",
                            row.numeric && "num",
                            row.right === null ? "text-fg-muted" : "text-fg",
                          )}
                        >
                          {row.right ?? "Sin dato"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-4 border-t border-border py-5 text-[13px] leading-relaxed text-fg-muted">
              No hay datos de empresa publicados por la SEC para estos activos.
            </p>
          )}

          <div className="mt-4 text-[13px] leading-relaxed text-fg-muted">
            <p>
              Fuente: SEC EDGAR{snapshotDate ? `, datos al ${snapshotDate}` : ""}. Cifras de los últimos 12 meses cuando
              la empresa las publica.
            </p>
            {leftProfile?.sourceUrl || rightProfile?.sourceUrl ? (
              <ul className="mt-1 flex flex-wrap items-center gap-x-4">
                {leftProfile?.sourceUrl ? (
                  <li>
                    <a
                      href={leftProfile.sourceUrl}
                      target="_blank"
                      rel="nofollow noopener"
                      className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg"
                    >
                      Datos de {a.ticker} en EDGAR
                    </a>
                  </li>
                ) : null}
                {rightProfile?.sourceUrl ? (
                  <li>
                    <a
                      href={rightProfile.sourceUrl}
                      target="_blank"
                      rel="nofollow noopener"
                      className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg"
                    >
                      Datos de {b.ticker} en EDGAR
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </section>

        {metrics.length > 0 ? (
          <section aria-labelledby="comparar-tamano" className="mt-10 border-t border-border pt-6">
            <h2 id="comparar-tamano" className="text-2xl sm:text-3xl">
              Tamaño relativo
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-muted">
              Barras proporcionales al mayor valor absoluto de cada fila, con la línea base al centro: a la derecha las
              cifras positivas y a la izquierda las negativas. Sirven para comparar magnitudes, no para medir
              rendimiento.
            </p>
            <div className="mt-6 max-w-2xl space-y-6">
              {metrics.map((metric) => (
                <MetricBars
                  key={metric.label}
                  label={metric.label}
                  a={a}
                  b={b}
                  left={metric.left}
                  right={metric.right}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/acciones" className={buttonClasses({ variant: "primary" })}>
            Ver el catálogo
          </Link>
          <Link href={`/acciones/${a.slug}`} className={linkClass}>
            Ficha de {a.name}
          </Link>
          <Link href={`/acciones/${b.slug}`} className={linkClass}>
            Ficha de {b.name}
          </Link>
          <Link href="/comparar" className={linkClass}>
            Todas las comparaciones
          </Link>
        </div>

        <p className="mt-8 border-t border-border pt-4 text-[13px] leading-relaxed text-fg-body">
          Las cifras de la empresa son datos públicos de la SEC y los precios se mueven durante el día; fuera del
          horario regular de la bolsa de EE.UU. el precio puede variar más. Revisa la ficha de cada activo antes de
          operar. Información, no recomendación de inversión.
        </p>
      </article>
    </LandingSection>
  );
}
