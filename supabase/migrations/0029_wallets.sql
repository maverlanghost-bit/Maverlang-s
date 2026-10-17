-- M66: billeteras Solana verificadas por usuario.
-- `public.wallets` es la fuente de verdad por cadena; `profiles.wallet_address`
-- queda como columna de lectura rápida (espejo de la primaria). La escritura
-- es sólo del servidor (service role, M57): para los usuarios queda RLS con
-- lectura propia y sin insert/update/delete.

alter table public.profiles add column if not exists wallet_address text;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chain text not null default 'solana' check (chain in ('solana')),
  address text not null,
  privy_wallet_id text,
  wallet_client_type text not null default 'privy' check (wallet_client_type in ('privy', 'external')),
  is_primary boolean not null default true,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain, address)
);

create index if not exists wallets_one_primary_per_user
  on public.wallets (user_id, chain) where is_primary = true;
create index if not exists wallets_user_id_idx on public.wallets (user_id);

alter table public.wallets enable row level security;

revoke all on public.wallets from anon, authenticated;
grant select on public.wallets to authenticated;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own
  for select to authenticated
  using (auth.uid() = user_id);
