import "server-only";

import { MIN_TRADE_USD } from "@/config/trade";
import { DomainError } from "@/lib/api/result";
import { mapPositions, type MappedPosition } from "@/lib/copy/mapping";
import { COPYABLE_FAMILIES, type CopyFamily, type CopyPortfolio } from "@/lib/copy/types";

/**
 * Plan de mezcla para copiar una cartera (F1, servidor).
 *
 * Reglas cerradas (decisión de Manu y §2.3 del diseño de Fraccion.si):
 *   - Redondeo en CENTAVOS con el método del mayor resto: la suma de las
 *     piernas es EXACTA al presupuesto asignado. No se crean ni se pierden
 *     centavos.
 *   - Mínimo US$1 por pierna (`MIN_TRADE_USD`). Si una pierna queda debajo, se
 *     descarta y su presupuesto se reparte entre las demás, repitiendo hasta
 *     que todas pasen el mínimo.
 *   - Máximo de piernas: 10 en cuenta real y 25 en demo. Se toman las de mayor
 *     peso; el resto deja de cubrirse y baja la cobertura mostrada.
 *   - Cobertura = peso DECLARADO por el feed que sí se compra. ≥60 % copia
 *     normal; 40–60 % aviso ámbar «Réplica parcial»; <40 % copiar desactivado
 *     («Esta cartera no se puede replicar bien en Maverlang») y el plan sale
 *     sin piernas, así el cliente no puede ejecutar nada.
 *   - `spreadUnavailable` (por defecto `true`, que es la opción principal del
 *     carrito): reparte lo no disponible proporcionalmente entre lo comprable.
 *     En `false` (opción secundaria «No repartir») cada pierna conserva su peso
 *     declarado y lo que no se cubre queda en USDC: `unavailableUsd`.
 *
 * El plan NO cobra ni ejecuta: sólo arma piernas con símbolos del catálogo. La
 * revisión de topes (`checkLimits`) y la ejecución viven en las rutas
 * existentes (`/api/copy/*`, `quote → build → submit`), que no se tocan acá.
 */

export type CopyAccount = "demo" | "real";

export interface CopyPlanLeg {
  /** Símbolo operable en Maverlang (`AAPLx`, `AAPLon`…). */
  symbol: string;
  /** Monto de la pierna en dólares, múltiplo exacto de un centavo. */
  usd: number;
  /** Peso declarado por el feed (0–100), sin tocar. */
  weightOriginal: number;
  /** Peso efectivo de la pierna dentro de la mezcla que se compra (0–100). */
  weightMaverlang: number;
}

export interface CopyPlan {
  legs: CopyPlanLeg[];
  /** Peso declarado cubierto por las piernas, 0–100. */
  coveragePct: number;
  /** Dólares que no se compran (quedan en USDC o simplemente no se cubren). */
  unavailableUsd: number;
  /** Avisos en español de Chile, listos para mostrar. */
  warnings: string[];
  /** Tope de piernas aplicado (10 real / 25 demo). */
  maxLegs: number;
}

export interface BuildCopyPlanInput {
  portfolio: CopyPortfolio;
  totalUsd: number;
  account: CopyAccount;
  /** Opcional por contrato: omitido = repartir (opción principal). */
  spreadUnavailable?: boolean;
  /** Sólo pruebas o llamadas internas: posiciones ya mapeadas. */
  mapped?: readonly MappedPosition[];
  /** Sólo pruebas: inyecta fetch/reloj al catálogo. */
  deps?: { fetchImpl?: typeof fetch; now?: () => number };
}

/** Mínimo por pierna: el mismo de una orden (US$1). */
export const COPY_MIN_LEG_CENTS = Math.round(MIN_TRADE_USD * 100);
/** Máximo de piernas en cuenta real: más órdenes son más firmas y comisiones. */
export const COPY_MAX_LEGS_REAL = 10;
/** Máximo de piernas en demo: permite probar carteras más largas. */
export const COPY_MAX_LEGS_DEMO = 25;
/** Sobre este porcentaje la réplica es normal. */
export const COPY_COVERAGE_FULL_PCT = 60;
/** Bajo este porcentaje copiar se desactiva. */
export const COPY_COVERAGE_MIN_PCT = 40;

/** Familias copiables de verdad: 13F y ETFs. El resto es sólo para mirar. */
const COPYABLE_SET: ReadonlySet<string> = new Set<string>(COPYABLE_FAMILIES);

