-- Maverlang — integridad de identidad y billetera (DB-I).
-- NO APLICADA. Idempotente: se puede volver a ejecutar.
-- Problema: una persona podía abrir N cuentas con el mismo RUT (N veces los
-- límites) y `wallets_one_primary_per_user` (0029) era un índice común, no
-- único, así que un usuario podía tener varias billeteras primarias.
-- Cierre: dos índices únicos parciales. Cada uno se crea dentro de un bloque
-- que primero busca duplicados: si los hay, emite WARNING con el recuento y
-- NO crea el índice (la migración no falla). Resolver los duplicados a mano y
-- volver a ejecutar.
-- DB-M (nota): `reserve_trade_amount` (0042/0047) cuenta los estados 'signed' y
-- 'built', que el CHECK de orders (0027) no permite. Es inocuo (nunca
-- coinciden) y no se toca aquí; limpiar en la próxima reescritura de la función.

-- 1. Una billetera primaria por usuario y cadena.
do $$
declare
  v_dups bigint;
begin
  select count(*) into v_dups
    from (
      select 1
        from public.wallets
       where is_primary = true
       group by user_id, chain
      having count(*) > 1
    ) d;
  if v_dups > 0 then
    raise warning '0059: % usuario(s) con más de una billetera primaria; no se crea wallets_one_primary_per_user_uidx', v_dups;
    return;
  end if;
  create unique index if not exists wallets_one_primary_per_user_uidx
    on public.wallets (user_id, chain) where is_primary = true;
  -- El índice común de 0029 queda redundante.
  drop index if exists public.wallets_one_primary_per_user;
end
$$;

-- 2. Un RUT por persona, sólo con onboarding completo. Se normaliza para que
-- "12.345.678-5" y "123456785" cuenten como el mismo RUT.
do $$
declare
  v_dups bigint;
begin
  select count(*) into v_dups
    from (
      select 1
        from public.profiles
       where rut is not null and onboarding_completed
       group by regexp_replace(upper(rut), '[^0-9K]', '', 'g')
      having count(*) > 1
    ) d;
  if v_dups > 0 then
    raise warning '0059: % RUT duplicado(s) en perfiles con onboarding completo; no se crea profiles_rut_unique_idx', v_dups;
    return;
  end if;
  create unique index if not exists profiles_rut_unique_idx
    on public.profiles ((regexp_replace(upper(rut), '[^0-9K]', '', 'g')))
    where rut is not null and onboarding_completed;
end
$$;
