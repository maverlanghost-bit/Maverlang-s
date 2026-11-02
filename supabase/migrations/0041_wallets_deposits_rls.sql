-- 0041 — Endurecimiento RLS de billeteras, depósitos y retiros (auditoría 2026-11).
--
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0040.
-- Idempotente: se puede volver a ejecutar.
-- No toca 0001_init.sql ni los archivos de trading.
--
-- Qué cierra:
-- 1. RLS forzada en las tablas de billetera. `force` evita que el dueño de la
--    tabla (el rol que corrió las migraciones) se salte las políticas por
--    accidente. `service_role` sigue con BYPASSRLS: el servidor no cambia.
-- 2. `public.wallets` deja de exponer identificadores de Privy al navegador:
--    el usuario sólo puede leer columnas públicas de sus filas verificadas.
--    `privy_wallet_id` y `privy_user_id` quedan fuera del GRANT de columna.
-- 3. Una lectura directa por REST con una sesión `aal1` que tiene TOTP
--    verificado ya no ve la billetera: la política exige `aal2` cuando
--    corresponde. Sin factor TOTP no cambia nada (`aal1` sigue permitido).
-- 4. Restricciones de identidad en la base (además de las del servidor):
--    formato del DID, dirección no vacía y una sola identidad Privy por
--    cuenta Supabase. Los checks se agregan `NOT VALID` para no romper con
--    filas históricas; las filas nuevas sí se validan.
--
-- Comprobaciones que el operador debe correr ANTES de aplicar (deben dar 0
-- filas; si hay filas, limpiarlas a mano antes de crear el índice único):
--
--   select user_id, count(*) from public.wallets
--     where privy_user_id is not null
--     group by user_id having count(*) > 1;
--
--   select id, privy_user_id from public.wallets
--     where privy_user_id is not null
--       and privy_user_id not like 'did:privy:%';
--
-- Después de aplicar, validar las restricciones cuando los datos históricos
-- estén limpios:
--
--   alter table public.wallets validate constraint wallets_privy_user_id_format;
--   alter table public.wallets validate constraint wallets_address_not_blank;
--   alter table public.crypto_deposits validate constraint crypto_deposits_signature_not_blank;
--   alter table public.crypto_deposits validate constraint crypto_deposits_amount_bounds;
--   alter table public.wallet_movements validate constraint wallet_movements_reference_not_blank;
--   alter table public.wallet_movements validate constraint wallet_movements_signature_not_blank;
--   alter table public.wallet_movements validate constraint wallet_movements_amount_bounds;

-- 1. RLS forzada. Las tablas internas siguen SIN políticas (niegan todo a
-- anon/authenticated); el servidor las toca con service_role.
alter table public.wallets enable row level security;
alter table public.wallets force row level security;

alter table public.crypto_deposits enable row level security;
alter table public.crypto_deposits force row level security;

alter table public.wallet_movements enable row level security;
alter table public.wallet_movements force row level security;

alter table public.wallet_reconciliations enable row level security;
alter table public.wallet_reconciliations force row level security;

revoke all on table public.crypto_deposits from public, anon, authenticated;
revoke all on table public.wallet_movements from public, anon, authenticated;
revoke all on table public.wallet_reconciliations from public, anon, authenticated;

-- 2. wallets: lectura propia y sólo de columnas públicas. Sin INSERT, UPDATE
-- ni DELETE para clientes. La escritura sigue siendo exclusiva del servidor.
revoke all on table public.wallets from public, anon, authenticated;
-- Refuerzo explícito por si un GRANT de columna anterior dejó pasar los ids.
revoke all (privy_wallet_id, privy_user_id) on table public.wallets
  from public, anon, authenticated;

grant select (
  id,
  user_id,
  chain,
  address,
  wallet_client_type,
  is_primary,
  verified_at,
  created_at
) on table public.wallets to authenticated;

-- 3. MFA en la base: una sesión `aal1` con TOTP verificado no puede leer la
-- billetera ni por REST. Es defensa en profundidad: la app ya responde 401 en
-- la API (lib/services/auth.supabase.ts) y redirige a verificar en el gate.
-- La función es SECURITY DEFINER para poder consultar auth.mfa_factors, que no
-- es legible por authenticated. Si la consulta falla, la política deniega
-- (fail-closed).
create or replace function public.mfa_step_pending()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
    and exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = auth.uid()
        and f.factor_type = 'totp'
        and f.status = 'verified'
    );
$$;

revoke all on function public.mfa_step_pending()
  from public, anon, authenticated;
grant execute on function public.mfa_step_pending() to authenticated;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own
  on public.wallets
  for select
  to authenticated
  using (
    auth.uid() = user_id
    -- Sólo filas con identidad Privy demostrable (0040). Las filas antiguas
    -- sin DID no se exponen ni se pueden usar para operar.
    and privy_user_id like 'did:privy:%'
    and not public.mfa_step_pending()
  );

-- 4. Restricciones de identidad y de datos. `NOT VALID` deja intactas las
-- filas históricas; se aplican a todo lo nuevo.
alter table public.wallets
  drop constraint if exists wallets_privy_user_id_format;
alter table public.wallets
  add constraint wallets_privy_user_id_format
  check (privy_user_id is null or privy_user_id like 'did:privy:%')
  not valid;

alter table public.wallets
  drop constraint if exists wallets_address_not_blank;
alter table public.wallets
  add constraint wallets_address_not_blank
  check (length(btrim(address)) > 0)
  not valid;

-- Una cuenta Supabase no puede acumular dos identidades Privy distintas.
-- El servidor ya lo rechaza (lib/wallet/identity.ts); esto lo hace cumplir
-- también ante escrituras accidentales con service_role.
create unique index if not exists wallets_one_privy_identity_per_user
  on public.wallets (user_id)
  where privy_user_id is not null;

alter table public.crypto_deposits
  drop constraint if exists crypto_deposits_signature_not_blank;
alter table public.crypto_deposits
  add constraint crypto_deposits_signature_not_blank
  check (signature is null or length(btrim(signature)) > 0)
  not valid;

alter table public.crypto_deposits
  drop constraint if exists crypto_deposits_amount_bounds;
alter table public.crypto_deposits
  add constraint crypto_deposits_amount_bounds
  check (amount_ui > 0 and amount_ui < 1e15)
  not valid;

alter table public.wallet_movements
  drop constraint if exists wallet_movements_amount_bounds;
alter table public.wallet_movements
  add constraint wallet_movements_amount_bounds
  check (amount_ui > 0 and amount_ui < 1e15)
  not valid;

alter table public.wallet_movements
  drop constraint if exists wallet_movements_reference_not_blank;
alter table public.wallet_movements
  add constraint wallet_movements_reference_not_blank
  check (length(btrim(reference)) > 0)
  not valid;

alter table public.wallet_movements
  drop constraint if exists wallet_movements_signature_not_blank;
alter table public.wallet_movements
  add constraint wallet_movements_signature_not_blank
  check (signature is null or length(btrim(signature)) > 0)
  not valid;

comment on function public.mfa_step_pending() is
  'True si la sesión tiene un TOTP verificado y no está en aal2. Usada por la RLS de wallets; fail-closed.';
comment on column public.wallets.privy_user_id is
  'DID de Privy verificado al vincular. Único por cuenta (0041) y no expuesto al cliente.';
