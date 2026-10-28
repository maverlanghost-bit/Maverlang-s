-- Datos públicos de la empresa (SEC EDGAR). Solo servidor, como underlying_prices.
-- No modifica tablas anteriores. No se aplica desde la app: va al SQL Editor.
create table if not exists public.company_facts (
  underlying                 text primary key,
  cik                        text,
  name                       text,
  sic                        text,
  sic_description            text,
  exchange                   text,
  fiscal_year_end            text,
  shares_outstanding         numeric,
  shares_as_of               date,
  eps_ttm                    numeric,
  eps_period_end             date,
  revenue_ttm                numeric,
  net_income_ttm             numeric,
  dividends_per_share_ttm    numeric,
  last_10k                   date,
  last_10q                   date,
  last_filing_form           text,
  source_url                 text,
  updated_at                 timestamptz not null default now()
);

alter table public.company_facts enable row level security;
revoke all on table public.company_facts from public, anon, authenticated;
