-- Maverlang — favoritas por usuario.
-- NO APLICADA. Sólo para un proyecto nuevo o para sumar a uno existente:
-- Pegar UNA vez en el SQL Editor DESPUÉS de 0002_supabase_auth.sql.
-- Idempotente: se puede volver a ejecutar.
-- Cada persona sólo lee y escribe sus filas. El servidor usa la sesión (RLS).

create table if not exists public.user_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  symbol text not null check (char_length(btrim(symbol)) between 1 and 12),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.user_favorites enable row level security;

drop policy if exists user_favorites_select_own on public.user_favorites;
create policy user_favorites_select_own
  on public.user_favorites
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_favorites_insert_own on public.user_favorites;
create policy user_favorites_insert_own
  on public.user_favorites
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_favorites_delete_own on public.user_favorites;
create policy user_favorites_delete_own
  on public.user_favorites
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_favorites from public, anon, authenticated;
grant select, insert, delete on table public.user_favorites to authenticated;
