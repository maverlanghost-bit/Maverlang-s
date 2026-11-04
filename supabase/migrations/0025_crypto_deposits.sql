-- Maverlang — depósitos de cripto detectados on-chain (Fase 3).
-- Idempotente: se puede volver a ejecutar.
-- Registra cada entrada de USDC (u otro mint conocido) a la billetera del
-- usuario, para mostrarla en el historial como kind "deposit". La firma es
-- única: un depósito no se cuenta dos veces.
--
-- Compatibilidad: `profiles.id` es uuid desde 0002. La versión histórica de
-- esta migración declaraba `user_id text` y el FK text → uuid no se puede
-- crear en PostgreSQL; por eso fallaba en una base nueva antes de 0027. Se
-- corrige el tipo a uuid. `create table if not exists` significa que una base
-- donde la tabla ya existe (por ejemplo, creada por 0027) no se altera y no
-- se pierde ningún dato; 0027 mantiene la misma definición uuid.

create table if not exists public.crypto_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
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
