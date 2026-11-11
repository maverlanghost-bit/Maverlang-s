"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { COVERAGE_COPY_MIN, COVERAGE_FULL_MIN } from "@/components/copy/coverage";
import { DemoMixButton } from "@/components/copy/demo-mix-button";
import { MixStep, type MixLeg } from "@/components/copy/mix-step";
import { Button } from "@/components/ui/button";
import { COPY_CTA_NOTE, COPY_REAL_DISABLED } from "@/content/copy-legal";
import { formatUsd } from "@/lib/format";

type CartLeg = MixLeg & { weightOriginal: number | null };

type CopyPlanView = {
  planId: string;
  legs: CartLeg[];
  coveragePct: number;
  unavailableUsd: number;
  warnings: string[];
  totalUsd: number;
};

type AccountChoice = "demo" | "real";

class PlanRequestError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "PlanRequestError";
    this.code = code;
  }
}

const percentFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function legsOf(value: unknown): CartLeg[] {
  if (!Array.isArray(value)) return [];
  const legs: CartLeg[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const symbol = record ? asString(record.symbol) : null;
    const usd = record ? asNumber(record.usd) : null;
    if (!record || !symbol || usd === null || usd <= 0) continue;
    legs.push({
      symbol,
      usd,
      weightOriginal: asNumber(record.weightOriginal),
    });
  }
  return legs;
}

/** Limpia el monto a dígitos y una coma decimal de hasta 2 lugares (es-CL). */
function cleanAmount(raw: string): string {
  let text = "";
  let hasSeparator = false;
  for (const char of raw) {
    if (char >= "0" && char <= "9") text += char;
    else if ((char === "," || char === ".") && !hasSeparator) {
      text += ",";
      hasSeparator = true;
    }
  }
  const [whole = "", decimals] = text.split(",");
  const cleanWhole = whole.replace(/^0+(?=\d)/, "").slice(0, 7);
  if (decimals === undefined) return cleanWhole;
  return `${cleanWhole || "0"},${decimals.slice(0, 2)}`;
}

