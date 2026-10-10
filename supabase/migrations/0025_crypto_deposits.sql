-- Maverlang — depósitos de cripto detectados on-chain (Fase 3).
-- Idempotente: se puede volver a ejecutar.
-- Registra cada entrada de USDC (u otro mint conocido) a la billetera del
-- usuario, para mostrarla en el historial como kind "deposit". La firma es
-- única: un depósito no se cuenta dos veces.

create table if not exists public.crypto_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  mint text not null,
  amount_ui numeric not null check (amount_ui > 0),
  signature text unique,
  from_address text,
  created_at timestamptz not null default now()
);

create index if not exists crypto_deposits_user_created_idx
  on public.crypto_deposits (user_id, created_at desc);

alter table public.crypto_deposits enable row level security;

-- Sin políticas: sólo service_role lee y escribe (el servidor detecta y
-- registra). El cliente no accede directo a esta tabla.
