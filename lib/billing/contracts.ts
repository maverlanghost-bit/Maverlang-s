import { z } from "zod";

import { BILLING_PLAN_IDS } from "@/lib/billing/plans";

/**
 * Esquemas de entrada de `/api/billing/*` (M56).
 *
 * Viven junto al dominio de cobro —igual que `lib/copy/contracts.ts` para
 * `/api/copy/*`— para que toda ruta que cambia estado valide su entrada con
 * `parseJson` y nunca confíe en el cuerpo del cliente. El webhook es un
 * objeto abierto del proveedor: su autenticidad la da `x-signature`, no el
 * cuerpo, así que sólo se comprueba que sea un objeto JSON.
 */

/** POST /api/billing/checkout — sólo el plan; cualquier otro campo es 400. */
export const billingCheckoutBodySchema = z
  .object({
    plan: z.enum(BILLING_PLAN_IDS),
  })
  .strict();

/** POST /api/billing/cancel — sin cuerpo: se acepta vacío y se rechaza cualquier campo. */
export const billingCancelBodySchema = z.object({}).strict().optional();

/** POST /api/billing/webhook — aviso abierto de Mercado Pago. */
export const billingWebhookBodySchema = z.record(z.string(), z.unknown());

/** Query del webhook: trae `data.id` y `type`; cualquier otro parámetro se ignora. */
export const billingWebhookQuerySchema = z.record(z.string(), z.string());