function parseAmount(raw: string): number | null {
  const text = cleanAmount(raw).replace(",", ".");
  if (!text || text === ".") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/**
 * Carrito de la mezcla. El monto y la cuenta los elige la persona, pero las
 * piernas y los pesos SIEMPRE vienen de `/api/copy/plan`: el cliente no manda
 * pesos propios, solo el monto total y el `versionId` que vio en la ficha.
 */
export function MixCart({
  slug,
  versionId,
  name,
  manager,
  asOfLabel,
  coveragePct,
  availableCount,
  totalCount,
  blockedReason,
  realBuyEnabled,
  initialAmount,
  adjust,
}: {
  slug: string;
  versionId: string;
  name: string;
  manager: string;
  asOfLabel: string;
  coveragePct: number;
  availableCount: number;
  totalCount: number;
  blockedReason: string | null;
  realBuyEnabled: boolean;
  initialAmount: string;
  adjust: boolean;
}) {
  const amountId = useId();
  const spreadId = useId();
  const realNoteId = useId();
  const [amountRaw, setAmountRaw] = useState(() => cleanAmount(initialAmount));
  const [account, setAccount] = useState<AccountChoice>("demo");
  const [noSpread, setNoSpread] = useState(false);
  const [plan, setPlan] = useState<CopyPlanView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSubscription, setNeedsSubscription] = useState(false);

  const damaged = blockedReason !== null;
  const partial = coveragePct >= COVERAGE_COPY_MIN && coveragePct < COVERAGE_FULL_MIN;

  function resetPlan() {
    setPlan(null);
    setError(null);
    setNeedsSubscription(false);
  }

  function pickAccount(next: AccountChoice) {
    if (next === "real" && !realBuyEnabled) return;
    setAccount(next);
    resetPlan();
  }

  async function armPlan() {
    if (damaged || pending) return;
    const totalUsd = parseAmount(amountRaw);
    if (totalUsd === null) {
      setError("Escribe un monto mayor a cero para armar la mezcla.");
      return;
    }
    setPending(true);
    resetPlan();
    try {
      const response = await fetch("/api/copy/plan", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          slug,
          versionId,
          totalUsd,
          account,
          spreadUnavailable: !noSpread,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const envelope = asRecord(payload);
      if (!response.ok || !envelope || envelope.ok !== true) {
        const failure = envelope ? asRecord(envelope.error) : null;
        throw new PlanRequestError(
          asString(failure?.message) ?? "No pudimos armar la mezcla. Inténtalo de nuevo.",
          asString(failure?.code),
        );
      }
      const data = asRecord(envelope.data);
      if (!data) throw new PlanRequestError("El plan llegó incompleto. Inténtalo de nuevo.", null);
      const body = asRecord(data.plan) ?? data;
      const planId = asString(body.planId);
      const legs = legsOf(body.legs);
      if (!planId || legs.length === 0) {
        throw new PlanRequestError("El plan llegó incompleto. Inténtalo de nuevo.", null);
      }
      setPlan({
        planId,
        legs,
        coveragePct: asNumber(body.coveragePct) ?? coveragePct,
        unavailableUsd: asNumber(body.unavailableUsd) ?? 0,
        warnings: Array.isArray(body.warnings)
          ? body.warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
        totalUsd: asNumber(body.totalUsd) ?? totalUsd,
      });
    } catch (thrown) {
      if (thrown instanceof PlanRequestError && thrown.code === "COPY_SUBSCRIPTION_REQUIRED") {
        setNeedsSubscription(true);
        setError("Necesitas una suscripción a Copiar carteras para armar la mezcla.");
      } else {
        setError(thrown instanceof Error ? thrown.message : "No pudimos armar la mezcla. Inténtalo de nuevo.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-surface-1 p-4 shadow-card sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          {`Mezcla · ${account === "demo" ? "Demo" : "Dinero real"}`}
        </p>
        <h2 className="text-lg font-medium tracking-tight text-fg text-balance">{name}</h2>
        <p className="text-sm text-fg-muted">
          {manager} · Dato al {asOfLabel}
        </p>
        <p className="text-sm text-fg-muted tabular-nums">
          Cobertura en Maverlang: {percentFormat.format(coveragePct)} % ·{" "}
          {availableCount} de {totalCount} activos disponibles
        </p>
      </div>

      {adjust ? (
        <p className="rounded-xl border border-border/70 bg-surface-2/70 px-3 py-2 text-sm leading-relaxed text-fg-body">
          Estás revisando un ajuste: aquí se arma un <strong className="font-medium text-fg">plan nuevo</strong> con la
          composición actual. Nada se ejecuta hasta que lo confirmes, orden por orden.
        </p>
      ) : null}

      {damaged ? (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-warn/40 bg-warn-bg/60 p-4">
          <p className="text-sm leading-relaxed text-warn">{blockedReason}</p>
          <Button asChild variant="secondary" size="lg" className="min-h-12 w-full touch-manipulation">
            <Link href={`/app/copiar/${encodeURIComponent(slug)}`}>Volver a la ficha</Link>
          </Button>
        </div>
      ) : plan ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg">Piernas de la mezcla</p>
            <p className="text-xs text-fg-muted tabular-nums">
              {plan.legs.length} órdenes · Total {formatUsd(plan.totalUsd)}
            </p>
          </div>
          <ol className="flex flex-col divide-y divide-border/60">
            {plan.legs.map((leg, position) => (
              <li key={`${leg.symbol}-${position}`} className="flex items-baseline justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{leg.symbol}</p>
                  <p className="text-xs text-fg-muted tabular-nums">
                    {leg.weightOriginal !== null ? `Peso original ${percentFormat.format(leg.weightOriginal)} % · ` : ""}
                    Orden {position + 1} de {plan.legs.length}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-fg tabular-nums">{formatUsd(leg.usd)}</p>
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-bg/60 p-3">
            <p className="text-sm text-fg tabular-nums">
              Cobertura: replicas el {percentFormat.format(plan.coveragePct)} % del portafolio original
            </p>
            {plan.coveragePct >= COVERAGE_COPY_MIN && plan.coveragePct < COVERAGE_FULL_MIN ? (
              <p className="inline-flex w-fit rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-medium text-warn">
                Réplica parcial
              </p>
            ) : null}
            {plan.unavailableUsd > 0 ? (
              <p className="text-xs leading-relaxed text-fg-muted tabular-nums">
                {noSpread
                  ? `Dejamos ${formatUsd(plan.unavailableUsd)} en USDC: es lo que no está disponible en Maverlang.`
                  : `Lo no disponible (${formatUsd(plan.unavailableUsd)}) se repartió entre lo comprable; no queda saldo sin invertir.`}
              </p>
            ) : null}
            {plan.warnings.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {plan.warnings.map((warning, position) => (
                  <li key={`${position}-${warning}`} className="text-xs leading-relaxed text-fg-muted">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs leading-relaxed text-fg-muted">
              El plan vence 10 minutos después de armarlo. Si vence, se arma uno nuevo con precios nuevos.
            </p>
          </div>

          {account === "demo" ? (
            <DemoMixButton planId={plan.planId} totalUsd={plan.totalUsd} onReset={resetPlan} />
          ) : realBuyEnabled ? (
            <MixStep planId={plan.planId} legs={plan.legs} totalUsd={plan.totalUsd} />
          ) : (
            <p className="rounded-xl border border-warn/40 bg-warn-bg/60 p-3 text-sm leading-relaxed text-warn">
              {COPY_REAL_DISABLED}
            </p>
          )}

          <p className="text-center text-xs leading-relaxed text-fg-muted">{COPY_CTA_NOTE}</p>

          <Button variant="ghost" size="lg" className="min-h-12 w-full touch-manipulation" onClick={resetPlan}>
            Cambiar monto o cuenta
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={amountId} className="text-sm font-medium text-fg">
              Monto total (US$)
            </label>
            <div className="flex min-h-14 items-center gap-2 rounded-2xl border border-border bg-bg px-4 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
              <span className="font-mono text-lg text-fg-muted">US$</span>
              <input
                id={amountId}
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="100"
                value={amountRaw}
                onChange={(event) => {
                  setAmountRaw(cleanAmount(event.target.value));
                  resetPlan();
                }}
                className="min-h-14 w-full min-w-0 bg-transparent font-mono text-2xl text-fg tabular-nums outline-none placeholder:text-fg-muted"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {["50", "100", "250", "500"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmountRaw(preset);
                    resetPlan();
                  }}
                  className="inline-flex min-h-12 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border/80 bg-surface-1 px-4 text-sm font-medium text-fg tabular-nums transition-colors hover:border-brand/40 hover:bg-brand-soft/50 hover:text-brand"
                >
                  US$ {preset}
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-fg-muted">
              Mínimo US$1 por orden. Las piernas que queden bajo ese monto se descartan y su peso se reparte entre el
              resto.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg">Cuenta</p>
            <div role="radiogroup" aria-label="Cuenta para la mezcla" className="grid grid-cols-2 gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={account === "demo"}
                onClick={() => pickAccount("demo")}
                className={`min-h-12 touch-manipulation rounded-2xl border px-3 text-sm font-medium transition-colors ${
                  account === "demo"
                    ? "border-brand/50 bg-brand-soft/60 text-brand"
                    : "border-border/80 bg-surface-1 text-fg hover:border-brand/30"
                }`}
              >
                Demo
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={account === "real"}
                aria-disabled={!realBuyEnabled}
                aria-describedby={realBuyEnabled ? undefined : realNoteId}
                onClick={() => pickAccount("real")}
                className={`min-h-12 touch-manipulation rounded-2xl border px-3 text-sm font-medium transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
                  account === "real"
                    ? "border-brand/50 bg-brand-soft/60 text-brand"
                    : "border-border/80 bg-surface-1 text-fg hover:border-brand/30"
                }`}
              >
                Dinero real
              </button>
            </div>
            {realBuyEnabled ? null : (
              <p id={realNoteId} className="text-xs leading-relaxed text-fg-muted">
                {COPY_REAL_DISABLED}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={spreadId} className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
              <input
                id={spreadId}
                type="checkbox"
                checked={noSpread}
                onChange={(event) => {
                  setNoSpread(event.target.checked);
                  resetPlan();
                }}
                className="mt-0.5 size-5 shrink-0 accent-brand"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-fg">No repartir: dejar en USDC lo no disponible</span>
                <span className="text-xs leading-relaxed text-fg-muted">
                  Si lo dejas sin marcar, el peso de lo que no está en Maverlang se reparte entre lo comprable.
                </span>
              </span>
            </label>
          </div>

          {partial ? (
            <p className="rounded-xl border border-warn/40 bg-warn-bg/60 px-3 py-2 text-xs leading-relaxed text-warn">
              Réplica parcial: esta cartera se puede copiar, pero solo una parte del portafolio original está disponible
              en Maverlang.
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-fg-muted tabular-nums">
            {account === "demo"
              ? "Hasta 25 órdenes por mezcla en demo."
              : "Hasta 10 órdenes por mezcla con dinero real."}
          </p>

          {error ? (
            <div role="alert" className="flex flex-col gap-2 rounded-xl border border-down/30 bg-down-bg/50 p-3">
              <p className="text-sm leading-relaxed text-down">{error}</p>
              {needsSubscription ? (
                <Button asChild variant="secondary" size="lg" className="min-h-12 w-full touch-manipulation">
                  <Link href="/app/copiar/planes">Ver planes</Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          <Button
            size="lg"
            className="min-h-12 w-full touch-manipulation text-base"
            loading={pending}
            disabled={pending}
            onClick={() => void armPlan()}
          >
            Armar mezcla
          </Button>
          <p className="text-center text-xs leading-relaxed text-fg-muted">{COPY_CTA_NOTE}</p>
        </div>
      )}
    </div>
  );
}
