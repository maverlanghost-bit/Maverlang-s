-- Maverlang — saldo demo de US$1.000 a US$10.000.
-- Idempotente: se puede volver a ejecutar sin efecto adicional.
--
-- Cambia el default de la columna (cuentas nuevas) y sube el saldo de las
-- cuentas existentes a US$10.000. Para no borrar el progreso de quien ya
-- operó, sólo se ajustan las cuentas que siguen "frescas" (cash = initial y
-- sin posiciones ni órdenes); el resto queda como está y su `initial_usd`
-- sólo sube si nunca operó.

-- 1. Nuevo default para cuentas que se creen de ahora en más.
alter table public.demo_accounts
  alter column cash_usd set default 10000;
alter table public.demo_accounts
  alter column initial_usd set default 10000;

-- 2. El trigger que crea la cuenta demo al registrar un perfil fija el saldo
-- explícitamente (no depende del default), para que un usuario nuevo siempre
-- arranque en US$10.000 aunque el default de la columna vuelva a cambiar.
create or replace function public.handle_new_profile_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.demo_accounts (user_id, cash_usd, initial_usd)
    values (new.id, 10000, 10000)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 3. Cuentas nuevas que ya se hayan creado con el default viejo (1000) y no
-- hayan operado todavía: se les pone el saldo en 10.000.
update public.demo_accounts
  set cash_usd = 10000,
      initial_usd = 10000,
      updated_at = now()
  where cash_usd = 1000
    and initial_usd = 1000
    and not exists (
      select 1 from public.demo_positions p where p.user_id = demo_accounts.user_id
    )
    and not exists (
      select 1 from public.demo_orders o where o.user_id = demo_accounts.user_id
    );
