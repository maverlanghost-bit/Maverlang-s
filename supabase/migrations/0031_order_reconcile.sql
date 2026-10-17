-- Maverlang — M72: conciliación de órdenes reales con la cadena.
-- Idempotente: se puede volver a ejecutar.
-- Agrega a `orders` lo que la conciliación necesita leer/escribir:
--   is_demo            false = orden real (las demo no se concilian)
--   tx_signature       firma on-chain consultada con getSignatureStatuses
--   quote_expires_at   vencimiento de la cotización (órdenes pending)
--   error_code         código de dominio legible (QUOTE_EXPIRED, TX_EXPIRED, …)
--   confirmed_at        momento en que la cadena confirmó la transacción

alter table public.orders
  add column if not exists is_demo boolean not null default false;

alter table public.orders
  add column if not exists tx_signature text;

alter table public.orders
  add column if not exists quote_expires_at timestamptz;

alter table public.orders
  add column if not exists error_code text;

alter table public.orders
  add column if not exists confirmed_at timestamptz;

-- Copia la firma histórica a la columna nueva (una sola vez).
-- `signature` es unique en 0027/0024; `tx_signature` es la misma firma,
-- en una columna sin unique para que dos corridas no compitan por ella.
update public.orders
  set tx_signature = signature
  where tx_signature is null
    and signature is not null;

-- La conciliación sólo recorre órdenes reales abiertas con antigüedad: sin
-- este índice cada corrida del cron barre la tabla completa.
create index if not exists orders_reconcile_idx
  on public.orders (created_at)
  where is_demo = false and status in ('pending','submitted');

