# Arquitectura — Maverlang

Dos productos en **un solo repo Next.js**:
1. **Landing** de marketing (`/`, `/legal/*`, `/ayuda`) — estática, rápida, SEO.
2. **Plataforma** (`/app/*`) — app autenticada: mercado, detalle, compra/venta, cartera, billetera, perfil/ajustes, onboarding.

Fase actual: **frontend primero, con backend real "enchufable"**: todo pasa por contratos tipados + capa de servicios con implementación `mock` (default) y `live` (se completa después). Tests y verificación se hacen al FINAL (tarea 20).

---

## 1. Stack
| Capa | Elección | Nota |
|---|---|---|
| Framework | Next.js (App Router, última estable) + TypeScript `strict` | Vercel |
| Estilos | Tailwind CSS v4 + tokens `styles/tokens.css` | shadcn/ui opcional (sólo primitivos que convengan, re-tematizados) |
| Fuentes | `geist` (Geist Sans + Mono) | OFL |
| Estado servidor | TanStack Query | caché de precios/cartera |
| Formularios | react-hook-form + zod | zod también valida APIs |
| Auth + wallet | Privy (`@privy-io/react-auth`, `@privy-io/server-auth`) — login email/Google + wallet embebida Solana | Gratis hasta 499 MAU (verificado fase 2). En modo mock se simula |
| Solana | `@solana/web3.js` + `@solana/spl-token` (Token-2022) | sólo en `lib/solana/*` |
| Swaps | Jupiter Swap API (Ultra/Swap V2 `/order` + `/execute`) | comisión propia = instrucción de transferencia USDC (0 bps al lanzar) |
| Precios | Jupiter Price API v3 (precio por token crudo → ajustar por multiplicador) | historial: proveedor [POR DEFINIR]; mock por ahora |
| FX CLP/USD | API pública (ej. mindicador.cl, dólar observado) [VERIFICAR licencia/uso] | cache 1 h |
| On-ramp pesos | Koywe (SDK `@koyweforest/koywe-ramp-sdk`) ; fallback Onramper | adaptador `OnrampProvider` |
| DB | Supabase (Postgres) — acceso **sólo desde servidor** con service role | Auth es Privy, no Supabase Auth |
| Gráficos | `lightweight-charts` (detalle) + Sparkline SVG propio | |
| Números animados | `@number-flow/react` | como x.ai |
| QR | `qrcode.react` | |
| i18n | diccionarios propios `es-CL` (default) / `en` (sin librería pesada) | |

## 2. Rutas

### 2.1 Landing — route group `app/(marketing)`
| Ruta | Contenido |
|---|---|
| `/` | Hero, cinta de tickers, cómo funciona (3 pasos), mock de producto, features, costos transparentes, seguridad/autocustodia, FAQ, CTA final, footer legal |
| `/ayuda` | FAQ completa (acordeón) |
| `/legal/terminos` | Términos y condiciones (borrador — [REVISIÓN ABOGADO]) |
| `/legal/privacidad` | Política de privacidad (Ley 19.628 y Ley 21.719 — [REVISIÓN ABOGADO]) |
| `/legal/riesgos` | Divulgación de riesgos (sin derechos de accionista, emisor, congelamiento, liquidez fuera de horario, no es asesoría) |
| `/legal/comisiones` | Tabla de costos |
CTA principal → `/app` (si no hay sesión, middleware lleva a `/app/ingresar`).