const WARNING = {
  onlyLook: "Esta cartera es sólo para mirar: no se copia en Maverlang.",
  tooLow:
    "Esta cartera no se puede replicar bien en Maverlang: la cobertura es del {pct} %.",
  partial: "Réplica parcial: replicas el {pct} % del portafolio declarado.",
  trimmed: "Se copian las {legs} posiciones de mayor peso: el {pct} % del portafolio declarado.",
  nothing: "Con este monto no alcanza para una pierna de US$1. Sube el monto de la mezcla.",
  usdc: "Lo que no se puede comprar queda en USDC: no se reparte.",
} as const;

/** «Se descartó 1 pierna…» / «Se descartaron 3 piernas…», sin ruido gramatical. */
function droppedWarning(count: number): string {
  if (count === 1) {
    return "Se descartó 1 pierna de menos de US$1: no alcanzaba el mínimo por pierna.";
  }
  return `Se descartaron ${count} piernas de menos de US$1: no alcanzaba el mínimo por pierna.`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Porcentaje con coma decimal (es-CL), sin depender del ICU del entorno. */
function pctText(value: number): string {
  return String(round(value, 1)).replace(".", ",");
}

function sumWeights(rows: readonly Pick<MappedPosition, "weightOriginal">[]): number {
  return rows.reduce((sum, row) => sum + row.weightOriginal, 0);
}

/**
 * Mayor resto: reparte `totalCents` centavos proporcionalmente a `weights` y
 * devuelve centavos enteros cuya suma es EXACTAMENTE `totalCents`.
 * Pesos negativos, NaN o Infinity cuentan como 0. Si no hay ningún peso
 * positivo, reparte en partes iguales (para no perder centavos); si no hay
 * filas, devuelve `[]` y el presupuesto queda sin asignar.
 */
export function allocateCents(weights: readonly number[], totalCents: number): number[] {
  const cents = Math.trunc(totalCents);
  if (!Number.isFinite(cents) || cents < 0) throw new DomainError("VALIDATION");
  const count = weights.length;
  if (count === 0) return [];
  if (cents === 0) return new Array<number>(count).fill(0);

  const clean = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0,
  );
  const totalWeight = clean.reduce((sum, weight) => sum + weight, 0);
  // Sin pesos útiles: partes iguales (el reparto sigue siendo exacto).
  const effective = totalWeight > 0 ? clean : new Array<number>(count).fill(1);
  const effectiveWeight = totalWeight > 0 ? totalWeight : count;

  const exact = effective.map((weight) => (weight * cents) / effectiveWeight);
  const out = exact.map((value) => Math.floor(value));
  let remainder = cents - out.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  let cursor = 0;
  while (remainder > 0) {
    out[order[cursor % count].index] += 1;
    cursor += 1;
    remainder -= 1;
  }
  return out;
}

/**
 * Reparte con mínimo por pierna: las que quedan bajo `minCents` se descartan y
 * su presupuesto se reparte de nuevo entre las que quedan, iterando hasta que
 * todas pasen el mínimo (o no quede ninguna). Devuelve un arreglo del mismo
 * largo que `weights`, con 0 en las descartadas.
 */
function allocateWithMinimum(
  weights: readonly number[],
  budgetCents: number,
  minCents: number,
): number[] {
  const result = new Array<number>(weights.length).fill(0);
  let active: number[] = weights.map((_, index) => index);
  for (;;) {
    if (active.length === 0) return result;
    const allocation = allocateCents(
      active.map((index) => weights[index]),
      budgetCents,
    );
    const under = allocation
      .map((cents, position) => ({ position, cents }))
      .filter((entry) => entry.cents < minCents);
    if (under.length === 0) {
      active.forEach((index, position) => {
        result[index] = allocation[position];
      });
      return result;
    }
    const drop = new Set(under.map((entry) => active[entry.position]));
    active = active.filter((index) => !drop.has(index));
  }
}

/**
 * Arma el plan de mezcla. Lanza `DomainError("VALIDATION")` sólo con entradas
 * imposibles (monto no positivo o cuenta desconocida); cualquier otra
 * situación se resuelve con piernas vacías, cobertura y avisos.
 */
