import "server-only";

import { tickerBySymbol } from "@/config/tickers";
import { findAssetBySymbol } from "@/lib/catalog/assets";
import {
  companyView,
  dayOrNull,
  numericOrNull,
  textOrNull,
  type CompanyFactsView,
} from "@/lib/market/fundamentals";
import { toYahooSymbol } from "@/lib/market/yahoo-symbol";
import { preferredUnderlyingRaw } from "@/lib/services/company-facts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Clave de `company_facts` y de `underlying_prices`.
 * Con ticker curado es la misma que el historial (`yahooSymbol` sin MIC).
 * Si el símbolo no está en el catálogo curado, usa el subyacente de `assets`.
 */
export function companyUnderlyingKey(
  symbol: string,
  asset: { underlying?: string | null; companyTicker?: string | null } | null,
): string {
  const ticker = tickerBySymbol(symbol);
  const raw = preferredUnderlyingRaw({
    tickerUnderlying: ticker?.underlying,
    assetUnderlying: asset?.underlying,
    companyTicker: asset?.companyTicker,
  });
  return raw ? toYahooSymbol(raw) : "";
}

/** Fila de EDGAR + último cierre. Null si no hay fila: la ruta responde 404. */
export async function readCompanyForSymbol(symbol: string): Promise<CompanyFactsView | null> {
  const ticker = tickerBySymbol(symbol);
  const asset = ticker?.underlying
    ? null
    : await findAssetBySymbol(symbol, { scope: "all", noListing: true });
  const underlying = companyUnderlyingKey(symbol, asset);
  if (!underlying) return null;

  const admin = createSupabaseAdminClient();
  const [factResult, closeResult] = await Promise.all([
    admin.from("company_facts").select("*").eq("underlying", underlying).maybeSingle(),
    admin
      .from("underlying_prices")
      .select("date,close")
      .eq("underlying", underlying)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (factResult.error) throw factResult.error;
  if (closeResult.error) throw closeResult.error;
  if (!factResult.data) return null;

  const row = factResult.data as Record<string, unknown>;
  const close = closeResult.data as { date?: unknown; close?: unknown } | null;
  return companyView({
    symbol,
    underlying,
    name: textOrNull(row.name),
    sector: textOrNull(row.sic_description),
    sic: textOrNull(row.sic),
    exchange: textOrNull(row.exchange),
    fiscalYearEnd: textOrNull(row.fiscal_year_end),
    sharesOutstanding: numericOrNull(row.shares_outstanding),
    sharesAsOf: dayOrNull(row.shares_as_of),
    lastClose: numericOrNull(close?.close),
    lastCloseDate: dayOrNull(close?.date),
    epsTtm: numericOrNull(row.eps_ttm),
    epsPeriodEnd: dayOrNull(row.eps_period_end),
    revenueTtm: numericOrNull(row.revenue_ttm),
    netIncomeTtm: numericOrNull(row.net_income_ttm),
    dividendsPerShareTtm: numericOrNull(row.dividends_per_share_ttm),
    last10k: dayOrNull(row.last_10k),
    last10q: dayOrNull(row.last_10q),
    lastFilingForm: textOrNull(row.last_filing_form),
    sourceUrl: textOrNull(row.source_url),
    updatedAt: textOrNull(row.updated_at),
    // Columnas de 0039: si la migración no está aplicada, quedan en null.
    reportCurrency: textOrNull(row.report_currency),
    fundFamily: textOrNull(row.fund_family),
    fundNetAssets: numericOrNull(row.fund_net_assets),
    fundReportDate: dayOrNull(row.fund_report_date),
    fundHoldingsCount: numericOrNull(row.fund_holdings_count),
    fundTopHoldings: row.fund_top_holdings ?? null,
  });
}