### 2.2 Plataforma — route group `app/(platform)/app`
| Ruta | Pantalla |
|---|---|
| `/app/ingresar` | Login (Privy: email OTP / Google) |
| `/app/onboarding` | Pasos: 1 País de residencia · 2 Declaración "no soy US person" · 3 Aceptar términos + riesgos (versionados) · 4 Wallet creada ✓ · 5 (opcional) primer depósito |
| `/app` | **Mercado**: buscador, filtros (Todas / Tecnología / ETFs / Favoritas), orden (Popular, Mayor alza, Mayor baja, A–Z), lista de TickerRow con sparkline, "Más movidas hoy", estado de mercado |
| `/app/accion/[ticker]` | **Detalle**: precio grande, variación, gráfico con tabs `1S 1M 3M 1A Todo`, tu posición, estadísticas, "Sobre la empresa", "Sobre el token" (emisor, mint, multiplicador, riesgos), botones Comprar/Vender fijos abajo. `?operar=comprar|vender` abre el TradeSheet |
| `/app/cartera` | **Cartera**: valor total (CLP/USD), P&L total y por posición, barra de asignación, lista PositionRow, historial de órdenes |
| `/app/billetera` | **Billetera**: saldo USDC disponible + SOL (red), accesos Depositar / Enviar / Recibir, direcciones, actividad |
| `/app/billetera/depositar` | Depositar pesos vía on-ramp (monto CLP → estimado USDC, proveedor, métodos: Khipu/EtPay/transferencia) + depositar USDC desde otra wallet |
| `/app/billetera/recibir` | Dirección Solana + QR + copiar + advertencias (sólo red Solana, sólo USDC/acciones soportadas) |
| `/app/billetera/enviar` | Enviar USDC o acción: destino, monto, red; validación de dirección, confirmación con costos |
| `/app/perfil` | Resumen de cuenta + menú de ajustes |
| `/app/perfil/cuenta` | Email, nombre, país, ID de usuario, cerrar sesión, solicitar eliminación de cuenta |
| `/app/perfil/seguridad` | Métodos de login, exportar clave privada (Privy), sesiones activas [según Privy], 2FA [según Privy] |
| `/app/perfil/notificaciones` | Email: órdenes ejecutadas, depósitos, novedades (switches) |
| `/app/perfil/idioma` | Español (Chile) / English · moneda de visualización CLP/USD |
| `/app/perfil/legal` | Documentos aceptados con versión y fecha + links a `/legal/*` |
Layout plataforma: sidebar (≥lg) / bottom tabs (<lg) con 4 tabs: **Mercado · Cartera · Billetera · Perfil**.

### 2.3 Middleware (`middleware.ts`)
- Geobloqueo: si país ∈ `GEO_BLOCKED_COUNTRIES` (default `US`) → `/bloqueado` (página simple). Header `x-vercel-ip-country`.
- `/app/*` (excepto `/app/ingresar`): requiere sesión (cookie Privy `privy-token`; en mock `a24_mock_session`). Sin onboarding completo → `/app/onboarding`.

### 2.4 API (Route Handlers `app/api/**/route.ts`) — todas validan con zod y devuelven `ApiResult<T>`
| Método y ruta | Request | Response |
|---|---|---|
| `GET /api/tickers` | – | `Ticker[]` |
| `GET /api/prices?symbols=AAPLx,…` | – | `Quote[]` |
| `GET /api/tickers/[symbol]/history?range=1W\|1M\|3M\|1Y\|ALL` | – | `PricePoint[]` |
| `GET /api/fx/usdclp` | – | `FxRate` |
| `GET /api/market/status` | – | `MarketStatus` |
| `POST /api/trade/quote` | `TradeQuoteRequest` | `TradeQuote` |
| `POST /api/trade/build` | `TradeBuildRequest` | `TradeBuildResponse` |
| `POST /api/trade/submit` | `TradeSubmitRequest` | `TradeSubmitResponse` |
| `GET /api/trade/status?id=` | – | `Order` |
| `GET /api/portfolio` | (auth) | `Portfolio` |
| `GET /api/wallet/balances` | (auth) | `Balance[]` |
| `GET /api/wallet/activity` | (auth) | `Activity[]` |
| `POST /api/wallet/send/build` | `SendBuildRequest` | `TradeBuildResponse` |
| `POST /api/onramp/session` | `OnrampSessionRequest` | `OnrampSession` |
| `POST /api/onramp/webhook` | firma del proveedor | `{ ok: true }` |
| `GET /api/me` · `PATCH /api/me` | `ProfileUpdate` | `UserProfile` |
| `POST /api/me/consents` | `ConsentRequest` | `Consent` |
| `GET /api/me/preferences` · `PUT` | `Preferences` | `Preferences` |
| `GET /api/geo` | – | `{ country: string; blocked: boolean }` |