export async function buildCopyPlan(input: BuildCopyPlanInput): Promise<CopyPlan> {
  const account = input.account;
  if (account !== "demo" && account !== "real") throw new DomainError("VALIDATION");
  const totalUsd = Number(input.totalUsd);
  if (!Number.isFinite(totalUsd) || totalUsd <= 0) throw new DomainError("VALIDATION");
  const totalCents = Math.round(totalUsd * 100);
  if (totalCents < 1) throw new DomainError("VALIDATION");

  const maxLegs = account === "real" ? COPY_MAX_LEGS_REAL : COPY_MAX_LEGS_DEMO;
  // Por defecto se reparte (decisión de Manu). Omitirlo NO deja la mezcla en USDC.
  const spread = input.spreadUnavailable ?? true;
  const warnings: string[] = [];

  const portfolio = input.portfolio;
  const family: CopyFamily | undefined = portfolio.portfolio?.family;
  const mapped =
    input.mapped ??
    (await mapPositions(portfolio.positions ?? [], { family, deps: input.deps }));

  // Las familias sólo-informativas (corredoras CL, AFP, temáticas) no se copian.
  if (family !== undefined && !COPYABLE_SET.has(family)) {
    return {
      legs: [],
      coveragePct: 0,
      unavailableUsd: round(totalCents / 100, 2),
      warnings: [WARNING.onlyLook],
      maxLegs,
    };
  }

  const declaredWeight = sumWeights(mapped);
  const symbolOf = (row: MappedPosition): string => row.tradableSymbol ?? row.symbol;
  const buyable = mapped
    .filter(
      (row) =>
        row.status === "available" && row.tradableSymbol !== null && row.weightOriginal > 0,
    )
    .sort(
      (left, right) =>
        right.weightOriginal - left.weightOriginal ||
        symbolOf(left).localeCompare(symbolOf(right)),
    );

  const kept = buyable.slice(0, maxLegs);
  const keptWeight = sumWeights(kept);
  const coveragePct =
    declaredWeight > 0 ? round(Math.min(100, (keptWeight / declaredWeight) * 100), 1) : 0;

  if (buyable.length > kept.length) {
    warnings.push(
      WARNING.trimmed
        .replace("{legs}", String(kept.length))
        .replace("{pct}", pctText(coveragePct)),
    );
  }

  // Bajo 40 % no se copia: se devuelve el plan sin piernas para que ninguna
  // ruta pueda ejecutar nada, con el motivo visible.
  if (kept.length === 0 || coveragePct < COPY_COVERAGE_MIN_PCT) {
    warnings.push(WARNING.tooLow.replace("{pct}", pctText(coveragePct)));
    return {
      legs: [],
      coveragePct,
      unavailableUsd: round(totalCents / 100, 2),
      warnings,
      maxLegs,
    };
  }
  if (coveragePct < COPY_COVERAGE_FULL_PCT) {
    warnings.push(WARNING.partial.replace("{pct}", pctText(coveragePct)));
  }

  const weights = kept.map((row) => row.weightOriginal);
  // Con «No repartir» sólo se asigna la parte declarada de las piernas; el
  // resto del monto queda en USDC. Con reparto se asigna todo el presupuesto.
  const budgetCents = spread
    ? totalCents
    : Math.min(
        totalCents,
        Math.round((totalCents * keptWeight) / (declaredWeight > 0 ? declaredWeight : keptWeight)),
      );

  const cents = allocateWithMinimum(weights, budgetCents, COPY_MIN_LEG_CENTS);
  // Sólo cuentan las piernas que de verdad se compran (las descartadas quedan en 0).
  const legsTotalCents = cents.reduce(
    (sum, value) => sum + (value >= COPY_MIN_LEG_CENTS ? value : 0),
    0,
  );

  const legs: CopyPlanLeg[] = [];
  kept.forEach((row, index) => {
    const value = cents[index];
    if (value < COPY_MIN_LEG_CENTS) return;
    legs.push({
      symbol: row.tradableSymbol ?? row.symbol,
      usd: round(value / 100, 2),
      weightOriginal: round(row.weightOriginal, 2),
      weightMaverlang: legsTotalCents > 0 ? round((value / legsTotalCents) * 100, 2) : 0,
    });
  });

  const droppedByMinimum = kept.length - legs.length;
  if (droppedByMinimum > 0) {
    warnings.push(droppedWarning(droppedByMinimum));
  }
  if (legs.length === 0) warnings.push(WARNING.nothing);

  const unavailableUsd = round((totalCents - legsTotalCents) / 100, 2);
  if (!spread && unavailableUsd > 0) warnings.push(WARNING.usdc);

  return { legs, coveragePct, unavailableUsd, warnings, maxLegs };
}
