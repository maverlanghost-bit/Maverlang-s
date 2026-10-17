-- Maverlang — movimientos unificados de billetera y conciliación (M81).
-- Idempotente: se puede volver a ejecutar.
--
-- Unifica en una sola tabla los movimientos que la app registra por usuario:
-- depósitos de cripto detectados on-chain (crypto_deposits), sesiones de
-- on-ramp completadas (koywe) y retiros/envíos enviados desde la app.
-- La firma (o la referencia del proveedor) es única: un movimiento no se
-- cuenta dos veces. `reconcile-wallet` escribe aquí y /api/wallet/activity
-- puede leer de acá para mostrar el feed unificado.

create table if not exists public.wallet_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- deposit | onramp | withdraw
  kind text not null check (kind in ('deposit', 'onramp', 'withdraw')),
  -- USDC o mint de xStocks
  mint text not null,
  amount_ui numeric not null check (amount_ui > 0),
  -- firma de Solana (depósito/retiro) o referencia del proveedor (on-ramp)
  reference text not null unique,
  -- pending cuando falta confirmación on-chain; confirmed cuando calza
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed')),
  -- firma on-chain en Solscan (deposit/withdraw); null para onramp
  signature text,
  -- wallet de origen (depósito) o destino (retiro)
  counterparty_address text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_reconciled_at timestamptz
);

create index if not exists wallet_movements_user_created_idx
  on public.wallet_movements (user_id, created_at desc);

create index if not exists wallet_movements_pending_idx
  on public.wallet_movements (status, created_at)
  where status = 'pending';

alter table public.wallet_movements enable row level security;

-- Sin políticas: sólo service_role lee y escribe (la conciliación la corre
-- el cron del servidor). El cliente nunca accede directo a esta tabla;
-- el feed unificado sale por /api/wallet/activity con la sesión del usuario.

-- Historial de corridas de conciliación (resumen para /admin y monitoreo).
create table if not exists public.wallet_reconciliations (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  -- usuarios revisados en esta corrida
  users_reviewed int not null default 0,
  -- movimientos pendientes resueltos (confirmed o failed)
  pending_resolved int not null default 0,
  -- movimientos externos legítimos detectados (el usuario mueve fondos
  -- por fuera de la app; no se alerta, sólo se registra)
  external_count int not null default 0,
  -- diferencias que la app no puede explicar → alerta a ops
  unexplained_count int not null default 0,
  -- milisegundos que tomó la corrida (presupuesto de 50 s)
  duration_ms int not null default 0,
  -- true si la corrida quedó pendiente por presupuesto (continúa en la siguiente)
  truncated boolean not null default false,
  details jsonb
);

alter table public.wallet_reconciliations enable row level security;