## 3. Estructura de carpetas
```
Maverlang-stocks/
├─ AGENTS.md / GROK.md        # contexto maestro (PROMPTS/00)
├─ PROGRESO.md                # bitácora que el builder actualiza tras cada tarea
├─ docs/                      # DESIGN-SYSTEM.md, ARQUITECTURA.md, TAREAS.md, DISENO-REFERENCIAS.md
├─ .env.example
├─ middleware.ts
├─ app/
│  ├─ layout.tsx              # fuentes, <Providers>, metadata base
│  ├─ globals.css             # tokens.css
│  ├─ (marketing)/
│  │  ├─ layout.tsx           # SiteHeader + SiteFooter
│  │  ├─ page.tsx             # landing
│  │  ├─ ayuda/page.tsx
│  │  └─ legal/[doc]/page.tsx # contenido desde content/legal/*.md
│  ├─ (platform)/app/
│  │  ├─ layout.tsx           # AppShell (sidebar/bottom tabs, BalanceHeader)
│  │  ├─ page.tsx             # mercado
│  │  ├─ ingresar/page.tsx
│  │  ├─ onboarding/page.tsx
│  │  ├─ accion/[ticker]/page.tsx
│  │  ├─ cartera/page.tsx
│  │  ├─ billetera/{page,depositar/page,recibir/page,enviar/page}.tsx
│  │  └─ perfil/{page,cuenta/page,seguridad/page,notificaciones/page,idioma/page,legal/page}.tsx
│  ├─ bloqueado/page.tsx
│  └─ api/…                   # ver §2.4
├─ components/
│  ├─ ui/                     # primitivos
│  ├─ domain/                 # TickerRow, PriceText, TradeSheet, CostBreakdown…
│  ├─ landing/                # Hero, TickerMarquee, HowItWorks…
│  └─ app-shell/              # Sidebar, BottomTabs, TopBar
├─ config/
│  ├─ tickers.ts              # allowlist de mints oficiales (fuente de verdad)
│  ├─ fees.ts                 # FEE_BPS desde env, default 0
│  └─ site.ts                 # nombre de marca, URLs, soporte
├─ content/
│  ├─ legal/*.md              # borradores legales versionados (frontmatter version/fecha)
│  └─ i18n/{es-CL,en}.ts
├─ lib/
│  ├─ types/                  # modelos de dominio (§4)
│  ├─ api/contracts.ts        # schemas zod request/response (§5)
│  ├─ api/client.ts           # fetchers tipados (cliente)
│  ├─ api/result.ts           # ApiResult<T>, errores
│  ├─ services/               # interfaces + impl mock/live
│  │  ├─ index.ts             # getServices(): elige por DATA_MODE
│  │  ├─ prices.{mock,live}.ts
│  │  ├─ trade.{mock,live}.ts
│  │  ├─ portfolio.{mock,live}.ts
│  │  ├─ onramp.{mock,koywe,onramper}.ts
│  │  ├─ users.{mock,supabase}.ts
│  │  └─ auth.{mock,privy}.ts
│  ├─ mocks/                  # datos deterministas (precios, historial, cartera, actividad)
│  ├─ solana/
│  │  ├─ connection.ts
│  │  ├─ scaled-ui.ts         # multiplicador Token-2022 (§6)
│  │  ├─ fee.ts               # instrucción de comisión USDC
│  │  ├─ allowlist.ts         # isOfficialMint()
│  │  └─ address.ts           # validar dirección
│  ├─ format.ts               # CLP, USD, acciones, %
│  ├─ env.ts                  # lectura validada de env (zod), separa server/public
│  └─ hooks/                  # usePrices, usePortfolio, useSession…
└─ supabase/migrations/0001_init.sql
```

