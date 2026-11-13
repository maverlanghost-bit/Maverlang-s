"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BILLING_PLAN_CATALOG,
  BILLING_PLAN_IDS,
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

function noticeClass(tone: Notice["tone"]): string {
  if (tone === "down") return "border-down/30 bg-down-bg text-down";
  if (tone === "warn") return "border-warn/30 bg-warn-bg text-warn";
  return "border-border bg-surface-1 text-fg-body";
}

function PlanCard({
  plan,
  billingEnabled,
  trialUsed,
  current,
  pending,
  onSubscribe,
}: {
  plan: BillingPlanId;
  billingEnabled: boolean;
  trialUsed: boolean;
  current: boolean;
  pending: boolean;
  onSubscribe: (plan: BillingPlanId) => void;
}) {
  const definition = BILLING_PLAN_CATALOG[plan];
  const period = plan === "monthly" ? "mes" : "año";
  return (
    <Card
      className={cn(
        "flex flex-col gap-4",
        plan === "annual" ? "border-fg/20" : undefined,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{definition.label}</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {plan === "annual" ? "Equivale a 2 meses gratis." : "Se renueva todos los meses."}
          </p>
        </div>
        {plan === "annual" ? <Badge tone="brand">Mejor precio</Badge> : null}
      </div>

      <p className="flex flex-wrap items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight">{formatClp(definition.amountClp)}</span>
        <span className="text-sm text-fg-muted">/ {period}</span>
      </p>

      <ul className="flex flex-col gap-1.5 text-sm text-fg-body">
        <li>· Composición completa y movimientos de cada cartera.</li>
        <li>· Copiar mezcla en demo y, cuando se habilite, con dinero real.</li>
        <li>· Seguir hasta 10 carteras con aviso de cambios.</li>
        <li>· {trialUsed ? "La prueba de 7 días ya se usó una vez." : "7 días de prueba gratis, una vez por usuario."}</li>
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        <Button
          size="lg"
          variant={plan === "annual" ? "primary" : "secondary"}
          className="min-h-12 w-full"
          disabled={!billingEnabled || current}
          loading={pending}
          onClick={() => onSubscribe(plan)}
        >
          {current ? "Tu plan actual" : trialUsed ? `Suscribirme: ${definition.label}` : "Empezar los 7 días gratis"}
        </Button>
      </div>
    </Card>
  );
}

export function PlansPanel({ billingEnabled, billingSoon, returned = false }: PlansPanelProps) {
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

  return (
    <div className="flex flex-col gap-6">
      {returned ? (
        <div className={cn("rounded-xl border p-4 text-sm leading-relaxed", noticeClass("neutral"))}>
          <p className="font-medium">Volviste de Mercado Pago.</p>
          <p className="mt-1">
            El acceso se activa cuando Mercado Pago confirma el pago; puede tardar un minuto. Esta página no
            da acceso por sí sola.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 min-h-11"
            onClick={() => setReloadKey((key) => key + 1)}
            loading={reading}
          >
            Actualizar estado
          </Button>
        </div>
      ) : null}

      {!enabled ? (
        <p className="rounded-xl border border-warn/30 bg-warn-bg p-3 text-sm leading-relaxed text-warn">
          {billingSoon}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {BILLING_PLAN_IDS.map((plan) => (
          <PlanCard
            key={plan}
            plan={plan}
            billingEnabled={enabled}
            trialUsed={trialUsed}
            current={currentPlan === plan}
            pending={pendingPlan === plan}
            onSubscribe={(next) => void subscribe(next)}
          />
        ))}
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">Tu suscripción</h2>

        {reading && !status ? (
          <p className="text-sm text-fg-muted">Leyendo tu suscripción…</p>
        ) : statusError === "session" ? (
          <p className="text-sm leading-relaxed text-fg-muted">
            No pudimos leer la suscripción con esta sesión. Entra con tu cuenta de Maverlang para verla y
            cancelarla.
          </p>
        ) : statusError === "read" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-relaxed text-fg-muted">
              No pudimos leer el estado de tu suscripción ahora. Los precios de arriba no cambian.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11 self-start"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Reintentar
            </Button>
          </div>
        ) : subscription === null ? (
          <div className="flex flex-col gap-1 text-sm leading-relaxed text-fg-muted">
            <p>Aún no tienes una suscripción a Copiar carteras.</p>
            <p>
              {trialUsed
                ? "La prueba de 7 días se usa una sola vez por usuario."
                : "La prueba de 7 días se activa al suscribirte y se ofrece una sola vez por usuario."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm leading-relaxed">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={subscription.status === "past_due" || subscription.status === "canceled" ? "warn" : "up"}>
                {STATUS_LABEL[subscription.status]}
              </Badge>
              {subscription.plan ? <span className="text-fg-body">{PLAN_LABEL[subscription.plan]}</span> : null}
              {fromFraccionPro ? <Badge tone="neutral">Fraccion Pro</Badge> : null}
            </p>
            {subscription.status === "trial" && isoDate(subscription.trialEndsAt) ? (
              <p className="text-fg-muted">
                La prueba termina el {isoDate(subscription.trialEndsAt)}. Después se cobra el plan elegido.
              </p>
            ) : null}
            {subscription.status === "active" && isoDate(subscription.currentPeriodEnd) ? (
              <>
                <p className="text-fg-muted">
                  Se renueva el {isoDate(subscription.currentPeriodEnd)}. Puedes cancelar cuando quieras.
                </p>
                <p className="text-[13px] text-fg-subtle">
                  Se renueva sola hasta que la canceles; puedes hacerlo cuando quieras.
                </p>
              </>
            ) : null}
            {subscription.status === "past_due" ? (
              <p className="text-fg-muted">
                Mercado Pago no confirmó el último cobro. Mantienes la lectura por 3 días de gracia; después se
                suspende el acceso.
              </p>
            ) : null}
            {subscription.status === "pending" ? (
              <p className="text-fg-muted">Estamos esperando la confirmación de Mercado Pago.</p>
            ) : null}
            {subscription.status === "canceled" ? (
              <p className="text-fg-muted">
                {isoDate(subscription.currentPeriodEnd)
                  ? `Cancelada. Mantienes el acceso hasta el ${isoDate(subscription.currentPeriodEnd)}.`
                  : "Cancelada. No se renueva."}
              </p>
            ) : null}
            {fromFraccionPro ? (
              <p className="text-fg-muted">
                Tu acceso viene de Fraccion Pro y se administra en fraccion.si: acá no se cobra ni se cancela.
              </p>
            ) : null}

            {canCancel ? (
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-12 w-full sm:w-auto"
                  loading={canceling}
                  onClick={() => void cancel()}
                >
                  Cancelar suscripción
                </Button>
                <p className="text-[13px] text-fg-subtle">Se cancela en un clic, sin llamadas ni formularios.</p>
              </div>
            ) : null}
          </div>
        )}

        {notice ? (
          <p
            aria-live="polite"
            className={cn("rounded-xl border p-3 text-sm leading-relaxed", noticeClass(notice.tone))}
          >
            {notice.text}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
