# T07 — API Route Handlers + cliente tipado + hooks
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.4 y §5.

Haz:
1. Un `route.ts` por endpoint de §2.4. Patrón: parsear con zod → `getServices()` → `ok(data)` / `fail(code)`. Endpoints con "(auth)" usan `services.auth.getSession(req)` (en mock: sesión demo si cookie `a24_mock_session`). `runtime` Node. Cache: precios `no-store`; tickers `revalidate 3600`.
2. Validar `symbol`/`mint` contra allowlist → `MINT_NOT_ALLOWED`.
3. `lib/api/client.ts`: funciones tipadas (`getTickers`, `getPrices`, `getHistory`, `quoteTrade`, `buildTrade`, `submitTrade`, `getPortfolio`, `getBalances`, `getActivity`, `buildSend`, `createOnrampSession`, `getMe`, `updateMe`, `addConsent`, `getPrefs`, `setPrefs`) que desempaquetan `ApiResult` y lanzan `ApiError`.
4. `lib/hooks/`: `useTickers`, `usePrices` (refetch 15 s), `useHistory`, `usePortfolio`, `useBalances`, `useActivity`, `useMe`, `usePrefs` con TanStack Query; `app/providers.tsx` con QueryClientProvider + Toaster.

Listo cuando: abrir `/api/tickers`, `/api/prices?symbols=AAPLx,NVDAx` y `/api/tickers/AAPLx/history?range=1M` devuelve JSON válido; typecheck ok.
Al terminar: PROGRESO.md + commit `T07: api y cliente`.
