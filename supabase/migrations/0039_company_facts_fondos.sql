-- Ficha ampliada: emisores extranjeros (20-F / 40-F) y fondos cotizados (N-PORT).
-- Solo agrega columnas opcionales a company_facts. No borra ni cambia datos.
-- No se aplica desde la app: va al SQL Editor (con el OK de Manu).
alter table public.company_facts
  add column if not exists report_currency     text,
  add column if not exists fund_family         text,
  add column if not exists fund_net_assets     numeric,
  add column if not exists fund_report_date    date,
  add column if not exists fund_holdings_count integer,
  add column if not exists fund_top_holdings   jsonb;
