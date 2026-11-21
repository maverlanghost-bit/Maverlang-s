"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

import { AllocationBar, type AllocationSlice } from "@/components/domain/allocation-bar";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconCheck, IconClose, IconSearch } from "@/components/ui/icons";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { ApiError, buildTrade, quoteTrade, submitTrade } from "@/lib/api/client";
import { ingresarPath } from "@/lib/auth/paths";
import { useSession } from "@/lib/auth/session-context";
import { signDemoTransaction } from "@/lib/auth/sign-transaction";
import { cn } from "@/lib/cn";
import { formatClp, formatShares, formatUsd } from "@/lib/format";
import { useFx, useMarketSearch, usePrices } from "@/lib/hooks/queries";
import { useAccountMode } from "@/lib/hooks/use-account-mode";

type MixLeg = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  pct: number;
};

type PresetBasket = {
  id: string;
  title: string;
  subtitle: string;
  legs: readonly MixLeg[];
};

const PRESET_BASKETS: readonly PresetBasket[] = [
  {
    id: "ai-giants",
    title: "Gigantes de IA",
    subtitle: "Semiconductores y nube",
    legs: [
      { symbol: "NVDAx", name: "NVIDIA", logoUrl: null, pct: 35 },
      { symbol: "MSFTx", name: "Microsoft", logoUrl: null, pct: 25 },
      { symbol: "GOOGLx", name: "Alphabet", logoUrl: null, pct: 20 },
      { symbol: "AVGOx", name: "Broadcom", logoUrl: null, pct: 20 },
    ],
  },
  {
    id: "mag-7-core",
    title: "Los 7 Magníficos Core",
    subtitle: "Tecnología de gran capitalización",
    legs: [
      { symbol: "AAPLx", name: "Apple", logoUrl: null, pct: 25 },
      { symbol: "MSFTx", name: "Microsoft", logoUrl: null, pct: 25 },
      { symbol: "NVDAx", name: "NVIDIA", logoUrl: null, pct: 25 },
      { symbol: "AMZNx", name: "Amazon", logoUrl: null, pct: 25 },
    ],
  },
  {
    id: "global-etfs",
    title: "ETFs Globales",
    subtitle: "Índices y oro en partes balanceadas",
    legs: [
      { symbol: "SPYx", name: "SPDR S&P 500", logoUrl: null, pct: 50 },
      { symbol: "QQQx", name: "Invesco QQQ", logoUrl: null, pct: 30 },
      { symbol: "GLDx", name: "SPDR Gold Shares", logoUrl: null, pct: 20 },
    ],
  },
  {
    id: "crypto-blockchain",
    title: "Cripto & Blockchain",
    subtitle: "Exposición bursátil al ecosistema cripto",
    legs: [
      { symbol: "MSTRx", name: "Strategy", logoUrl: null, pct: 35 },
      { symbol: "COINx", name: "Coinbase", logoUrl: null, pct: 35 },
      { symbol: "HOODx", name: "Robinhood", logoUrl: null, pct: 30 },
    ],
  },
];

const AMOUNT_PRESETS = [50, 100, 250, 500] as const;
const SLICE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"] as const;
const MIN_LEGS = 2;
const MAX_LEGS = 6;
const DEMO_FALLBACK_PUBKEY = "Demo1111111111111111111111111111111111111111";

type LegExecutionStatus = "pending" | "quoting" | "signing" | "submitting" | "done" | "error";

type LegExecutionState = {
  symbol: string;
  usd: number;
  status: LegExecutionStatus;
  error?: string;
  orderId?: string;
};

function statusLabel(status: LegExecutionStatus): string {
  switch (status) {
    case "pending":
      return "En espera";
    case "quoting":
      return "Cotizando…";
    case "signing":
      return "Firmando en Demo…";
    case "submitting":
      return "Enviando orden…";
    case "done":
      return "Ejecutada";
    case "error":
      return "Falló";
  }
}

