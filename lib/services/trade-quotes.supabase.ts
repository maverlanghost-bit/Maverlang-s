import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  BuiltQuotePatch,
  LiveQuotePayload,
  LiveQuoteStatus,
  LiveQuoteStore,
  SaveQuotePayloadInput,
  StoredLiveQuote,
} from "@/lib/trade/quote-store";

/**
 * Almacén de la cotización real dentro de `trade_reservations` (0042/0047 +
 * 0049). Vive en `lib/services/*.supabase.ts` para que el cliente admin quede
 * dentro de la lista blanca M57; la validación del payload está en
 * `lib/trade/quote-store.ts`.
 *
 * Nada de esto cae a memoria del proceso: si la RPC no existe (migración 0049
 * sin aplicar), la tabla no responde o la fila no está, el error sube y el
 * llamador falla cerrado. Un `Map` local volvería a esconder la cotización de
 * las demás instancias, que es justo el hallazgo M-05.
 */

type UnknownRow = Record<string, unknown>;

function firstRow(data: unknown): UnknownRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as UnknownRow) : null;
  }
  return data && typeof data === "object" ? (data as UnknownRow) : null;
}

/** jsonb puede llegar como objeto (PostgREST) o como texto (driver crudo). */
function asPayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function asStatus(value: unknown): LiveQuoteStatus {
  return value === "consumed" || value === "released" ? value : "reserved";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function createTradeQuoteStore(): LiveQuoteStore {
  return {
    async saveQuote(input: SaveQuotePayloadInput): Promise<void> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("save_trade_quote", {
        p_user_id: input.userId,
        p_request_id: input.requestId,
        p_symbol: input.symbol,
        p_payload: input.payload,
      });
      if (error) throw new Error("quote_save_failed");
      if (data !== true) throw new Error("MV_QUOTE_MISSING");
    },

    async readQuote(userId: string, requestId: string): Promise<StoredLiveQuote | null> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("read_trade_quote", {
        p_user_id: userId,
        p_request_id: requestId,
      });
      if (error) throw new Error("quote_read_failed");
      const row = firstRow(data);
      if (!row) return null;
      const payload = asPayload(row.quote_payload);
      if (!payload || typeof payload !== "object") return null;
      return {
        payload: payload as LiveQuotePayload,
        status: asStatus(row.quote_status ?? row.status),
        reservationExpiresAt: asString(row.quote_expires_at ?? row.expires_at),
      };
    },

    async claimBuild(userId: string, requestId: string): Promise<boolean> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("claim_trade_quote_build", {
        p_user_id: userId,
        p_request_id: requestId,
      });
      if (error) throw new Error("quote_claim_failed");
      return data === true;
    },

    async recordBuilt(
      userId: string,
      requestId: string,
      patch: BuiltQuotePatch,
    ): Promise<void> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("record_trade_quote_build", {
        p_user_id: userId,
        p_request_id: requestId,
        p_patch: patch,
      });
      if (error) throw new Error("quote_record_failed");
      if (data !== true) throw new Error("MV_QUOTE_MISSING");
    },
  };
}
