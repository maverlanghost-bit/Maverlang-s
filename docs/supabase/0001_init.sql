-- NO APLICAR: reemplazado por 0002 (Supabase Auth).
-- Este archivo usa ids de texto (Privy). En un proyecto vacío pega sólo 0002_supabase_auth.sql.
-- Maverlang — esquema inicial. Identidad = Privy DID (text). Acceso sólo vía service role.
create table if not exists profiles (
  id text primary key,                       -- Privy DID
  email text,
  display_name text,
  country char(2),
  is_us_person boolean,
  wallet_address text unique,
  onboarding_completed boolean not null default false,
  language text not null default 'es-CL',
  display_currency text not null default 'CLP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consents (
  id bigserial primary key,
  user_id text not null references profiles(id) on delete cascade,
  doc text not null check (doc in ('terminos','privacidad','riesgos')),
  version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  unique (user_id, doc, version)
);

create table if not exists preferences (
  user_id text primary key references profiles(id) on delete cascade,
  notify_orders boolean not null default true,
  notify_deposits boolean not null default true,
  notify_news boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id),
  side text not null check (side in ('buy','sell')),
  symbol text not null,
  mint text not null,
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
create index if not exists orders_user_idx on orders(user_id, created_at desc);

create table if not exists onramp_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id),
  provider text not null,
  provider_ref text,
  amount_clp numeric not null,
  estimated_usdc numeric,
  status text not null default 'created',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  user_id text,
  action text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table consents enable row level security;
alter table preferences enable row level security;
alter table orders enable row level security;
alter table onramp_sessions enable row level security;
alter table audit_log enable row level security;
-- Sin políticas: anon/authenticated no tienen acceso. Sólo service role (servidor).
