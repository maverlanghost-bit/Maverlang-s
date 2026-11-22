-- Maverlang — borrado de cuenta por anonimización (DB-D / AUTH-6 / WEB-4,
-- Ley 21.719).
-- NO APLICADA. Idempotente: se puede volver a ejecutar.
-- Problema: no existía borrado de cuenta y, si se borraba `auth.users`, los
-- `ON DELETE CASCADE` arrastraban órdenes, movimientos, retiros y
-- `compliance_events`, que la UAF exige conservar.
-- Cierre:
--   1. Las FK de tablas financieras/de cumplimiento pasan a ON DELETE RESTRICT
--      (hacia public.profiles y auth.users). Borrar al usuario con historial
--      falla; la vía soportada es `anonymize_user`.
--   2. `account_deletion_requests` + `request_my_deletion()` (el usuario pide
--      el borrado) y `anonymize_user(uuid)` (sólo service_role): borra PII y
--      datos de uso, conserva el historial legal.
--   3. `ai_shared_chats`: expiración, revocación y borrado en cascada con el
--      dueño (P0-5).
-- Retención: NO borra orders, wallet_movements, crypto_deposits,
-- wallet_withdrawals, trade_reservations, compliance_events, consents ni
-- filas de billing.

-- 1. FK financieras -> RESTRICT ------------------------------------------------
-- Reescribe, con el mismo nombre y definición, cada FK con ON DELETE CASCADE
-- hacia auth.users o public.profiles de estas tablas. Idempotente: sólo toca
-- las que siguen en CASCADE.
do $$
declare
  r record;
  tablas constant text[] := array[
    'orders', 'wallet_movements', 'crypto_deposits', 'wallet_withdrawals',
    'trade_reservations', 'sponsor_usage', 'sponsor_usage_requests',
    'compliance_events', 'consents', 'wallets', 'copy_subscriptions',
    'copy_runs'
  ];
begin
  for r in
    select c.conrelid::regclass as tabla,
           c.conname,
           pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where c.contype = 'f'
       and c.confdeltype = 'c'
       and n.nspname = 'public'
       and cl.relname = any (tablas)
       and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
  loop
    execute format(
      'alter table %s drop constraint %I, add constraint %I %s',
      r.tabla,
      r.conname,
      r.conname,
      replace(r.def, 'ON DELETE CASCADE', 'ON DELETE RESTRICT')
    );
    raise notice '0058: % . % -> ON DELETE RESTRICT', r.tabla, r.conname;
  end loop;
end
$$;

-- 2. Solicitudes de borrado ---------------------------------------------------
create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users (id) on delete restrict,
  requested_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'cancelled')),
  processed_at timestamptz
);

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;

drop policy if exists account_deletion_requests_select_own on public.account_deletion_requests;
create policy account_deletion_requests_select_own
  on public.account_deletion_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists account_deletion_requests_mfa_restrictive on public.account_deletion_requests;
create policy account_deletion_requests_mfa_restrictive
  on public.account_deletion_requests
  as restrictive
  for all
  to authenticated
  using (not public.mfa_step_pending())
  with check (not public.mfa_step_pending());

revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant select on table public.account_deletion_requests to authenticated;
grant all on table public.account_deletion_requests to service_role;

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests (status, requested_at);

-- 3. request_my_deletion: el usuario pide el borrado --------------------------
-- Una solicitud pendiente conserva su requested_at original; una cancelada se
-- reabre con fecha nueva; una procesada no cambia.
create or replace function public.request_my_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_requested timestamptz;
begin
  if v_uid is null then
    raise exception 'no_session' using errcode = '42501';
  end if;
  if public.mfa_step_pending() then
    raise exception 'mfa_requerido' using errcode = '42501';
  end if;

  insert into public.account_deletion_requests as r (user_id)
  values (v_uid)
  on conflict (user_id) do update
    set status = case when r.status = 'cancelled' then 'pending' else r.status end,
        requested_at = case when r.status = 'cancelled' then now() else r.requested_at end,
        processed_at = case when r.status = 'cancelled' then null else r.processed_at end
  returning r.requested_at into v_requested;

  return v_requested;
end;
$$;

revoke all on function public.request_my_deletion() from public, anon, authenticated;
grant execute on function public.request_my_deletion() to authenticated;

-- 4. anonymize_user: sólo service_role ----------------------------------------
-- Vacía la PII del perfil y borra datos de uso. El perfil queda como ancla de
-- las FK del historial legal. `app.profile_write` abre el bypass del trigger de
-- bloqueo de perfil (0043/0045/0046); sólo se tocan columnas que el trigger de
-- cumplimiento (0015) no protege. `email` admite NULL (0002) y no tiene índice
-- único, así que se deja en NULL.
create or replace function public.anonymize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null then
    raise exception 'usuario_requerido' using errcode = '22023';
  end if;

  perform set_config('app.profile_write', 'on', true);
  begin
    update public.profiles
       set nombre = null,
           rut = null,
           telefono = null,
           fecha_nacimiento = null,
           email = null,
           updated_at = now()
     where id = p_user;
  exception
    when others then
      perform set_config('app.profile_write', 'off', true);
      raise;
  end;
  perform set_config('app.profile_write', 'off', true);

  delete from public.preferences where user_id = p_user;
  delete from public.user_favorites where user_id = p_user;
  delete from public.price_alerts where user_id = p_user;
  delete from public.external_holdings where user_id = p_user;
  delete from public.ai_shared_chats where owner_id = p_user;

  insert into public.account_deletion_requests as r (user_id, status, processed_at)
  values (p_user, 'processed', now())
  on conflict (user_id) do update
    set status = 'processed',
        processed_at = now();
end;
$$;

revoke all on function public.anonymize_user(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_user(uuid) to service_role;

-- 5. ai_shared_chats: expiración, revocación y cascada con el dueño ----------
alter table public.ai_shared_chats
  add column if not exists expires_at timestamptz not null default (now() + interval '90 days');
alter table public.ai_shared_chats
  add column if not exists revoked_at timestamptz;

-- Los enlaces creados antes de la firma HMAC de respuestas (P0-5) pueden
-- contener texto "asistente" escrito por el cliente. Se revocan una sola vez:
-- la fecha fija hace que reaplicar 0058 no toque enlaces nuevos.
update public.ai_shared_chats
   set revoked_at = now()
 where revoked_at is null
   and created_at < timestamptz '2026-11-22 00:00:00-03';

do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.contype = 'f'
       and c.conrelid = 'public.ai_shared_chats'::regclass
       and c.confrelid = 'auth.users'::regclass
       and c.confdeltype <> 'c'
  loop
    execute format(
      'alter table public.ai_shared_chats drop constraint %I, add constraint %I '
      || 'foreign key (owner_id) references auth.users (id) on delete cascade',
      r.conname, r.conname
    );
  end loop;
end
$$;

create index if not exists ai_shared_chats_owner_idx
  on public.ai_shared_chats (owner_id);
