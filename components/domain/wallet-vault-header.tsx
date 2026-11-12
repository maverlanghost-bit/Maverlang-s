"use client";

export interface WalletVaultHeaderProps {
  solUi: number;
  lowSol: boolean;
  mode: "demo" | "real";
}

/** Tira superior de la bóveda: estado de autocustodia y reserva de SOL (Gas Tank). */
export function WalletVaultHeader({ solUi, lowSol, mode }: WalletVaultHeaderProps) {
  const bars = solUi <= 0 ? 0 : lowSol ? 1 : solUi < 0.02 ? 2 : solUi < 0.05 ? 3 : 4;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface-1 px-3.5 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-up" aria-hidden="true" />
        <span className="font-semibold text-fg">Bóveda Autocustodia · Solana SPL</span>
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs font-medium text-fg-muted">
          {mode === "real" ? "Cuenta real" : "Modo demo"}
        </span>
      </div>

      <div
        className="flex items-center gap-2"
        title="Reserva de SOL para comisiones de red en Solana"
      >
        <span className="text-fg-muted">Gas Tank SOL:</span>
        <span className="inline-flex items-center gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={
                level <= bars
                  ? lowSol
                    ? "h-3 w-1.5 rounded-xs bg-warn"
                    : "h-3 w-1.5 rounded-xs bg-up"
                  : "h-3 w-1.5 rounded-xs bg-surface-3"
              }
            />
          ))}
        </span>
        <span className={lowSol ? "font-semibold text-warn" : "font-medium text-fg"}>
          {lowSol ? "Bajo" : "Óptimo"}
        </span>
      </div>
    </div>
  );
}
