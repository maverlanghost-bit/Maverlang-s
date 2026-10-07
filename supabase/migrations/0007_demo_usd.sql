-- Maverlang — saldo demo en US$ (M44).
-- Aplicar DESPUÉS de 0006_user_favorites.sql. Se puede pegar completa en el SQL Editor.
-- Idempotente: se puede volver a ejecutar. La segunda corrida no reinicia nada
-- (las cuentas existentes se reinician a US$1.000 una sola vez, ver marca abajo).
-- La demo parte con US$1.000 ficticios (cash_usd/initial_usd). Las columnas *_clp
-- quedan como dato informativo deprecado y todavía no se borran.

-- 1. Saldo en dólares en la cuenta.
alter table public.demo_accounts
  add column if not exists cash_usd numeric(18, 2) not null default 1000 check (cash_usd >= 0);
alter table public.demo_accounts
  add column if not exists initial_usd numeric(18, 2) not null default 1000;

-- El saldo en pesos deja de usarse: queda como historia deprecada.
alter table public.demo_accounts alter column cash_clp set default 0;
comment on column public.demo_accounts.cash_clp is 'deprecada (M44): el saldo demo vive en cash_usd.';
comment on column public.demo_accounts.initial_clp is 'deprecada (M44): el saldo inicial demo vive en initial_usd.';
comment on column public.demo_positions.avg_cost_clp is 'deprecada (M44): sólo dato informativo.';
comment on column public.demo_orders.usdclp is 'deprecada (M44): sólo dato informativo, puede ser null.';
comment on column public.demo_orders.total_clp is 'deprecada (M44): sólo dato informativo, puede ser null.';

-- 2. Total en dólares en la orden (nullable para el historial viejo).
alter table public.demo_orders
  add column if not exists total_usd numeric(18, 2);
-- El dólar pasa a ser opcional: si no viene, se deja null y la operación igual se hace.
alter table public.demo_orders alter column usdclp drop not null;
alter table public.demo_orders alter column total_clp drop not null;

