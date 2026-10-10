-- Maverlang — órdenes reales: requestId de Jupiter (idempotencia).
-- Idempotente: se puede volver a ejecutar.
-- Sin tocar las columnas existentes de `orders`; sólo agrega el identificador
-- de la orden de Jupiter para no ejecutar dos veces la misma transacción y
-- para recuperar la orden en el polling de estado.

alter table public.orders
  add column if not exists request_id text;

-- Un requestId de Jupiter no puede generar dos órdenes vivas por usuario.
-- (Una rejected puede reintentarse; por eso el índice es sobre request_id y
--  no sobre request_id+status.)
create unique index if not exists orders_user_request_idx
  on public.orders (user_id, request_id)
  where request_id is not null;
