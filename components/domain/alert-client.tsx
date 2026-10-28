"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z, type ZodType } from "zod";

import {
  apiResultSchema,
  priceAlertCreateSchema,
  priceAlertDeleteSchema,
  priceAlertsResponseSchema,
  priceAlertWriteResponseSchema,
} from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/client";

export const PRICE_ALERTS_KEY = ["price-alerts"] as const;

const alertMoney = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatAlertMoney(value: number): string {
  return alertMoney.format(value);
}

export type PriceAlertDto = z.infer<typeof priceAlertWriteResponseSchema>["alert"];
export type PriceAlertsPayload = z.infer<typeof priceAlertsResponseSchema>;
export type PriceAlertCreateBody = z.infer<typeof priceAlertCreateSchema>;

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body != null && !headers.has("content-type")) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError("UPSTREAM", "No pudimos conectar.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("UPSTREAM", "La respuesta no es JSON.", response.status || 502);
  }
  const parsed = apiResultSchema(schema).safeParse(payload);
  if (!parsed.success || !parsed.data.ok) {
    if (parsed.success && !parsed.data.ok) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, response.status, parsed.data.requestId);
    }
    throw new ApiError("UPSTREAM", "La respuesta no tiene el formato esperado.", response.status || 502);
  }
  return parsed.data.data;
}

export function listPriceAlerts(): Promise<PriceAlertsPayload> {
  return request("/api/me/alerts", priceAlertsResponseSchema, { cache: "no-store" });
}

export function createPriceAlert(body: PriceAlertCreateBody) {
  return request("/api/me/alerts", priceAlertWriteResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export function deletePriceAlert(id: string) {
  const body = { id } satisfies z.infer<typeof priceAlertDeleteSchema>;
  return request("/api/me/alerts", priceAlertWriteResponseSchema, {
    method: "DELETE",
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export function usePriceAlerts(enabled: boolean) {
  return useQuery({
    queryKey: PRICE_ALERTS_KEY,
    queryFn: listPriceAlerts,
    enabled,
    staleTime: 10_000,
  });
}

export function useRefreshPriceAlerts() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: PRICE_ALERTS_KEY });
}