-- 3. Compra o venta en UNA transacción, en dólares. Misma firma que 0003.
-- p_usdclp es opcional: si viene (> 0) guarda usdclp y total_clp como dato
-- informativo; si es null, los deja null y la operación igual se hace.
-- Errores cortos: 'saldo_insuficiente', 'acciones_insuficientes', 'monto_invalido'.
create or replace function public.demo_trade(
  p_user uuid,
  p_symbol text,
  p_side text,
  p_shares numeric,
  p_price_usd numeric,
  p_usdclp numeric
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cash numeric(18, 2);
  v_total_usd numeric(18, 2);
  v_usdclp numeric(12, 4);
  v_price_clp numeric(18, 2);
  v_total_clp numeric(18, 2);
  v_pos_shares numeric(28, 10);
  v_pos_avg_usd numeric(18, 6);
  v_pos_avg_clp numeric(18, 2);
  v_new_shares numeric(28, 10);
  v_new_avg_usd numeric(18, 6);
  v_new_avg_clp numeric(18, 2);
begin
  if p_shares is null or p_shares <= 0 then
    raise exception 'monto_invalido';
  end if;
  if p_price_usd is null or p_price_usd <= 0 then
    raise exception 'monto_invalido';
  end if;
  if p_side is null or (p_side <> 'buy' and p_side <> 'sell') then
    raise exception 'monto_invalido';
  end if;
  if p_symbol is null or btrim(p_symbol) = '' then
    raise exception 'monto_invalido';
  end if;

  if p_usdclp is null or p_usdclp <= 0 then
    v_usdclp := null;
    v_price_clp := null;
    v_total_clp := null;
  else
    v_usdclp := p_usdclp;
    v_price_clp := round(p_price_usd * p_usdclp, 2);
    v_total_clp := round(p_shares * v_price_clp, 2);
  end if;

  select public.demo_accounts.cash_usd
    into v_cash
    from public.demo_accounts
    where public.demo_accounts.user_id = p_user
    for update;

  if not found then
    insert into public.demo_accounts (user_id)
      values (p_user)
      on conflict (user_id) do nothing;
    select public.demo_accounts.cash_usd
      into v_cash
      from public.demo_accounts
      where public.demo_accounts.user_id = p_user
      for update;
  end if;

  v_total_usd := round(p_shares * p_price_usd, 2);

  if p_side = 'buy' then
    if v_cash < v_total_usd then
      raise exception 'saldo_insuficiente';
    end if;
    update public.demo_accounts
      set cash_usd = cash_usd - v_total_usd,
        updated_at = now()
      where public.demo_accounts.user_id = p_user;

    select public.demo_positions.shares,
      public.demo_positions.avg_cost_usd,
      public.demo_positions.avg_cost_clp
      into v_pos_shares, v_pos_avg_usd, v_pos_avg_clp
      from public.demo_positions
      where public.demo_positions.user_id = p_user
        and public.demo_positions.symbol = p_symbol
      for update;

    if not found then
      v_pos_shares := 0;
      v_pos_avg_usd := p_price_usd;
      v_pos_avg_clp := 0;
    end if;

    v_new_shares := v_pos_shares + p_shares;
    v_new_avg_usd := round(
      (v_pos_shares * v_pos_avg_usd + p_shares * p_price_usd) / v_new_shares,
      6
    );
    if v_price_clp is null then
      v_new_avg_clp := coalesce(v_pos_avg_clp, 0);
    else
      v_new_avg_clp := round(
        (v_pos_shares * v_pos_avg_clp + p_shares * v_price_clp) / v_new_shares,
        2
      );
    end if;

    insert into public.demo_positions (user_id, symbol, shares, avg_cost_usd, avg_cost_clp, updated_at)
      values (p_user, p_symbol, v_new_shares, v_new_avg_usd, v_new_avg_clp, now())
      on conflict (user_id, symbol)
      do update set
        shares = excluded.shares,
        avg_cost_usd = excluded.avg_cost_usd,
        avg_cost_clp = excluded.avg_cost_clp,
        updated_at = now();
  else
    select public.demo_positions.shares
      into v_pos_shares
      from public.demo_positions
      where public.demo_positions.user_id = p_user
        and public.demo_positions.symbol = p_symbol
      for update;

    if not found or v_pos_shares < p_shares then
      raise exception 'acciones_insuficientes';
    end if;

    update public.demo_accounts
      set cash_usd = cash_usd + v_total_usd,
        updated_at = now()
      where public.demo_accounts.user_id = p_user;

    v_new_shares := v_pos_shares - p_shares;
    if v_new_shares <= 0 then
      delete from public.demo_positions
        where public.demo_positions.user_id = p_user
          and public.demo_positions.symbol = p_symbol;
    else
      update public.demo_positions
        set shares = v_new_shares,
          updated_at = now()
        where public.demo_positions.user_id = p_user
          and public.demo_positions.symbol = p_symbol;
    end if;
  end if;

  insert into public.demo_orders (user_id, symbol, side, shares, price_usd, usdclp, total_clp, total_usd)
    values (p_user, p_symbol, p_side, p_shares, p_price_usd, v_usdclp, v_total_clp, v_total_usd);

  select public.demo_accounts.cash_usd
    into v_cash
    from public.demo_accounts
    where public.demo_accounts.user_id = p_user;

  return json_build_object(
    'cash_usd', v_cash,
    'total_usd', v_total_usd,
    'price_usd', p_price_usd
  );
end;
$$;

-- 4. Reinicio: la cuenta vuelve a US$1.000, sin posiciones ni órdenes.
create or replace function public.demo_reset(p_user uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cash numeric(18, 2);
  v_count int;
begin
  insert into public.demo_accounts (user_id)
    values (p_user)
    on conflict (user_id) do nothing;

  delete from public.demo_positions
    where public.demo_positions.user_id = p_user;
  delete from public.demo_orders
    where public.demo_orders.user_id = p_user;

  update public.demo_accounts
    set cash_usd = initial_usd,
      reset_count = reset_count + 1,
      updated_at = now()
    where public.demo_accounts.user_id = p_user
    returning public.demo_accounts.cash_usd, public.demo_accounts.reset_count
    into v_cash, v_count;

  return json_build_object('cash_usd', v_cash, 'reset_count', v_count);
end;
$$;

revoke all on function public.demo_trade(uuid, text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.demo_trade(uuid, text, text, numeric, numeric, numeric) to service_role;

revoke all on function public.demo_reset(uuid) from public, anon, authenticated;
grant execute on function public.demo_reset(uuid) to service_role;

-- handle_new_profile_demo (0003) sigue igual: el insert usa los defaults,
-- así que las cuentas nuevas ya parten con US$1.000.

-- 5. Las cuentas que ya existen se reinician a US$1.000 una sola vez
-- (antes de anunciar la demo sólo hay usuarios de prueba y los de Manu).
-- La marca hace que volver a correr esta migración no borre nada nuevo.
create table if not exists public._migration_flags (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public._migration_flags enable row level security;
revoke all on table public._migration_flags from public, anon, authenticated;
grant all on table public._migration_flags to service_role;

do $$
declare
  v_rows int := 0;
begin
  insert into public._migration_flags (name)
    values ('demo_usd_0007')
    on conflict (name) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.demo_accounts set cash_usd = 1000, initial_usd = 1000;
    delete from public.demo_positions;
    delete from public.demo_orders;
  end if;
end;
$$;
