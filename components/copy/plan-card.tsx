"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  BILLING_PLAN_CATALOG,
  BILLING_PLAN_IDS,
  TRIAL_DAYS,
  formatClp,
  type BillingPlanId,
} from "@/lib/billing/plans";
import { cn } from "@/lib/cn";

/**
 * Planes de «Copiar carteras» y estado de la suscripción (encargo §3 S9).
 *
 * Los precios salen de `lib/billing/plans.ts` y NUNCA se escriben acá. El cobro
 * está gobernado por el doble candado del servidor (`copy_billing_enabled` +
 * `COPY_BILLING_READY` + credenciales): este componente sólo dibuja el botón
 * deshabilitado con `COPY_BILLING_SOON` cuando `/api/billing/status` dice
 * `billingEnabled: false`. Nada de acá llama a Mercado Pago.
 *
 * Cancelar es un clic (`POST /api/billing/cancel`), como pide la Ley 19.496.
 * La vuelta del checkout no activa nada: el estado lo confirma el webhook, así
 * que acá sólo se muestra «confirmando» mientras se relee el estado.
 */

type SubscriptionState = "pending" | "trial" | "active" | "past_due" | "canceled";

type SubscriptionView = {
  status: SubscriptionState;
  plan: BillingPlanId | null;
  provider: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
};

type StatusView = {
  billingEnabled: boolean;
  subscription: SubscriptionView | null;
  trialUsed: boolean;
};

type PlansPanelProps = {
  /** Valor del servidor (`isCopyBillingEnabled()`) mientras llega el estado real. */
  billingEnabled: boolean;
  /** Texto de `COPY_BILLING_SOON` (lo pasa la página). */
  billingSoon: string;
  /** La persona volvió del checkout de Mercado Pago (`?checkout=retorno`). */
  returned?: boolean;
};

const SUBSCRIPTION_STATES: readonly SubscriptionState[] = [
  "pending",
  "trial",
  "active",
  "past_due",
  "canceled",
];

const STATUS_LABEL: Record<SubscriptionState, string> = {
  pending: "Pago pendiente de confirmación",
  trial: "Prueba gratis",
  active: "Activa",
  past_due: "Pago atrasado",
  canceled: "Cancelada",
};

const PLAN_LABEL: Record<BillingPlanId, string> = {
  monthly: "Plan mensual",
  annual: "Plan anual",
};

const DATE_FORMAT = new Intl.DateTimeFormat("es-CL", { dateStyle: "long" });

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_FORMAT.format(date);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readPlan(value: unknown): BillingPlanId | null {
  return value === "monthly" || value === "annual" ? value : null;
}

function readState(value: unknown): SubscriptionState | null {
  return typeof value === "string" && (SUBSCRIPTION_STATES as readonly string[]).includes(value)
    ? (value as SubscriptionState)
    : null;
}

/** `{ok:true,data:{…}}` de `/api/billing/status`, sin confiar en el borde. */
function readStatus(raw: unknown): StatusView | null {
  const root = asRecord(raw);
  if (!root || root.ok !== true) return null;
  const data = asRecord(root.data);
  if (!data) return null;

  const sub = asRecord(data.subscription);
  const status = sub ? readState(sub.status) : null;
  const subscription: SubscriptionView | null =
    sub && status
      ? {
          status,
          plan: readPlan(sub.plan),
          provider: readString(sub.provider),
          trialEndsAt: readString(sub.trialEndsAt),
          currentPeriodEnd: readString(sub.currentPeriodEnd),
          cancelAt: readString(sub.cancelAt),
        }
      : null;

  return {
    billingEnabled: readBoolean(data.billingEnabled) ?? false,
    subscription,
    trialUsed: readBoolean(data.trialUsed) ?? Boolean(subscription?.trialEndsAt),
  };
}

function readErrorMessage(raw: unknown): string | null {
  const root = asRecord(raw);
  const error = root ? asRecord(root.error) : null;
  return error ? readString(error.message) : null;
}

function readErrorCode(raw: unknown): string | null {
  const root = asRecord(raw);
  const error = root ? asRecord(root.error) : null;
  return error ? readString(error.code) : null;
}

