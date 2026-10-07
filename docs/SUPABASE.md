# Supabase — qué pegar y cómo dejar Auth

> **Estado actual (2026-10-06):** en el proyecto Supabase de Maverlang ya están aplicadas `0002`, `0003` y `0004`, y `public.assets` ya está sincronizada (`npm run sync:xstocks`). **No hay que pegar nada.** Lo de abajo sirve sólo para montar un proyecto nuevo desde cero.

En un proyecto nuevo (vacío), no pegues `0001_init.sql`: ese archivo es el esquema viejo de Privy (ids de texto) y choca con el registro. El aviso está al inicio del archivo.

## Qué pegar en el SQL Editor

1. Abre el SQL Editor del proyecto en el panel de Supabase.
2. Pega **una sola vez** el archivo `supabase/migrations/0002_supabase_auth.sql`.
3. Ejecútalo. Si lo vuelves a correr, no duplica tablas ni políticas.

Eso crea el perfil (`public.profiles`), los consentimientos y las preferencias. Al confirmar el correo, un trigger arma la fila del perfil con los datos del registro. Cada persona sólo puede ver y editar su fila. No hay insert ni delete públicos del perfil: lo crea el trigger.

No hace falta aplicarlo desde la terminal. Cartera, billetera y órdenes no van en este archivo.

## Cuenta demo por usuario (0003)

Después de `0002`, pega **una sola vez** `supabase/migrations/0003_demo_accounts.sql` en el SQL Editor y ejecútalo. También es idempotente. Crea:

- `public.demo_accounts` (una fila por usuario, arranca en $1.000.000 CLP), `public.demo_positions` y `public.demo_orders`.
- RLS: cada persona sólo lee sus filas. Nadie escribe desde el navegador: las escrituras las hace el servidor con la secret key vía rpc.
- `public.demo_trade(...)`: compra o venta en una transacción (valida saldo o acciones, costo promedio, inserta la orden). Sólo `service_role`.
- `public.demo_reset(...)`: vuelve al saldo inicial y borra posiciones y órdenes. Sólo `service_role`.
- Trigger: cada perfil nuevo recibe su cuenta demo; al final hay un backfill para los perfiles que ya existen.

Sin aplicar `0003`, las rutas demo por usuario fallan con error interno y la cartera muestra reintento. En local con `AUTH_MODE=mock` no hace falta: sigue la demo en memoria.

## Catálogo xStocks (0004)

Después de `0003`, pega **una sola vez** `supabase/migrations/0004_assets.sql` en el SQL Editor y ejecútalo. También es idempotente. Crea:

- `public.assets` (un fila por símbolo xStocks en Solana: mint, logo local, categoría, horario, liquidez Jupiter, `curated`, `enabled`, `raw`).
- RLS: catálogo público de lectura (`SELECT` para `anon` y `authenticated`). Nadie escribe desde el navegador: sólo `service_role`.
- Índices por `curated`, `category` y `lower(name)`.

Luego corre `npm run sync:xstocks` (o `node scripts/sync-xstocks.mjs`):

- Pagina la API pública de xStocks (`pageSize 100`), se queda con los que tienen deployment en Solana.
- Trae la liquidez de Jupiter en lotes (si responde 429, usa `data/xstocks-solana-2026-10-06.csv`).
- Descarga UNA vez cada logo curado a `public/logos/<subyacente>.png` (ej. `brk-b.png`); nunca hotlinking.
- Hace upsert en `public.assets` con la secret key (lee `.env.local` sin imprimir claves). Si la tabla no existe, avisa `tabla assets no existe: aplica 0004` y sigue.
- Genera `config/tickers.generated.ts` (50 curados, sin liquidez para que no cambie en cada sync).
- Flags: `--dry-run` (no escribe nada), `--no-db`, `--no-files`.

En M37 la app usa el curado (`CATALOG_SCOPE=curated`, ver `.env.example`); `all` queda para M38.

## Auth en el panel

- Site URL: el valor de `NEXT_PUBLIC_SITE_URL` (en local, `http://localhost:3000`)
- Redirect URLs: `http://localhost:3000/auth/callback` y `http://localhost:3000/**`
- Confirmación de correo: hoy está apagada (Authentication → Emails → Confirm email). Manu la dejó así a propósito.
- El SMTP integrado de Supabase tiene un límite bajo de correos por hora. Para producción, configura un SMTP propio.

El registro soporta los dos modos. Si `signUp` devuelve sesión (confirmación apagada), la persona entra al `next` saneado, o a `/app` si no hay `next`. La metadata del alta ya trae el perfil completo, así que el gate no la manda de nuevo al asistente. Si `signUp` no trae sesión (confirmación encendida), sigue la pantalla "Revisa tu correo", con reenvío. No hace falta cambiar código para volver a encenderla.

Google no se enciende. El botón del ingreso queda en Próximamente.

## Correos

El registro manda el enlace de confirmación a `{SITE_URL}/auth/callback?next=…`. Recuperar la contraseña usa `{SITE_URL}/auth/callback?next=/app/restablecer`. Los dos pasan por la misma Redirect URL.

Plantillas, opcionales. En Authentication → Emails puedes dejar las de Supabase o escribirlas en español. El botón del correo tiene que usar la URL de confirmación que arma Supabase (`{{ .ConfirmationURL }}`), que ya incluye el callback de arriba. No prometas rentabilidad. El horario del producto es 24/7.

- Confirmar cuenta: asunto y cuerpo en español, con el enlace para activar.
- Recuperar contraseña: asunto y cuerpo en español, con el enlace para elegir una clave nueva.
- Si no tocas las plantillas, las de Supabase sirven igual.

## Verificar

`npm run verify:auth` (o `node scripts/verificar-auth.mjs`) lee `.env.local` en el proceso y no imprime claves ni tokens. Crea un usuario con el admin API (`maverlang.e2e+<timestamp>@example.com`, `email_confirm: false`). No usa `signUp`, así que no manda correos.

El paso "b signIn sin confirmar" espera el error "email not confirmed" y en ese caso es PASS. Si el ingreso funciona porque la confirmación está apagada en el proyecto, ese paso sale SKIP ("confirmacion de correo desactivada en el proyecto") y el resto sigue. Cualquier otro error es FAIL. Después confirma al usuario, ingresa y cierra la sesión. Si `public.profiles` existe, lee la fila propia, cambia el teléfono y comprueba que el listado no trae filas ajenas. Si la migración `0002` no está aplicada, esos pasos salen `SKIP: migracion no aplicada` y el resto sigue. Siempre borra el usuario. El proceso termina con código distinto de 0 sólo si algún paso es `FAIL`.

El recorrido en el navegador es aparte: `npm run e2e:auth`. No entra en `npm run e2e`, que sigue en mock. Construye con `AUTH_MODE=supabase`, entra por `/app/ingresar?next=/app/accion/AAPLx`, mira la compra, abre la cartera, sale y comprueba que la cartera vuelve a pedir ingreso. Si faltan las claves o el modo no es supabase, el spec se salta. Hace falta el build y el servidor de esa prueba; esta verificación de API no levanta Next.