## 4. Modelos de dominio (`lib/types/`)
```ts
export type Symbol = string;                 // "AAPLx"
export type Currency = "CLP" | "USD";
export type Range = "1W" | "1M" | "3M" | "1Y" | "ALL";

export interface Ticker {
  symbol: Symbol; underlying: string;        // "AAPL"
  name: string;                              // "Apple"
  mint: string; decimals: 8;                 // xStocks: Token-2022, 8 dec.
  issuer: "Backed (xStocks)";
  category: "tech" | "etf" | "fintech" | "consumer";
  logo: string;                              // /logos/aapl.svg (sin marcas ajenas en landing hasta revisar uso) [VERIFICAR]
  enabled: boolean;
}
export interface Quote {                     // precio por ACCIÓN (ya ajustado por multiplicador)
  symbol: Symbol; priceUsd: number; change24hPct: number;
  multiplier: number; updatedAt: string; source: "jupiter" | "mock";
}
export interface PricePoint { t: number; p: number }   // unix ms, USD por acción
export interface FxRate { pair: "USDCLP"; rate: number; source: string; updatedAt: string }
export interface MarketStatus { underlyingOpen: boolean; nextChange: string; note?: string }

export interface Balance {
  mint: string; symbol: Symbol | "USDC" | "SOL";
  rawAmount: string;                         // bigint como string
  uiAmount: number;                          // acciones mostradas = raw × multiplicador / 10^dec
  valueUsd: number;
}
export interface Position {
  symbol: Symbol; shares: number; multiplier: number;
  avgCostUsd: number | null;                 // null si no hay historial suficiente
  priceUsd: number; valueUsd: number; pnlUsd: number | null; pnlPct: number | null;
  allocationPct: number;
}
export interface Portfolio {
  address: string; totalUsd: number; cashUsdc: number;
  positions: Position[]; pnlUsd: number | null; pnlPct: number | null; updatedAt: string;
}

export type Side = "buy" | "sell";
export interface FeeConfig { bps: number; wallet: string | null; mode: "usdc_transfer" }   // bps = 0 al lanzar
export interface CostBreakdown {
  platformFeeUsd: number; platformFeeBps: number;
  networkFeeSol: number; tokenAccountRentSol: number;   // ~0.0016 SOL sólo si no existe la cuenta
  priceImpactPct: number; slippageBps: number;
}
export interface TradeQuoteRequest {
  side: Side; symbol: Symbol;
  amount: number; amountCurrency: "USDC" | "SHARES" | "CLP";
  userPublicKey?: string;
}
export interface TradeQuote {
  id: string; side: Side; symbol: Symbol;
  inAmountUi: number; outAmountUi: number;    // USDC↔acciones (UI)
  pricePerShareUsd: number; costs: CostBreakdown;
  priceDeviationBps: number;                  // vs. oráculo; bloquear si > PRICE_DEVIATION_MAX_BPS
  expiresAt: string; route: "jupiter" | "mock";
}
export interface TradeBuildRequest { quoteId: string; userPublicKey: string }
export interface TradeBuildResponse { requestId: string; transactionBase64: string; expiresAt: string }
export interface TradeSubmitRequest { requestId: string; signedTransactionBase64: string }
export interface TradeSubmitResponse { orderId: string; signature: string | null; status: OrderStatus }
export type OrderStatus = "pending" | "submitted" | "confirmed" | "failed" | "expired";
export interface Order {
  id: string; userId: string; side: Side; symbol: Symbol;
  inAmountUi: number; outAmountUi: number; feeBps: number;
  status: OrderStatus; signature: string | null; error?: string; createdAt: string;
}
export type ActivityKind = "buy" | "sell" | "deposit" | "withdraw" | "send" | "receive" | "onramp";
export interface Activity {
  id: string; kind: ActivityKind; symbol: string; amountUi: number;
  valueUsd: number | null; status: OrderStatus; signature: string | null; at: string;
}
export interface SendBuildRequest { to: string; mint: string; amountUi: number; userPublicKey: string }

export type OnrampProviderId = "koywe" | "onramper";
export interface OnrampSessionRequest { amountClp: number; provider?: OnrampProviderId; walletAddress: string }
export interface OnrampSession {
  id: string; provider: OnrampProviderId;
  mode: "widget_url" | "sdk";
  widgetUrl?: string; sdkConfig?: Record<string, unknown>;
  estimatedUsdc: number; feeClp: number; expiresAt: string;
}

export interface UserProfile {
  id: string;                                // Privy DID
  email: string | null; displayName: string | null;
  country: string | null; isUsPerson: boolean | null;
  walletAddress: string | null;
  onboardingCompleted: boolean;
  language: "es-CL" | "en"; displayCurrency: Currency;
  createdAt: string;
}
export type LegalDoc = "terminos" | "privacidad" | "riesgos";
export interface Consent { userId: string; doc: LegalDoc; version: string; acceptedAt: string }
export interface Preferences {
  notifyOrders: boolean; notifyDeposits: boolean; notifyNews: boolean;
  language: "es-CL" | "en"; displayCurrency: Currency;
}
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: ApiErrorCode; message: string } };
export type ApiErrorCode = "UNAUTHORIZED" | "FORBIDDEN_REGION" | "VALIDATION" | "NOT_FOUND"
  | "QUOTE_EXPIRED" | "PRICE_DEVIATION" | "INSUFFICIENT_FUNDS" | "MINT_NOT_ALLOWED" | "UPSTREAM" | "INTERNAL";
```