/** `initPoint` del preapproval: la única URL a la que se redirige. */
function readInitPoint(raw: unknown): string | null {
  const root = asRecord(raw);
  const data = root ? asRecord(root.data) : null;
  const direct = readString(data?.initPoint) ?? readString(data?.init_point) ?? readString(root?.initPoint);
  if (!direct) return null;
  try {
    const url = new URL(direct);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type Notice = { tone: "neutral" | "warn" | "down"; text: string };

/** Acento discreto: una línea de 2 px, sin cápsula de color. */
function noticeClass(tone: Notice["tone"]): string {
  if (tone === "down") return "border-down text-down";
  if (tone === "warn") return "border-warn text-warn";
  return "border-border-strong text-fg-body";
}

const PLAN_PERIOD: Record<BillingPlanId, string> = {
  monthly: "mes",
  annual: "año",
};

type PlanFact = { label: string; values: Record<BillingPlanId, string> };

/**
 * Comparación con los datos del catálogo y de los términos: la prueba y la
 * cancelación, más el precio de la fila superior. Nada de cifras ni columnas
 * inventadas.
 */
function planFacts(trialUsed: boolean): PlanFact[] {
  return [
    {
      label: "Prueba gratis",
      values: {
        monthly: trialUsed ? "Ya usada" : `${TRIAL_DAYS} días`,
        annual: trialUsed ? "Ya usada" : `${TRIAL_DAYS} días`,
      },
    },
    { label: "Cancelación", values: { monthly: "En un clic", annual: "En un clic" } },
  ];
}

function planCta(trialUsed: boolean): string {
  return trialUsed ? "Suscribirme" : "Empezar prueba";
}

export function PlansPanel({ billingEnabled, billingSoon, returned = false }: PlansPanelProps) {
  const soonId = useId();
  const [status, setStatus] = useState<StatusView | null>(null);
  const [reading, setReading] = useState(true);
  const [statusError, setStatusError] = useState<"session" | "read" | null>(null);
  const [pendingPlan, setPendingPlan] = useState<BillingPlanId | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await fetch("/api/billing/status", {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        const body: unknown = await response.json().catch(() => null);
        if (!alive) return;
        if (response.status === 401) {
          setStatus(null);
          setStatusError("session");
          return;
        }
        const parsed = readStatus(body);
        if (!parsed) {
          setStatus(null);
          setStatusError("read");
          return;
        }
        setStatus(parsed);
        setStatusError(null);
      } catch {
        if (alive) {
          setStatus(null);
          setStatusError("read");
        }
      } finally {
        if (alive) setReading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const subscribe = useCallback(async (plan: BillingPlanId) => {
    setPendingPlan(plan);
    setNotice(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = readErrorCode(body);
        setNotice({
          tone: "warn",
          text:
            code === "FEATURE_DISABLED"
              ? billingSoon
              : (readErrorMessage(body) ?? "No pudimos abrir el pago. Intenta de nuevo en un momento."),
        });
        return;
      }
      const initPoint = readInitPoint(body);
      if (!initPoint) {
        setNotice({ tone: "down", text: "Mercado Pago no entregó la dirección de pago. Intenta de nuevo." });
        return;
      }
      window.location.assign(initPoint);
    } catch {
      setNotice({ tone: "down", text: "No pudimos abrir el pago. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setPendingPlan(null);
    }
  }, [billingSoon]);

  const cancel = useCallback(async () => {
    setCanceling(true);
    setNotice(null);
    try {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: "{}",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice({
          tone: "warn",
          text: readErrorMessage(body) ?? "No pudimos cancelar ahora. Escríbenos y lo hacemos nosotros.",
        });
        return;
      }
      setNotice({
        tone: "neutral",
        text: "Suscripción cancelada. Mantienes el acceso hasta el final del período que ya pagaste.",
      });
      setReloadKey((key) => key + 1);
    } catch {
      setNotice({ tone: "down", text: "No pudimos cancelar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setCanceling(false);
    }
  }, []);

  const enabled = status?.billingEnabled ?? billingEnabled;
  const subscription = status?.subscription ?? null;
  const trialUsed = status?.trialUsed ?? false;
  const currentPlan = subscription && subscription.status !== "canceled" ? subscription.plan : null;
  const fromFraccionPro = subscription?.provider === "fraccion_pro";
  const canCancel =
    subscription !== null &&
    subscription.status !== "canceled" &&
    subscription.provider !== "fraccion_pro";

  const facts = planFacts(trialUsed);
  const needsAttention =
    subscription !== null &&
    (subscription.status === "past_due" || subscription.status === "canceled");

  return (
    <div className="flex flex-col gap-10">
      {returned ? (
        <section className="flex flex-col items-start gap-2 border-b border-border pb-6">
          <h2 className="text-base leading-snug font-medium tracking-tight">
            Volviste de Mercado Pago
          </h2>
          <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
            El acceso se activa cuando Mercado Pago confirma el pago; puede tardar un minuto. Esta
            página no da acceso por sí sola.
          </p>
          <Button
            variant="secondary"
            size="md"
            className="mt-1 min-h-11"
            onClick={() => setReloadKey((key) => key + 1)}
            loading={reading}
          >
            Actualizar estado
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="planes-titulo" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="planes-titulo" className="text-lg font-medium tracking-tight">
            Planes
          </h2>
          <p className="text-[13px] leading-5 text-fg-muted">
            {trialUsed
              ? `La prueba de ${TRIAL_DAYS} días ya se usó una vez.`
              : `${TRIAL_DAYS} días de prueba, una vez por usuario.`}
          </p>
        </div>

        <ul className="grid gap-1 text-[13px] leading-relaxed text-fg-body sm:grid-cols-3 sm:gap-6">
          <li>Composición completa y movimientos de cada cartera.</li>
          <li>Copiar mezcla en demo y, cuando se habilite, con dinero real.</li>
          <li>Seguir hasta 10 carteras con aviso de cambios.</li>
        </ul>

        {!enabled ? (
          <p id={soonId} className="max-w-prose text-[13px] leading-relaxed text-fg-body">
            {billingSoon}
          </p>
        ) : null}

        {/* Dos planes comparables: misma estructura y mismas filas de dato. */}
        <ul className="grid gap-3 md:grid-cols-2 md:gap-6">
          {BILLING_PLAN_IDS.map((plan) => {
            const current = currentPlan === plan;
            const primary = plan === "annual";
            return (
              <li
                key={plan}
                className={cn(
                  "flex flex-col rounded-3xl border p-5 md:p-6",
                  current ? "border-fg" : "border-border",
                  primary ? "bg-surface-1" : "bg-bg",
                )}
              >
                <h3 className="label">{BILLING_PLAN_CATALOG[plan].label}</h3>
                <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="num text-3xl leading-none font-medium tracking-tight tabular-nums text-fg">
                    {formatClp(BILLING_PLAN_CATALOG[plan].amountClp)}
                  </span>
                  <span className="text-[13px] leading-5 text-fg-muted">/ {PLAN_PERIOD[plan]}</span>
                </p>

                <dl className="mt-5 flex flex-col border-t border-border/70">
                  {facts.map((fact) => (
                    <div
                      key={fact.label}
                      className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5 text-[13px] leading-5 last:border-b-0"
                    >
                      <dt className="text-fg-muted">{fact.label}</dt>
                      <dd className="text-right font-medium text-fg-body">{fact.values[plan]}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-auto pt-6">
                  <Button
                    size="lg"
                    variant={primary ? "primary" : "secondary"}
                    className="min-h-12 w-full whitespace-nowrap"
                    disabled={!enabled || current}
                    loading={pendingPlan === plan}
                    aria-describedby={!enabled ? soonId : undefined}
                    onClick={() => void subscribe(plan)}
                  >
                    {current ? "Tu plan actual" : planCta(trialUsed)}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
          La suscripción se renueva automáticamente hasta que la canceles.
        </p>
      </section>

      <section
        aria-labelledby="suscripcion-titulo"
        className="flex flex-col gap-3 border-t border-border pt-8"
      >
        <h2 id="suscripcion-titulo" className="text-lg font-medium tracking-tight">
          Tu suscripción
        </h2>

        {reading && !status ? (
          <p className="text-[13px] leading-5 text-fg-muted">Leyendo tu suscripción…</p>
        ) : statusError === "session" ? (
          <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
            No pudimos leer la suscripción con esta sesión. Entra con tu cuenta de Maverlang para verla
            y cancelarla.
          </p>
        ) : statusError === "read" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
              No pudimos leer el estado de tu suscripción ahora. Los precios de arriba no cambian.
            </p>
            <Button
              variant="secondary"
              size="md"
              className="min-h-11"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Reintentar
            </Button>
          </div>
        ) : subscription === null ? (
          <div className="flex flex-col gap-1 text-[13px] leading-relaxed text-fg-muted">
            <p>Aún no tienes una suscripción a Copiar carteras.</p>
            <p>
              {trialUsed
                ? "La prueba de 7 días se usa una sola vez por usuario."
                : "La prueba de 7 días se activa al suscribirte y se ofrece una sola vez por usuario."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-6 border-b border-border/70 py-2.5">
                <dt className="text-[13px] leading-5 text-fg-muted">Estado</dt>
                <dd
                  className={cn(
                    "text-right text-[13px] leading-5 font-medium",
                    needsAttention ? "text-warn" : "text-fg",
                  )}
                >
                  {STATUS_LABEL[subscription.status]}
                </dd>
              </div>
              {subscription.plan ? (
                <div className="flex items-baseline justify-between gap-6 border-b border-border/70 py-2.5">
                  <dt className="text-[13px] leading-5 text-fg-muted">Plan</dt>
                  <dd className="text-right text-[13px] leading-5 font-medium text-fg">
                    {PLAN_LABEL[subscription.plan]}
                  </dd>
                </div>
              ) : null}
              {fromFraccionPro ? (
                <div className="flex items-baseline justify-between gap-6 border-b border-border/70 py-2.5">
                  <dt className="text-[13px] leading-5 text-fg-muted">Acceso</dt>
                  <dd className="text-right text-[13px] leading-5 font-medium text-fg">Fraccion Pro</dd>
                </div>
              ) : null}
            </dl>

            {subscription.status === "trial" && isoDate(subscription.trialEndsAt) ? (
              <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
                La prueba termina el {isoDate(subscription.trialEndsAt)}. Después se cobra el plan
                elegido.
              </p>
            ) : null}
            {subscription.status === "active" && isoDate(subscription.currentPeriodEnd) ? (
              <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
                Se renueva el {isoDate(subscription.currentPeriodEnd)}. Puedes cancelar cuando quieras.
              </p>
            ) : null}
            {subscription.status === "past_due" ? (
              <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
                Mercado Pago no confirmó el último cobro. Mantienes la lectura por 3 días de gracia;
                después se suspende el acceso.
              </p>
            ) : null}
            {subscription.status === "pending" ? (
              <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
                Estamos esperando la confirmación de Mercado Pago.
              </p>
            ) : null}
            {subscription.status === "canceled" ? (
              <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
                {isoDate(subscription.currentPeriodEnd)
                  ? `Cancelada. Mantienes el acceso hasta el ${isoDate(subscription.currentPeriodEnd)}.`
                  : "Cancelada. No se renueva."}
              </p>
            ) : null}
            {fromFraccionPro ? (
              <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
                Tu acceso viene de Fraccion Pro y se administra en fraccion.si: acá no se cobra ni se
                cancela.
              </p>
            ) : null}

            {canCancel ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="secondary"
                  size="md"
                  className="min-h-11 w-full sm:w-auto"
                  loading={canceling}
                  onClick={() => void cancel()}
                >
                  Cancelar suscripción
                </Button>
                <p className="text-[13px] leading-5 text-fg-muted">
                  Se cancela en un clic, sin llamadas ni formularios.
                </p>
              </div>
            ) : null}
          </div>
        )}

        {notice ? (
          <p
            aria-live="polite"
            className={cn(
              "max-w-prose border-l-2 pl-3 text-[13px] leading-relaxed",
              noticeClass(notice.tone),
            )}
          >
            {notice.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
