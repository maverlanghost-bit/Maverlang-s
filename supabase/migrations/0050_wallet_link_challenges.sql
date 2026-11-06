-- 0050 — Desafíos de vinculación de billetera (Supabase ↔ Privy ↔ firma).
--
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0041.
-- Idempotente: se puede volver a ejecutar.
--
-- Por qué existe: `POST /api/me/wallet` estaba cerrado (503) porque tener a la
-- vez una sesión Supabase y un access token de Privy sólo demuestra posesión
-- simultánea, no que la billetera sea de la misma persona (TOFU). Ahora el
-- servidor emite un nonce de un solo uso, atado a usuario, DID de Privy,
-- dirección, cadena, dominio, propósito y vencimiento; el cliente firma el
-- mensaje exacto con la billetera (ed25519) y el servidor lo verifica antes de
-- guardar nada.
--
-- Por qué en la base: un nonce en memoria de una lambda no se puede consumir
-- una sola vez entre instancias. Esta tabla es la fuente de verdad del
-- "un solo uso": `consumed_at` se marca con un UPDATE condicional atómico.
--
-- Reglas que implementa el servidor (lib/wallet/link-challenge.ts y
-- lib/wallet/link-challenge-store.ts):
-- - Se guarda el SHA-256 del nonce, nunca el nonce en claro.
-- - Un nonce vence en 5 minutos y sólo sirve para el usuario, DID, dirección,
--   cadena, dominio y propósito con los que se emitió.
-- - El consumo es un único UPDATE con `consumed_at is null` y
--   `expires_at > now()`: dos requests concurrentes no pueden ganar los dos.
-- - La tabla no es legible ni escribible por el cliente: sólo service_role.
--
-- Comprobación (SQL Editor), después de aplicar:
--   select count(*) from public.wallet_link_challenges;
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'wallet_link_challenges'
--     order by ordinal_position;

create table if not exists public.wallet_link_challenges (
  nonce_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  privy_user_id text not null,
  address text not null,
  chain text not null default 'solana' check (chain in ('solana')),
  domain text not null,
  purpose text not null,
  message text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wallet_link_challenges_nonce_hash_format
    check (nonce_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_link_challenges_privy_user_id_format
    check (privy_user_id like 'did:privy:%'),
  constraint wallet_link_challenges_address_not_blank
    check (length(btrim(address)) > 0),
  constraint wallet_link_challenges_domain_not_blank
    check (length(btrim(domain)) > 0),
  constraint wallet_link_challenges_purpose_not_blank
    check (length(btrim(purpose)) > 0),
  constraint wallet_link_challenges_expiry_after_issue
    check (expires_at > issued_at)
);

-- Limpieza y búsqueda por usuario. El índice parcial de pendientes evita
-- recorrer desafíos ya consumidos al listar o borrar los vencidos.
create index if not exists wallet_link_challenges_user_idx
  on public.wallet_link_challenges (user_id, expires_at desc);

create index if not exists wallet_link_challenges_pending_idx
  on public.wallet_link_challenges (user_id, expires_at)
  where consumed_at is null;

alter table public.wallet_link_challenges enable row level security;
alter table public.wallet_link_challenges force row level security;

-- Sin políticas: anon y authenticated no leen ni escriben. El servidor usa
-- service_role (BYPASSRLS), igual que en wallets/crypto_deposits (0041).
revoke all on table public.wallet_link_challenges from public, anon, authenticated;

comment on table public.wallet_link_challenges is
  'Desafíos de un solo uso para vincular billetera Solana a una cuenta Supabase. Nonce hasheado; escritura sólo service_role.';
comment on column public.wallet_link_challenges.nonce_hash is
  'SHA-256 hex del nonce entregado al cliente. El nonce en claro no se guarda.';
comment on column public.wallet_link_challenges.message is
  'Mensaje exacto (UTF-8) que el cliente firmó. Se reconstruye y compara al consumir.';
comment on column public.wallet_link_challenges.consumed_at is
  'Se marca con un UPDATE condicional: garantiza un solo uso incluso con requests concurrentes.';