## 5. Contratos y capa de servicios
- `lib/api/contracts.ts`: schema zod por request/response; los tipos TS se infieren o se verifican contra §4.
- `lib/services/index.ts`:
```ts
export interface Services {
  prices: { list(symbols: string[]): Promise<Quote[]>; history(s: string, r: Range): Promise<PricePoint[]>; fx(): Promise<FxRate>; market(): Promise<MarketStatus> };
  trade: { quote(r: TradeQuoteRequest): Promise<TradeQuote>; build(r: TradeBuildRequest): Promise<TradeBuildResponse>; submit(r: TradeSubmitRequest, userId: string): Promise<TradeSubmitResponse>; status(id: string): Promise<Order> };
  portfolio: { get(address: string): Promise<Portfolio>; balances(address: string): Promise<Balance[]>; activity(address: string): Promise<Activity[]> };
  onramp: { createSession(r: OnrampSessionRequest, userId: string): Promise<OnrampSession>; handleWebhook(req: Request): Promise<void> };
  users: { get(id: string): Promise<UserProfile>; update(id: string, p: Partial<UserProfile>): Promise<UserProfile>; addConsent(c: Consent): Promise<Consent>; prefs(id: string): Promise<Preferences>; setPrefs(id: string, p: Preferences): Promise<Preferences> };
  auth: { getSession(req: Request): Promise<{ userId: string; walletAddress: string | null } | null> };
}
export function getServices(): Services  // DATA_MODE=mock (default) | live
```
- Los Route Handlers SOLO llaman `getServices()`; la UI SOLO llama `lib/api/client.ts` (nunca servicios directo, nunca Jupiter directo).
- Mocks deterministas (`lib/mocks/`): precios base realistas pero marcados `source:"mock"`; random walk con seed por símbolo; latencia simulada 200–600 ms; flags para simular errores (`?mockError=PRICE_DEVIATION`).
- Implementación `live` en esta fase: archivos creados con la firma y `throw new Error("NOT_IMPLEMENTED: …")` + comentario TODO con el endpoint exacto. Se completan en una fase posterior.

