-- Maverlang — cierre de escritura del cliente en copy_trading (DB-H / P0-7).
-- NO APLICADA. Idempotente: se puede volver a ejecutar.
-- Contexto: 0053 ya fue publicada con políticas de INSERT/UPDATE/DELETE para
-- `authenticated` en `copy_follows`. Editar 0053 in situ no cambia las bases que
-- ya la corrieron, así que 0053 quedó restaurada a su versión publicada y este
-- parche hacia adelante hace el cierre real.
-- Efecto: con la clave pública y un JWT propio ya no se puede forjar `weights`
-- ni `account = 'real'` para saltarse el paywall. Toda escritura de copy_*
-- pasa por service_role tras validar suscripción y pesos en el servidor.

-- 1. RLS forzada en todas las tablas de copy_trading y billing.
alter table public.copy_subscriptions force row level security;
alter table public.billing_events force row level security;
alter table public.copy_follows force row level security;
alter table public.copy_runs force row level security;
alter table public.copy_feed_snapshots force row level security;

-- 2. copy_follows: el cliente sólo lee lo suyo.
drop policy if exists "copy_follows_insert_own" on public.copy_follows;
drop policy if exists "copy_follows_update_own" on public.copy_follows;
drop policy if exists "copy_follows_delete_own" on public.copy_follows;

revoke all on table public.copy_follows from public, anon, authenticated;
grant select on table public.copy_follows to authenticated;
grant all on table public.copy_follows to service_role;
