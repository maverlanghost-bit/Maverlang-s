# Pruebas de SQL en PostgreSQL aislado (0041 / 0042)

Estas pruebas levantan un **PostgreSQL 17 embebido** en `127.0.0.1` con un
puerto libre y un directorio temporal propio. No usan Docker, no usan `psql`,
no se conectan a ninguna base existente y **no leen `.env`**.

## Requisito

`embedded-postgres` se instala **fuera del repositorio** para no tocar
`package.json` ni el lockfile:

```powershell
# Windows (PowerShell)
npm install --prefix "$env:TEMP\opencode\pg-harness" embedded-postgres@17.11.0-beta.19 --no-save --no-audit --no-fund
node supabase/tests/run-db-tests.mjs
```

```bash
# macOS / Linux
npm install --prefix "${TMPDIR:-/tmp}/opencode/pg-harness" embedded-postgres@17.11.0-beta.19 --no-save --no-audit --no-fund
node supabase/tests/run-db-tests.mjs
```

Si se instaló en otra ruta, apuntar `PG_HARNESS_DIR` a la carpeta que contiene
`node_modules` (la carpeta con `package.json` del prefix):

```powershell
$env:PG_HARNESS_DIR = "C:\ruta\al\pg-harness"
node supabase/tests/run-db-tests.mjs
```

## Qué hace

1. Replica el entorno mínimo de Supabase: roles `anon`, `authenticated` y
   `service_role` (con `BYPASSRLS`), esquema `auth`, `auth.uid()`,
   `auth.jwt()`, `auth.mfa_factors` y privilegios por defecto equivalentes.
2. Aplica las migraciones previas necesarias (`0002`, `0011`, `0027`, `0028`,
   `0029`, `0030`, `0031`, `0040`) y luego `0041` y `0042` **dos veces** para
   comprobar idempotencia.
3. Ejecuta pruebas reales de:
   - RLS forzada y columnas públicas de `wallets`.
   - `aal1`/`aal2` con TOTP verificado y `fail-closed`.
   - Privilegios de tablas/funciones para `anon`, `authenticated` y
     `service_role`.
   - Restricciones `NOT VALID`, DID, direcciones, firmas y montos.
   - Reservas: topes por orden/diario/mensual/global, ventanas
     `America/Santiago`, idempotencia, consumo, liberación y re-etiquetado.
   - Concurrencia con **varias conexiones reales**: dos reservas simultáneas,
     10 reservas del mismo usuario, 10 llamadas con el mismo `requestId`,
     25 usuarios contra el tope global y consumo/reserva en paralelo.
4. Al terminar detiene el clúster y borra el directorio temporal
   (`persistent: false`).

## Resultado esperado

```
Resultado: 33 pasaron, 0 fallaron.
```

El proceso sale con código 1 si alguna prueba falla.

## Limitaciones

- Es PostgreSQL 17 real, pero no es Supabase al 100 %: `auth.*` y los
  privilegios por defecto son un stub fiel al contrato usado por las
  migraciones. No prueba PostgREST, GoTrue, Realtime ni la red.
- No valida el flujo completo de la app ni activa dinero real
  (`REAL_EXECUTION_LOCKED` sigue cerrado).
- Las pruebas de concurrencia usan conexiones TCP reales, pero el clúster
  corre en la misma máquina; no sustituyen una prueba de carga.

## Cadena completa 0001–0046 (staging desde cero)

`run-migration-chain-tests.mjs` es el arnés principal para validar que una
base nueva puede llegar al esquema final aplicando **todas** las migraciones
en orden:

```bash
node supabase/tests/run-migration-chain-tests.mjs
```

Usa el mismo requisito de `embedded-postgres`/`pg` instalado fuera del repo y
el mismo `PG_HARNESS_DIR`. No lee `.env`, no usa Docker/`psql` y no toca una
base existente.

Qué comprueba:

1. Aplica `0001..0046` en orden, sin archivos faltantes ni duplicados, sobre
   un PostgreSQL 17 aislado con roles `anon`, `authenticated`, `service_role`,
   `supabase_auth_admin`, esquema `auth`, `auth.users`, `auth.mfa_factors`,
   `auth.uid()` y `auth.jwt()`.
2. Verifica que la definición viva de `update_my_profile(jsonb)` y
   `handle_new_user()` sea exactamente la de `0046` (comparando `pg_proc.prosrc`
   contra el cuerpo del archivo), que sean `security definer` y que su
   `search_path` sea seguro.
3. Comprueba permisos: `profiles` sólo SELECT + UPDATE de
   `nombre`/`language`/`display_currency` para `authenticated`; `consents`
   sólo SELECT; las RPC de perfil sólo las puede ejecutar `authenticated`
   (más `service_role` donde corresponde); `handle_new_user` no queda
   ejecutable por clientes.
4. Prueba el alta real: un `auth.users` con metadata completa no acredita
   onboarding, no copia residencia/nacionalidad/versión y no crea
   consentimiento `us_person`; la cuenta demo se crea con US$10.000.
5. Prueba la RPC final: exige declaración explícita y la versión vigente de
   `compliance_config`, completa el onboarding con perfil adulto, RUT,
   teléfono, residencia y nacionalidad, y deja consentimiento/evento.
6. Comprueba que después del onboarding no se puede cambiar identidad ni
   email por UPDATE directo y que las RPC rechazan la reversión.
7. Reaplica **toda la cadena** una segunda vez para detectar migraciones no
   idempotentes y confirma que no se modifica un perfil existente ni se
   duplica el plan de regularización. También reaplica `0025` y `0046` por
   separado.

Resultado esperado:

```
Resultado: 15 pasaron, 0 fallaron.
```

### Compatibilidad de la cadena (cambios históricos)

- `0001_init.sql` era el esquema legado de ids de texto y estaba marcado
  "NO APLICAR". Se reemplazó por un **no-op documentado**: su esquema es
  incompatible con `0002` (FK uuid → text). El estado de las bases existentes
  es desconocido y no puede asumirse que 0001 nunca se aplicó. Toda base
  legacy requiere primero un inventario de su esquema real y luego una
  migración controlada que preserve los datos; no se reconstruye desde cero.
- `0024_order_request_id.sql` se numeró antes de que `0027` cree `orders`.
  Ahora es condicional: si `orders` no existe, no hace nada y `0027` crea
  `request_id` + índice; si existe, los agrega de forma idempotente.
- `0025_crypto_deposits.sql` declaraba `user_id text` contra
  `profiles.id uuid`, un FK imposible. Se corrigió a `uuid`. Al usar
  `create table if not exists`, una base donde la tabla ya existe (por
  ejemplo, creada por `0027`) no se altera ni pierde datos.
- `0028_limits.sql` creaba políticas sin `drop policy if exists`; un reintento
  de staging fallaba con "policy already exists". Se agregaron los `drop`
  idempotentes. No cambia el comportamiento ni los datos.
