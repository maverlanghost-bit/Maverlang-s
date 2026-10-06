-- Maverlang — cuenta demo por usuario.
-- Pegar UNA vez en el SQL Editor DESPUÉS de 0002_supabase_auth.sql.
-- No toca 0002: sólo agrega las tablas demo y sus funciones.
-- Idempotente: se puede volver a ejecutar.
-- NO aplicar desde la terminal: el operador la pega en el panel.

create table if not exists public.demo_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cash_clp numeric(18, 2) not null default 1000000 check (cash_clp >= 0),
  initial_clp numeric(18, 2) not null default 1000000,
  reset_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demo_positions (
  user_id uuid not null references public.demo_accounts (user_id) on delete cascade,
  symbol text not null,
  shares numeric(28, 10) not null check (shares >= 0),
  avg_cost_usd numeric(18, 6) not null,
  avg_cost_clp numeric(18, 2) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table if not exists public.demo_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.demo_accounts (user_id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  shares numeric(28, 10) not null check (shares > 0),
  price_usd numeric(18, 6) not null check (price_usd > 0),
  usdclp numeric(12, 4) not null check (usdclp > 0),
  total_clp numeric(18, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists demo_orders_user_created_idx
  on public.demo_orders (user_id, created_at desc);

-- El precio lo calcula el servidor y escribe con la secret key.
-- Los clientes sólo leen sus filas: ningún insert/update/delete para anon/authenticated.
alter table public.demo_accounts enable row level security;
alter table public.demo_positions enable row level security;
alter table public.demo_orders enable row level security;

drop policy if exists demo_accounts_select_own on public.demo_accounts;
create policy demo_accounts_select_own
  on public.demo_accounts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists demo_positions_select_own on public.demo_positions;
create policy demo_positions_select_own
  on public.demo_positions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists demo_orders_select_own on public.demo_orders;
create policy demo_orders_select_own
  on public.demo_orders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.demo_accounts from public, anon, authenticated;
grant select on table public.demo_accounts to authenticated;

revoke all on table public.demo_positions from public, anon, authenticated;
grant select on table public.demo_positions to authenticated;

revoke all on table public.demo_orders from public, anon, authenticated;
grant select on table public.demo_orders to authenticated;

-- Compra o venta en UNA transacción. Costo promedio ponderado.
-- Si la posición queda en 0 acciones, se borra la fila.
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
set search_path = ''
as $$
declare
  v_cash numeric(18, 2);
  v_total_clp numeric(18, 2);
  v_pos_shares numeric(28, 10);
  v_pos_avg_usd numeric(18, 6);
  v_pos_avg_clp numeric(18, 2);
  v_new_shares numeric(28, 10);
  v_new_avg_usd numeric(18, 6);
  v_new_avg_clp numeric(18, 2);
  v_price_clp numeric(18, 2);
begin
  if p_shares is null or p_shares <= 0 then
    raise exception 'monto_invalido';
  end if;
  if p_price_usd is null or p_price_usd <= 0 then
    raise exception 'monto_invalido';
  end if;
  if p_usdclp is null or p_usdclp <= 0 then
    raise exception 'monto_invalido';
  end if;
  if p_side is null or (p_side <> 'buy' and p_side <> 'sell') then
    raise exception 'monto_invalido';
  end if;
  if p_symbol is null or btrim(p_symbol) = '' then
    raise exception 'monto_invalido';
  end if;

  select public.demo_accounts.cash_clp
    into v_cash
    from public.demo_accounts
    where public.demo_accounts.user_id = p_user
    for update;

  if not found then
    insert into public.demo_accounts (user_id)
      values (p_user)
      on conflict (user_id) do nothing;
    select public.demo_accounts.cash_clp
      into v_cash
      from public.demo_accounts
      where public.demo_accounts.user_id = p_user
      for update;
  end if;

  v_price_clp := round(p_price_usd * p_usdclp, 2);
  v_total_clp := round(p_shares * v_price_clp, 2);

  if p_side = 'buy' then
    if v_cash < v_total_clp then
      raise exception 'saldo_insuficiente';
    end if;
    update public.demo_accounts
      set cash_clp = cash_clp - v_total_clp,
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
      v_pos_avg_clp := v_price_clp;
    end if;

    v_new_shares := v_pos_shares + p_shares;
    v_new_avg_usd := round(
      (v_pos_shares * v_pos_avg_usd + p_shares * p_price_usd) / v_new_shares,
      6
    );
    v_new_avg_clp := round(
      (v_pos_shares * v_pos_avg_clp + p_shares * v_price_clp) / v_new_shares,
      2
    );

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
      set cash_clp = cash_clp + v_total_clp,
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

  insert into public.demo_orders (user_id, symbol, side, shares, price_usd, usdclp, total_clp)
    values (p_user, p_symbol, p_side, p_shares, p_price_usd, p_usdclp, v_total_clp);

  select public.demo_accounts.cash_clp
    into v_cash
    from public.demo_accounts
    where public.demo_accounts.user_id = p_user;

  return json_build_object(
    'cash_clp', v_cash,
    'total_clp', v_total_clp,
    'price_clp', v_price_clp
  );
end;
$$;

-- Vuelve a $1.000.000 de inicio, borra posiciones y órdenes, suma un reinicio.
create or replace function public.demo_reset(p_user uuid)
returns json
language plpgsql
security definer
set search_path = ''
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
    set cash_clp = initial_clp,
      reset_count = reset_count + 1,
      updated_at = now()
    where public.demo_accounts.user_id = p_user
    returning public.demo_accounts.cash_clp, public.demo_accounts.reset_count
    into v_cash, v_count;

  return json_build_object('cash_clp', v_cash, 'reset_count', v_count);
end;
$$;

revoke all on function public.demo_trade(uuid, text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.demo_trade(uuid, text, text, numeric, numeric, numeric) to service_role;

revoke all on function public.demo_reset(uuid) from public, anon, authenticated;
grant execute on function public.demo_reset(uuid) to service_role;

-- Cada perfil nuevo arranca con su cuenta demo.
create or replace function public.handle_new_profile_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.demo_accounts (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created_demo on public.profiles;
create trigger on_profile_created_demo
  after insert on public.profiles
  for each row
  execute function public.handle_new_profile_demo();

revoke all on function public.handle_new_profile_demo() from public, anon, authenticated;

-- Cuentas que ya existen y todavía no tienen demo.
insert into public.demo_accounts (user_id)
  select public.profiles.id
  from public.profiles
  on conflict (user_id) do nothing;
