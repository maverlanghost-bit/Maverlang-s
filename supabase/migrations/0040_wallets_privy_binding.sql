-- 0040 — Asociación persistente entre identidad Privy y billetera.
--
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0029.
-- Idempotente: se puede volver a ejecutar.
--
-- Por qué: M66 verificaba el access token de Privy y leía la billetera con el
-- DID verificado, pero no guardaba ese DID. Sin él, la asociación sólo vivía
-- durante el request: dos cuentas Supabase podían presentar la misma identidad
-- Privy (en momentos distintos) y quedarse con billeteras distintas de esa
-- misma persona. Ahora el DID se persiste y es único.
--
-- Reglas que implementa el servidor (lib/services/wallet.supabase.ts):
-- - Un DID `did:privy:…` pertenece a una sola cuenta Supabase.
-- - Una cuenta Supabase no puede alternar a otro DID sin intervención.
-- - Una dirección Solana se compara como texto EXACTO (base58 distingue
--   mayúsculas). No hay comparaciones `lower()` ni `ilike`.
--
-- RLS: la tabla `wallets` ya es sólo service_role para escritura y SELECT
-- propio para el usuario (0029). La columna nueva hereda esos privilegios.

alter table public.wallets
  add column if not exists privy_user_id text;

-- Un DID no puede quedar vinculado a dos filas/cuentas. Índice parcial para
-- no bloquear las filas antiguas (que quedan con privy_user_id = null hasta
-- que el usuario vuelva a sincronizar su billetera).
create unique index if not exists wallets_privy_user_id_key
  on public.wallets (privy_user_id)
  where privy_user_id is not null;

comment on column public.wallets.privy_user_id is
  'DID de Privy (did:privy:...) verificado al vincular la billetera. Identifica la identidad dueña; único entre cuentas.';

-- Comprobación (SQL Editor):
-- 1. Columna e índice existen:
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'wallets'
--       and column_name = 'privy_user_id';
--   select indexname from pg_indexes
--     where schemaname = 'public' and tablename = 'wallets'
--       and indexname = 'wallets_privy_user_id_key';
-- 2. No hay DIDs duplicados (debe devolver 0 filas):
--   select privy_user_id, count(*) from public.wallets
--     where privy_user_id is not null
--     group by privy_user_id having count(*) > 1;
