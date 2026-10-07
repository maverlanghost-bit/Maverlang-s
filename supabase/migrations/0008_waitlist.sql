-- Maverlang — lista de espera de la cuenta Real (M45).
-- Aplicar DESPUÉS de 0007_demo_usd.sql. Se puede pegar completa en el SQL Editor.
-- Idempotente: se puede volver a ejecutar.
-- Sólo el servidor escribe con la secret key (service_role pasa el RLS):
-- RLS activado y SIN políticas, así que nadie lee ni escribe desde el navegador.

create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) between 3 and 254),
  email_norm text generated always as (lower(btrim(email))) stored unique,
  source text not null default 'landing' check (source in ('landing', 'cuenta_real')),
  consent_version text not null,
  country text check (country is null or char_length(country) = 2),
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

revoke all on table public.waitlist from public, anon, authenticated;
