# Entornos (M59)

Tres entornos. Dos proyectos Supabase (desarrollo y producción; el de
producción se crea en M60). Los datos de producción **nunca** se copian a
desarrollo.

## Tabla

| | Desarrollo local | Demo pública (Vercel) | Preview (Vercel) | Producción (Vercel, desde M60) |
|---|---|---|---|---|
| Dónde corre | `npm run dev` en tu máquina | https://maverlang.vercel.app (`main`) | URL `*.vercel.app` por rama/PR | Dominio definitivo (M60) |
| Rama | cualquiera | `main` | la rama del PR | `main` (deploy manual) |
| Supabase | desarrollo (o nada: mock) | desarrollo (actual) | desarrollo, siempre | producción (M60) |
| `APP_ENV` | ausente (`development`) | ausente (`development`) | `preview` explícito | `production` explícito (se agrega en Vercel recién en M60, nunca antes) |
| `SUPABASE_PROJECT_ENV` | ausente o `dev` | ausente o `dev` | `dev` obligatorio | `prod` obligatorio |
| `AUTH_MODE` | `mock` (o `supabase` contra desarrollo) | `mock` | `supabase` | `supabase` |
| `DATA_MODE` | `mock` | `mock` | `mock` | `mock` (live sólo con `REAL_TRADING_READY=true`, lo enciende M90) |
| `PRICES_MODE` / `MARKET_STATUS_MODE` | `mock` (o `live` para probar) | `mock` | `live` | `live` |
| `CATALOG_SCOPE` | `curated` | `curated` | `curated` (nunca `all`) | `curated` (nunca `all`) |
| `GEO_BLOCKED_COUNTRIES` | incluye `US` | incluye `US` | incluye `US` | incluye `US` |
| Quién despliega | nadie (local) | automático al hacer push a `main` (lo hace el operador, no OpenCode) | automático por rama/PR | sólo Manu/operador desde el dashboard de Vercel |

## Flujo rama → preview → main → producción

1. Trabajas en una rama; cada push genera un **preview** (Supabase de desarrollo).
2. Al mergear a `main`, Vercel actualiza la **demo pública**.
3. La **producción** (desde M60) se despliega aparte, sólo con `APP_ENV=production` y `SUPABASE_PROJECT_ENV=prod`.

## Regla de activación (estricto)

La validación estricta (hace fallar el build/arranque) se activa SÓLO si:

- `APP_ENV=production` está definido explícitamente, o
- `SUPABASE_PROJECT_ENV=prod` está definido (aunque no haya `APP_ENV`).

El estricto de preview se activa SÓLO con `APP_ENV=preview` explícito
(un preview nunca toca la base de producción: exige proyecto `dev` y
`REAL_TRADING_READY=false`).

`VERCEL_ENV` y `NODE_ENV` son sólo etiquetas informativas (aparecen en los
avisos). NUNCA activan el modo estricto: `npm run build` siempre usa
`NODE_ENV=production`, y así corre hoy la demo publicada con el Supabase
de desarrollo. Sin `APP_ENV` ni `SUPABASE_PROJECT_ENV`, lo que falte de
producción sólo genera avisos (`console.warn`), nunca un error.

Producción exige además: `AUTH_MODE=supabase` (y el público igual),
`PRICES_MODE=live`, `MARKET_STATUS_MODE=live`, `NEXT_PUBLIC_SITE_URL` con
`https`, URL + publishable + secret de Supabase, `CRON_SECRET` (≥ 32
caracteres), `JUPITER_API_KEY`, `CATALOG_SCOPE` distinto de `all`,
`DATA_MODE=live` sólo con `REAL_TRADING_READY=true`, y que la URL de
Supabase coincida con `SUPABASE_PROD_URL_EXPECTED` (variable que sólo
existe en producción).

## Verificar antes de desplegar

```bash
npm run check:env                  # modo leniente: avisos, sale con 0
npm run check:env -- --env production   # estricto: lista faltantes, sale con 1 si falta algo
npm run check:env -- --env preview --file ./vercel-preview.env  # revisa un archivo bajado con `vercel env pull`
```

El script muestra OK, FALTA o INVÁLIDA por variable y nunca imprime
valores (sólo largo y prefijo de 4 caracteres para las claves públicas).
