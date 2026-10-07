-- Maverlang — reporte RLS (M47). Sólo lectura: no cambia nada.
-- Pegar por bloques en el SQL Editor y leer el resultado.
-- 1) Tablas de public sin RLS. 2) Políticas por tabla. 3) Funciones
-- security definer sin search_path fijo. 4) Grants de anon/authenticated.

-- 1. Tablas de public SIN row level security (esperado: 0 filas).
select c.relname as tabla_sin_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by 1;

-- 2. Políticas por tabla (comparar con docs/SEGURIDAD.md).
select tablename as tabla,
  policyname as politica,
  roles,
  cmd as operacion,
  coalesce(qual, '') as condicion_using,
  coalesce(with_check, '') as condicion_check
from pg_policies
where schemaname = 'public'
order by 1, 2;

-- 3. Funciones security definer SIN search_path fijo (esperado: 0 filas).
select n.nspname as esquema,
  p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  coalesce(array_to_string(p.proconfig, ', '), '(sin ajustes)') as ajustes
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and (
    p.proconfig is null
    or not exists (
      select 1
      from unnest(p.proconfig) as ajuste
      where ajuste like 'search_path=%'
    )
  )
order by 1, 2;

-- 4. Grants directos de anon/authenticated en public (comparar con la matriz).
select grantee as rol,
  table_name as tabla,
  privilege_type as privilegio
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated')
  and table_schema = 'public'
order by 2, 1, 3;
