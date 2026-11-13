/**
 * Planes de "Copiar carteras" (decisión de Manu, 10-nov-2026):
 * $9.990 CLP al mes o $99.900 CLP al año, con 7 días de prueba gratis
 * una sola vez por usuario. Los precios viven acá y en ningún otro lado.
 *
 * Con `copy_billing_enabled` apagado (default) o `COPY_BILLING_READY`
 * distinto de "true" no se cobra: ver `lib/billing/provider.ts`.
 */

/** Identificador de plan que viaja en el cuerpo de `/api/billing/checkout`. */
export type BillingPlanId = "monthly" | "annual";

/** Contrato §3 S4: precios en pesos chilenos. */
export const COPY_PLANS = {
  monthly: { clp: 9990 },
  annual: { clp: 99900 },
} as const;

/** Días de prueba gratis. Una sola vez por usuario (marca: `trial_ends_at`). */
export const TRIAL_DAYS = 7;

/** Los mismos 7 días en milisegundos, para calcular `trial_ends_at`. */
export const TRIAL_DAYS_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/** Orden estable para listar planes en la UI y validar el cuerpo. */
export const BILLING_PLAN_IDS = ["monthly", "annual"] as const;

export interface BillingPlanDefinition {
  id: BillingPlanId;
  /** Etiqueta visible, en español de Chile. */
  label: string;
  /** Precio en CLP; espejo exacto de `COPY_PLANS`. */
  amountClp: number;
  /** Cantidad de períodos entre cobros (Mercado Pago `auto_recurring.frequency`). */
  frequency: number;
  /** Mercado Pago sólo acepta "days" o "months"; el plan anual son 12 meses. */
  frequencyType: "months";
  /** Meses que cubre cada cobro. */
  months: number;
  /** Glosa que ve el pagador en Mercado Pago. */
  reason: string;
  /**
   * Variable con el id del plan de Mercado Pago (opcional). Sólo se usa
   * cuando NO hay prueba gratis: el `free_trial` no se puede inyectar en un
   * preapproval atado a un plan, así que con prueba se arma inline.
   */
  planIdEnv: "MERCADOPAGO_PLAN_MONTHLY_ID" | "MERCADOPAGO_PLAN_ANNUAL_ID";
}

export const BILLING_PLAN_CATALOG: Record<BillingPlanId, BillingPlanDefinition> = {
  monthly: {
    id: "monthly",
    label: "Mensual",
    amountClp: COPY_PLANS.monthly.clp,
    frequency: 1,
    frequencyType: "months",
    months: 1,
    reason: "Maverlang Copiar — plan mensual",
    planIdEnv: "MERCADOPAGO_PLAN_MONTHLY_ID",
  },
  annual: {
    id: "annual",
    label: "Anual",
    amountClp: COPY_PLANS.annual.clp,
    frequency: 12,
    frequencyType: "months",
    months: 12,
    reason: "Maverlang Copiar — plan anual",
    planIdEnv: "MERCADOPAGO_PLAN_ANNUAL_ID",
  },
};

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return value === "monthly" || value === "annual";
}

/**
 * Ruta de vuelta desde Mercado Pago. La decide el servidor: nunca se acepta
 * una `back_url` del cliente (evita redirecciones a otro sitio).
 */
export const BILLING_RETURN_PATH = "/app/copiar/planes?checkout=retorno";

const CLP_FORMAT = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** `9990` → `$9.990`. */
export function formatClp(amountClp: number): string {
  return CLP_FORMAT.format(amountClp);
}