export function MixBuilderScreen({ sections }: { sections?: ReactNode }) {
  const session = useSession();
  const accountMode = useAccountMode();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [legs, setLegs] = useState<MixLeg[]>(() => [...PRESET_BASKETS[0].legs]);
  const [amountInput, setAmountInput] = useState<string>("100");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [executing, setExecuting] = useState<boolean>(false);
  const [executionLog, setExecutionLog] = useState<LegExecutionState[] | null>(null);

  const legSymbols = legs.map((leg) => leg.symbol);
  const pricesQuery = usePrices(legSymbols, legSymbols.length > 0);
  const fxQuery = useFx();
  const searchResults = useMarketSearch(
    { q: searchQuery.trim(), pageSize: 8, scope: "listed", sort: "liquidity" },
    searchQuery.trim().length > 0,
  );

  const parsedAmount = Number(amountInput);
  const amountUsd = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  const totalPct = legs.reduce((sum, leg) => sum + leg.pct, 0);
  const isPctValid = totalPct === 100;
  const isCountValid = legs.length >= MIN_LEGS && legs.length <= MAX_LEGS;
  const canExecuteMix = isPctValid && isCountValid && amountUsd > 0 && !executing;

  const priceBySymbol = new Map<string, number>();
  for (const quote of pricesQuery.data ?? []) {
    priceBySymbol.set(quote.symbol, quote.priceUsd);
  }

  const fxRate = fxQuery.data?.rate ?? null;
  const amountClp = fxRate !== null && amountUsd > 0 ? Math.round(amountUsd * fxRate) : null;

  const slices: AllocationSlice[] = legs.map((leg, index) => {
    const legUsd = (amountUsd * leg.pct) / 100;
    return {
      key: leg.symbol,
      label: `${leg.symbol} · ${leg.name}`,
      pct: leg.pct / 100,
      valueLabel: formatUsd(legUsd),
      color: SLICE_COLORS[index % SLICE_COLORS.length],
    };
  });

  const assistantPrompt = `Analiza este mix de inversión de ${formatUsd(amountUsd)}: ${legs
    .map((leg) => `${leg.symbol} (${leg.pct}%)`)
    .join(", ")}. ¿Qué opinas de su diversificación, concentración sectorial y riesgos?`;

  function applyPreset(preset: PresetBasket) {
    if (executing) return;
    setLegs(preset.legs.map((leg) => ({ ...leg })));
    setExecutionLog(null);
  }

  function distributeEqually() {
    if (executing || legs.length === 0) return;
    const base = Math.floor(100 / legs.length);
    const remainder = 100 % legs.length;
    setLegs((prev) =>
      prev.map((leg, index) => ({
        ...leg,
        pct: base + (index < remainder ? 1 : 0),
      })),
    );
  }

  function updateLegPct(symbol: string, rawValue: number) {
    if (executing) return;
    const clamped = Number.isFinite(rawValue) ? Math.max(0, Math.min(100, Math.round(rawValue))) : 0;
    setLegs((prev) => prev.map((leg) => (leg.symbol === symbol ? { ...leg, pct: clamped } : leg)));
  }

  function removeLeg(symbol: string) {
    if (executing) return;
    setLegs((prev) => prev.filter((leg) => leg.symbol !== symbol));
  }

  function addLeg(item: { symbol: string; name: string; logoUrl: string | null }) {
    if (executing) return;
    if (legs.length >= MAX_LEGS) {
      toast({ title: `Máximo ${MAX_LEGS} activos por mix`, tone: "warn" });
      return;
    }
    if (legs.some((leg) => leg.symbol === item.symbol)) return;
    setLegs((prev) => [...prev, { symbol: item.symbol, name: item.name, logoUrl: item.logoUrl, pct: 0 }]);
    setSearchQuery("");
  }

  async function executeDemoMix() {
    if (!canExecuteMix || session.status !== "authenticated" || accountMode.mode === "real") return;
    const activeLegs = legs.filter((leg) => leg.pct > 0);
    if (activeLegs.length === 0) return;

    const wallet = session.user?.walletAddress?.trim() ?? "";
    const pubkey = wallet.length >= 32 ? wallet : DEMO_FALLBACK_PUBKEY;

    setExecuting(true);
    const initialLog: LegExecutionState[] = activeLegs.map((leg) => ({
      symbol: leg.symbol,
      usd: Number(((amountUsd * leg.pct) / 100).toFixed(2)),
      status: "pending",
    }));
    setExecutionLog(initialLog);

    let successCount = 0;

    for (let index = 0; index < activeLegs.length; index += 1) {
      const leg = activeLegs[index];
      const legUsd = Number(((amountUsd * leg.pct) / 100).toFixed(2));

      setExecutionLog((prev) =>
        prev ? prev.map((entry, idx) => (idx === index ? { ...entry, status: "quoting" } : entry)) : prev,
      );

      try {
        const quote = await quoteTrade({
          side: "buy",
          symbol: leg.symbol,
          amount: legUsd,
          amountCurrency: "USDC",
          userPublicKey: pubkey,
        });

        setExecutionLog((prev) =>
          prev ? prev.map((entry, idx) => (idx === index ? { ...entry, status: "signing" } : entry)) : prev,
        );

        const built = await buildTrade({
          quoteId: quote.id,
          userPublicKey: pubkey,
        });

        const signed = await signDemoTransaction(built.transactionBase64);

        setExecutionLog((prev) =>
          prev ? prev.map((entry, idx) => (idx === index ? { ...entry, status: "submitting" } : entry)) : prev,
        );

        const submitted = await submitTrade({
          requestId: built.requestId,
          signedTransactionBase64: signed,
        });

        if (submitted.status === "failed" || submitted.status === "expired") {
          throw new ApiError("UPSTREAM", "La orden no se pudo completar.");
        }

        successCount += 1;
        setExecutionLog((prev) =>
          prev
            ? prev.map((entry, idx) =>
                idx === index ? { ...entry, status: "done", orderId: submitted.orderId } : entry,
              )
            : prev,
        );
      } catch (caught) {
        const message =
          caught instanceof ApiError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : "No pudimos ejecutar esta pierna.";
        setExecutionLog((prev) =>
          prev
            ? prev.map((entry, idx) =>
                idx === index ? { ...entry, status: "error", error: message } : entry,
              )
            : prev,
        );
      }
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
      queryClient.invalidateQueries({ queryKey: ["balances"] }),
      queryClient.invalidateQueries({ queryKey: ["activity"] }),
    ]);

    if (successCount === activeLegs.length) {
      toast({ title: "Mix ejecutado en Demo", description: `${successCount} órdenes confirmadas.`, tone: "up" });
    } else if (successCount > 0) {
      toast({
        title: "Mix ejecutado parcialmente",
        description: `${successCount} de ${activeLegs.length} órdenes confirmadas.`,
        tone: "warn",
      });
    } else {
      toast({ title: "No pudimos ejecutar el mix", tone: "down" });
    }

    setExecuting(false);
  }

  const availableSearchItems = (searchResults.data?.items ?? []).filter(
    (item) => item.tradable && !legs.some((leg) => leg.symbol === item.symbol),
  );

  const isDemoMode = accountMode.mode !== "real";
  const allLegsDone = executionLog !== null && executionLog.every((entry) => entry.status === "done");
  const hasAnyExecutionDone = executionLog !== null && executionLog.some((entry) => entry.status === "done");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Armar Mix"
        description="Combina entre 2 y 6 acciones en una canasta a tu medida, ajusta los porcentajes y ejecútala en tu Cuenta Demo."
        action={
          <Button asChild variant="secondary" size="md">
            <Link href={`/app/asistente?q=${encodeURIComponent(assistantPrompt)}`}>
              <SparklesIcon className="size-4" />
              Analizar mix con Asistente IA
            </Link>
          </Button>
        }
      />

      {sections}

      {/* Canastas prearmadas */}
      <section className="flex flex-col gap-3" aria-labelledby="mix-presets-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="mix-presets-heading" className="text-sm font-medium text-fg">
            Canastas prearmadas en 1 clic
          </h2>
          <span className="text-xs text-fg-muted">Puedes editarlas después</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRESET_BASKETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={executing}
              onClick={() => applyPreset(preset)}
              className="flex min-h-24 flex-col justify-between gap-2 rounded-2xl border border-border bg-bg p-4 text-left transition-colors hover:border-fg/40 hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none disabled:opacity-50"
            >
              <div>
                <p className="text-sm font-medium text-fg">{preset.title}</p>
                <p className="mt-0.5 text-xs text-fg-muted">{preset.subtitle}</p>
              </div>
              <p className="text-xs text-fg-muted tabular-nums">
                {preset.legs.map((leg) => `${leg.symbol.replace(/x$/i, "")} ${leg.pct}%`).join(" · ")}
              </p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)] lg:items-start">
        {/* Columna izquierda: buscador y ponderaciones */}
        <section className="flex min-w-0 flex-col gap-5 rounded-3xl border border-border bg-bg p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-medium text-fg">
                Activos del mix ({legs.length}/{MAX_LEGS})
              </h2>
              <p className="text-xs text-fg-muted">
                Mínimo {MIN_LEGS} y máximo {MAX_LEGS} acciones. La suma debe dar 100 %.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={executing || legs.length === 0}
              onClick={distributeEqually}
            >
              Repartir en partes iguales
            </Button>
          </div>

          {/* Buscador para agregar activos */}
          <div className="relative flex flex-col gap-2">
            <label htmlFor="mix-asset-search" className="sr-only">
              Buscar acción para agregar al mix
            </label>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-muted" />
              <Input
                id="mix-asset-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={
                  legs.length >= MAX_LEGS
                    ? `Máximo ${MAX_LEGS} activos alcanzado`
                    : "Buscar acción para agregar (ej. TSLAx, METAx, SPYx)…"
                }
                disabled={executing || legs.length >= MAX_LEGS}
                className="pl-10"
              />
            </div>

            {searchQuery.trim().length > 0 ? (
              <div className="rounded-2xl border border-border bg-bg p-1.5 shadow-sm">
                {searchResults.isPending ? (
                  <p className="px-3 py-2 text-xs text-fg-muted">Buscando en el catálogo…</p>
                ) : availableSearchItems.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-fg-muted">
                    No encontramos más acciones disponibles para &ldquo;{searchQuery.trim()}&rdquo;.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {availableSearchItems.map((item) => (
                      <li key={item.symbol}>
                        <button
                          type="button"
                          onClick={() => addLeg({ symbol: item.symbol, name: item.name, logoUrl: item.logoUrl })}
                          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-1"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <TickerLogo symbol={item.symbol} name={item.name} logoUrl={item.logoUrl} size={28} decorative />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-fg">{item.symbol}</span>
                              <span className="block truncate text-xs text-fg-muted">{item.name}</span>
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-fg">
                            <PlusIcon className="size-3.5" />
                            Agregar
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          {/* Lista de piernas */}
          {legs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">
              Agrega al menos {MIN_LEGS} acciones desde el buscador o elige una canasta prearmada arriba.
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {legs.map((leg, index) => {
                const spotPrice = priceBySymbol.get(leg.symbol) ?? null;
                const legUsd = (amountUsd * leg.pct) / 100;
                const estShares = spotPrice && spotPrice > 0 && legUsd > 0 ? legUsd / spotPrice : null;
                const color = SLICE_COLORS[index % SLICE_COLORS.length];

                return (
                  <li key={leg.symbol} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden="true"
                        />
                        <TickerLogo symbol={leg.symbol} name={leg.name} logoUrl={leg.logoUrl} size={32} decorative />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg">{leg.symbol}</p>
                          <p className="truncate text-xs text-fg-muted">{leg.name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-sm font-medium text-fg tabular-nums">{formatUsd(legUsd)}</p>
                          <p className="text-xs text-fg-muted tabular-nums">
                            {estShares !== null ? `~${formatShares(estShares)}` : "Precio cargando…"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={executing}
                          onClick={() => removeLeg(leg.symbol)}
                          aria-label={`Quitar ${leg.symbol} del mix`}
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                        >
                          <IconClose className="size-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        disabled={executing}
                        value={leg.pct}
                        aria-label={`Porcentaje para ${leg.symbol}`}
                        onChange={(event) => updateLegPct(leg.symbol, Number(event.target.value))}
                        className="h-2 w-full cursor-pointer accent-fg disabled:opacity-50"
                      />
                      <div className="flex w-22 shrink-0 items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          disabled={executing}
                          value={leg.pct}
                          aria-label={`Porcentaje numérico para ${leg.symbol}`}
                          onChange={(event) => updateLegPct(leg.symbol, Number(event.target.value))}
                          className="h-9 px-2 text-right text-sm tabular-nums"
                        />
                        <span className="text-xs font-medium text-fg-muted">%</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Validación de suma 100% */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm",
              isPctValid && isCountValid
                ? "border-up/30 bg-up-bg/50 text-fg"
                : "border-warn/40 bg-warn-bg/50 text-fg",
            )}
          >
            <span className="font-medium">
              {!isCountValid
                ? `Selecciona entre ${MIN_LEGS} y ${MAX_LEGS} activos (tienes ${legs.length}).`
                : isPctValid
                  ? "Distribución lista: suma exactamente 100 %."
                  : `La suma actual es ${totalPct} %. Ajusta los porcentajes para llegar a 100 %.`}
            </span>
            <Badge tone={isPctValid && isCountValid ? "up" : "warn"} className="tabular-nums">
              Total: {totalPct} %
            </Badge>
          </div>
        </section>

        {/* Columna derecha: monto, AllocationBar y ejecución */}
        <aside className="flex min-w-0 flex-col gap-5 rounded-3xl border border-border bg-bg p-5 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="mix-total-usd" className="text-sm font-medium text-fg">
                Monto total a invertir (USD)
              </label>
              {amountClp !== null ? (
                <span className="text-xs text-fg-muted tabular-nums">≈ {formatClp(amountClp)} CLP</span>
              ) : null}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {AMOUNT_PRESETS.map((preset) => {
                const selected = amountUsd === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={executing}
                    onClick={() => setAmountInput(String(preset))}
                    className={cn(
                      "min-h-10 rounded-full border text-sm font-medium tabular-nums transition-colors",
                      selected
                        ? "border-fg bg-fg text-white"
                        : "border-border bg-bg text-fg hover:bg-surface-1",
                    )}
                  >
                    ${preset}
                  </button>
                );
              })}
            </div>

            <Input
              id="mix-total-usd"
              type="number"
              min={1}
              step="any"
              disabled={executing}
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder="Ej. 150"
              className="tabular-nums"
            />
          </div>

          {slices.length > 0 ? (
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium text-fg">Vista previa de tu canasta</p>
              <AllocationBar label="Distribución del mix" slices={slices} />
            </div>
          ) : null}

          {/* Acción de ejecución */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {session.status === "loading" ? (
              <Button type="button" size="lg" disabled className="w-full">
                Verificando sesión…
              </Button>
            ) : session.status !== "authenticated" ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-fg-muted">
                  Inicia sesión para ejecutar las compras de tu mix en tu Cuenta Demo.
                </p>
                <Button asChild size="lg" className="w-full">
                  <Link href={ingresarPath("/app/mix")}>Iniciar sesión para ejecutar en Demo</Link>
                </Button>
              </div>
            ) : !isDemoMode ? (
              <div className="rounded-2xl border border-warn/40 bg-warn-bg/50 p-4 text-xs leading-relaxed text-fg">
                La ejecución automática múltiple está disponible sólo en <strong>Cuenta Demo</strong>. Cambia a Cuenta
                Demo desde el menú superior o ejecuta cada compra individualmente.
              </div>
            ) : (
              <Button
                type="button"
                size="lg"
                loading={executing}
                disabled={!canExecuteMix}
                onClick={() => void executeDemoMix()}
                className="w-full"
              >
                {executing ? "Ejecutando Mix en Demo…" : "Ejecutar Mix en Demo"}
              </Button>
            )}

            {executionLog ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-1 p-4">
                <p className="text-xs font-medium text-fg">Progreso de órdenes en Cuenta Demo</p>
                <ul className="flex flex-col gap-2">
                  {executionLog.map((entry) => (
                    <li key={entry.symbol} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="font-medium text-fg">{entry.symbol}</span>{" "}
                        <span className="text-fg-muted tabular-nums">({formatUsd(entry.usd)})</span>
                        {entry.error ? <p className="mt-0.5 text-down">{entry.error}</p> : null}
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 font-medium",
                          entry.status === "done"
                            ? "text-up"
                            : entry.status === "error"
                              ? "text-down"
                              : "text-fg-muted",
                        )}
                      >
                        {entry.status === "done" ? <IconCheck className="size-3.5" /> : null}
                        {statusLabel(entry.status)}
                      </span>
                    </li>
                  ))}
                </ul>

                {!executing && hasAnyExecutionDone ? (
                  <Button asChild variant={allLegsDone ? "primary" : "secondary"} size="sm" className="mt-2 w-full">
                    <Link href="/app/cartera">Ver posiciones en Cartera</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
