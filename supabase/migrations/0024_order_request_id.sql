-- Maverlang — órdenes reales: requestId de Jupiter (idempotencia).
-- Idempotente: se puede volver a ejecutar.
-- Sin tocar las columnas existentes de `orders`; sólo agrega el identificador
-- de la orden de Jupiter para no ejecutar dos veces la misma transacción y
-- para recuperar la orden en el polling de estado.
--
-- Compatibilidad de cadena: esta migración se numeró antes de 0027, pero
-- `orders` recién se crea en 0027_orders_real.sql (con `request_id` y el
-- índice incluidos). En una base nueva 0024 no encuentra la tabla y no debe
-- fallar; en una base existente donde `orders` ya existe, agrega lo mismo de
-- forma idempotente. No se renombra el archivo para no alterar el historial
-- de migraciones ya aplicadas.

do $$
begin
  if to_regclass('public.orders') is not null then
    alter table public.orders
      add column if not exists request_id text;

    -- Un requestId de Jupiter no puede generar dos órdenes vivas por usuario.
    -- (Una rejected puede reintentarse; por eso el índice es sobre request_id
    --  y no sobre request_id+status.)
    create unique index if not exists orders_user_request_idx
      on public.orders (user_id, request_id)
      where request_id is not null;
  end if;
end $$;