## 6. Reglas de dominio críticas (no negociables)
1. **Allowlist de mints**: sólo se opera con mints de `config/tickers.ts`. Cualquier mint fuera → `MINT_NOT_ALLOWED`. Existen muchos tokens falsos con el mismo símbolo.
2. **Multiplicador (Token-2022 Scaled UI Amount)**: leer `scaledUiAmountConfig` del mint; si `newMultiplierEffectiveTimestamp` ≤ ahora usar `newMultiplier`, si no `multiplier`. `acciones = raw / 10^8 × multiplicador`; `precio por acción = precio por token crudo ÷ multiplicador`. Nunca mostrar cantidades crudas.
3. **Comisión propia**: `FEE_BPS` (default **0**). Si > 0, se agrega una instrucción de transferencia USDC a `FEE_WALLET` en la tx (independiente del router). Mostrar siempre en CostBreakdown.
4. **Guardia de precio**: rechazar si la cotización se desvía > `PRICE_DEVIATION_MAX_BPS` (default 150) del precio de referencia.
5. **Rent**: crear cuenta de token cuesta ≈0,0016 SOL; mostrarlo la primera vez. Patrocinio de fee-payer: [POR DECIDIR], stub `lib/solana/sponsor.ts`.
6. **Emisor puede congelar/quemar** (permanent delegate + freeze authority): divulgado en `/legal/riesgos` y en "Sobre el token".
7. **Geobloqueo US** y declaración de no-US-person obligatoria en onboarding.
8. **Sin asesoría**: nada de "recomendadas"; "Más movidas hoy" se basa sólo en variación objetiva.
9. **Secretos sólo servidor** (`lib/env.ts` separa `serverEnv` y `publicEnv`; nunca importar serverEnv en cliente).

## 7. Allowlist inicial (`config/tickers.ts`)
Mints xStocks en Solana, verificados en Jupiter (tag `xstocks`, verificado) el 4-oct-2026; los 5 primeros además verificados en fase 2. **[VERIFICAR contra https://xstocks.fi antes de producción]**.
| Símbolo | Nombre | Mint |
|---|---|---|
| AAPLx | Apple | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` |
| NVDAx | NVIDIA | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` |
| TSLAx | Tesla | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` |
| SPYx | S&P 500 ETF | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| QQQx | Nasdaq 100 ETF | `Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ` |
| GOOGLx | Alphabet | `XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN` |
| MSFTx | Microsoft | `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX` |
| AMZNx | Amazon | `Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg` |
| METAx | Meta | `Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu` |
| CRCLx | Circle | `XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1` |
| HOODx | Robinhood | `XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg` (enabled:false de inicio) |
| MSTRx | Strategy | `XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ` (enabled:false de inicio) |
USDC (Solana): `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Archivo listo: `docs/config/tickers.ts`.

## 8. Variables de entorno (`.env.example`)
Ver `docs/.env.example`. Clave: `DATA_MODE=mock` mientras se construye.

## 9. Base de datos (Supabase) — `supabase/migrations/0001_init.sql`
Tablas: `profiles`, `consents`, `preferences`, `orders`, `onramp_sessions`, `audit_log`. RLS activado y **sin políticas públicas** (acceso sólo con service role desde Route Handlers, porque la identidad viene de Privy). Archivo listo: `docs/supabase/0001_init.sql`.

## 10. Puntos de enchufe del backend (fase siguiente)
| Punto | Archivo | Qué falta |
|---|---|---|
| Sesión real | `lib/services/auth.privy.ts` | verificar `privy-token` con `@privy-io/server-auth` |
| Precios | `prices.live.ts` | Jupiter Price v3 + multiplicador on-chain (cache 15 s) |
| Historial | `prices.live.ts#history` | proveedor por definir (datos del subyacente o de pools) |
| Cotizar/ejecutar | `trade.live.ts` | Jupiter `/order` → `/execute`; insertar instrucción de fee si `FEE_BPS>0`; guardar `orders` |
| Cartera | `portfolio.live.ts` | `getTokenAccountsByOwner` (Token-2022) + precios |
| On-ramp | `onramp.koywe.ts` | sesión/SDK Koywe; webhook con verificación de firma |
| Usuarios | `users.supabase.ts` | CRUD en Supabase |
| Patrocinio de gas | `lib/solana/sponsor.ts` | decisión de negocio + KMS (nunca clave en env en prod) |
