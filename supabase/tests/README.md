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
