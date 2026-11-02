"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";

import type { SessionStatus } from "@/lib/auth/types";

/** En el servidor no hay pintura; en el cliente se purga antes del primer frame. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Claves raíz de React Query con datos de la cuenta. Todo lo demás
 * (`tickers`, `prices`, `history`, `market-*`, `fx`, `quote`…) es mercado
 * público y se conserva al cerrar sesión.
 *
 * `price-alerts` se escribe también en `components/domain/alert-client.tsx`
 * (`PRICE_ALERTS_KEY`). Se repite aquí para no meter componentes de UI en el
 * chunk de autenticación; si cambia allá, hay que cambiar esta lista.
 */
const PRIVATE_QUERY_ROOTS: ReadonlySet<string> = new Set([
  "portfolio",
  "balances",
  "activity",
  "me",
  "prefs",
  "consents",
  "deletion",
  "price-alerts",
]);

export function isPrivateQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === "string" && PRIVATE_QUERY_ROOTS.has(root);
}

/**
 * Cancela las lecturas privadas en vuelo y las saca de la caché en memoria.
 *
 * `query.cancel()` marca el retryer como cancelado de forma síncrona: si la
 * respuesta HTTP llega después, TanStack Query la descarta y no vuelve a
 * escribir el dato viejo. Después se eliminan las consultas y se vacía la
 * caché de mutaciones, que también puede contener datos de la cuenta.
 *
 * No toca claves públicas ni `localStorage`/`sessionStorage`.
 */
export async function purgePrivateQueryCache(client: QueryClient): Promise<void> {
  const queries = client
    .getQueryCache()
    .findAll({ predicate: (query) => isPrivateQueryKey(query.queryKey) });

  const cancellations = queries.map((query) => query.cancel({ silent: true }));

  client.removeQueries({ predicate: (query) => isPrivateQueryKey(query.queryKey) });
  client.getMutationCache().clear();

  await Promise.all(cancellations);
}

/**
 * Limpieza asociada al ciclo de vida de la sesión:
 *
 * - purga al montar el provider y cada vez que cambia la identidad
 *   (`null` → usuario, usuario A → usuario B, usuario → `null`);
 * - mientras no hay sesión, elimina cualquier dato privado que una petición
 *   o mutación tardía intente volver a insertar en la caché.
 *
 * La purga de montaje también cubre el paso de `/app` al marketing, donde el
 * provider de cuenta se desmonta y entra la sesión invitada.
 */
export function usePrivateSessionCache(status: SessionStatus, userId: string | null): void {
  const client = useQueryClient();
  const identity = status === "authenticated" ? userId : null;
  const lastIdentity = useRef<string | null | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    void purgePrivateQueryCache(client);
  }, [client, identity]);

  useEffect(() => {
    if (status !== "unauthenticated") return;

    return client.getQueryCache().subscribe((event) => {
      if (event.type !== "added" && event.type !== "updated") return;
      if (event.query.state.data === undefined) return;
      if (!isPrivateQueryKey(event.query.queryKey)) return;
      client.removeQueries({ queryKey: event.query.queryKey, exact: true });
    });
  }, [client, status]);
}
