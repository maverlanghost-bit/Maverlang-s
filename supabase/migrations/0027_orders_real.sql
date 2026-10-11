create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  side text not null check (side in ('buy','sell')),
  symbol text not null,
  mint text not null,
  request_id text,
  in_amount_ui numeric not null,
  out_amount_ui numeric,
  price_per_share_usd numeric,
  fee_bps int not null default 0,
  fee_usd numeric not null default 0,
  status text not null check (status in ('pending','submitted','confirmed','failed','expired')),
  signature text unique,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

create unique index if not exists orders_user_request_idx
  on public.orders (user_id, request_id)
  where request_id is not null;

alter table public.orders enable row level security;

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

create table if not exists public.price_ticks (
  symbol text not null,
  t timestamptz not null,
  price_usd numeric not null check (price_usd > 0),
  source text not null default 'jupiter',
  created_at timestamptz not null default now(),
  primary key (symbol, t, source)
);

create index if not exists price_ticks_symbol_t_idx on public.price_ticks (symbol, t desc);

create index if not exists price_ticks_source_idx on public.price_ticks (source, symbol);

alter table public.price_ticks enable row level security;

revoke all on table public.price_ticks from public, anon, authenticated;
