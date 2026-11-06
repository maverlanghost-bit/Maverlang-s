"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { formatShares } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { Activity, ActivityKind, Currency, OrderStatus } from "@/lib/types";

/** Cabecera fija: el archivo se abre en Excel y ordena la cartola por columnas. */
const CSV_HEADER = ["Fecha", "Tipo", "Activo", "Cantidad", "Valor USD", "Valor CLP", "Estado", "Tx Hash"] as const;

/** Suscripción vacía: sólo marca «hidratado», no hay store externo que escuchar. */
const subscribeNoop = () => () => {};

const KIND_LABEL: Record<ActivityKind, { es: string; en: string }> = {
  buy: { es: "Compra", en: "Buy" },
  sell: { es: "Venta", en: "Sell" },
  deposit: { es: "Depósito", en: "Deposit" },
  withdraw: { es: "Retiro", en: "Withdrawal" },
  send: { es: "Envío", en: "Send" },
  receive: { es: "Recepción", en: "Receive" },
  onramp: { es: "Compra con pesos", en: "Cash on-ramp" },
};

const STATUS_LABEL: Record<OrderStatus, { es: string; en: string }> = {
  pending: { es: "Pendiente", en: "Pending" },
  submitted: { es: "En proceso", en: "Submitted" },
  confirmed: { es: "Confirmada", en: "Confirmed" },
  failed: { es: "Fallida", en: "Failed" },
  expired: { es: "Expirada", en: "Expired" },
};

const usdNumber = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clpNumber = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const santiagoDate = new Intl.DateTimeFormat("es-CL", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Santiago",
});
const fileDate = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Santiago",
});

type DatePart = "day" | "month" | "year" | "hour" | "minute";

/** dd-mm-aaaa hh:mm en hora de Chile; si el ISO viene roto, deja el valor crudo. */
function csvDate(input: string): string {
  const time = Date.parse(input);
  if (Number.isNaN(time)) return input;
  const parts = santiagoDate.formatToParts(time);
  const pick = (type: DatePart) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")}-${pick("month")}-${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

/** Comillas dobles duplicadas y comillas envolventes cuando el campo trae coma o salto. */
function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(rows: readonly Activity[], fxRate: number | undefined, lang: "es-CL" | "en"): string {
  const isEn = lang === "en";
  const rate = typeof fxRate === "number" && Number.isFinite(fxRate) && fxRate > 0 ? fxRate : undefined;
  const label = <T extends string>(map: Record<T, { es: string; en: string }>, key: T) => (isEn ? map[key].en : map[key].es);

  const lines = [CSV_HEADER.map(csvField).join(",")];

  for (const row of rows) {
    const shares = formatShares(row.amountUi).replace(/\s*acc\.$/, "");
    const clp = row.valueUsd !== null && rate !== undefined ? clpNumber.format(Math.round(row.valueUsd * rate)) : "";
    const cells = [
      csvDate(row.at),
      label(KIND_LABEL, row.kind),
      row.symbol,
      shares,
      row.valueUsd !== null ? usdNumber.format(row.valueUsd) : "",
      clp,
      label(STATUS_LABEL, row.status),
      row.signature ?? "",
    ];
    lines.push(cells.map(csvField).join(","));
  }

  // BOM para que Excel detecte UTF-8; CRLF para que respete los saltos de línea.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function CsvExportButton({
  rows,
  currency,
  fxRate,
}: {
  rows: readonly Activity[];
  currency: Currency;
  fxRate?: number;
}) {
  const { language } = useT();
  // Guarda SSR: en el servidor no hay `document` ni `URL.createObjectURL`.
  // `useSyncExternalStore` devuelve false en el servidor y true al hidratar,
  // sin setState dentro de un efecto.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const canExport = mounted && typeof document !== "undefined" && rows.length > 0;
  // Ayuda de hover: aclara qué representa la columna en pesos sin prometer conversión si falta el tipo de cambio.
  const hint =
    language === "en"
      ? "CSV with one row per movement; the CLP column uses the current exchange rate and stays empty if unavailable."
      : currency === "CLP"
        ? "CSV con un movimiento por fila; la columna en pesos usa el tipo de cambio vigente."
        : "CSV con un movimiento por fila; la columna en pesos queda vacía si no hay tipo de cambio.";

  function handleExport() {
    if (!canExport) return;

    const csv = buildCsv(rows, fxRate, language);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `maverlang-cartola-${fileDate.format(Date.now())}.csv`;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Diferido: algunos navegadores cancelan la descarga si se revoca de inmediato.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="text-xs"
      disabled={!canExport}
      onClick={handleExport}
      title={hint}
    >
      <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4v10m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="num">{language === "en" ? "Export CSV" : "Exportar CSV"}</span>
    </Button>
  );
}
