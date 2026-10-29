-- Maverlang — VEL-06: índices del monitor y del panel.
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0010.
-- Idempotente: create index if not exists. No reescribe índices viejos
-- (assets_safety_status_idx sigue). No toca 0001_init.sql.
--
-- 1. asset_safety_events: lib/admin/store.ts filtra symbol y
--    result in ('PASA','NO PASA') y ordena created_at desc, id desc.
-- 2. assets: lib/catalog/monitor.ts filtra safety_status listed/watch
--    y ordena safety_checked_at ascendente con nulos primero.
-- 3. profiles: el panel busca el correo con ilike sin comodines
--    (igualdad sin distinguir mayúsculas).

create index if not exists asset_safety_events_symbol_created_id_idx
  on public.asset_safety_events (symbol, created_at desc, id desc)
  where result in ('PASA', 'NO PASA');

create index if not exists assets_safety_status_checked_at_idx
  on public.assets (safety_status, safety_checked_at asc nulls first);

create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));
