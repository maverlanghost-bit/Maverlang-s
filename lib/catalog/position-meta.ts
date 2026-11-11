import { cryptoBySymbol, type CryptoAsset } from "@/lib/catalog/crypto";
import { lstBySymbol, type LstAsset } from "@/lib/catalog/lst";

/**
 * Identidad de una posición de la cartera para símbolos que no son acciones
 * (C1). La cartera nombra sus filas con `useTickers` (catálogo de acciones),
 * que no conoce las criptos ni los LST: una posición asentada por `demo_trade`
 * con símbolo `BTC` o `JitoSOL` se vería con el símbolo crudo. Este módulo
 * resuelve primero los catálogos propios (K1/K2) y devuelve `null` para todo
 * lo demás, para que el llamador siga con su mapa de acciones.
 *
 * Módulo puro, sin I/O: se puede importar desde el servidor y desde un
 * componente cliente. No lleva `server-only` ni lee variables de entorno.
 */

export type PositionKind = "stock" | "crypto" | "lst";
export type PositionSeal = "VERDE" | "AMARILLO";

export interface PositionMeta {
  name: string;
  /** `crypto` = catálogo K1; `lst` = catálogo K2 (LST o USDY). */
  kind: PositionKind;
  /** Sello del catálogo K1. Los LST no tienen sello propio. */
  seal?: PositionSeal;
}

type NamedAsset = { symbol: string; name: string };

function isNamedAsset(value: unknown): value is NamedAsset {
  if (!value || typeof value !== "object") return false;
  const row = value as { symbol?: unknown; name?: unknown };
  return typeof row.symbol === "string" && typeof row.name === "string";
}

/**
 * Busca un activo por símbolo en un índice del catálogo. El contrato fija el
 * nombre del índice (`cryptoBySymbol` / `lstBySymbol`), no su forma: se acepta
 * `Map`, registro o función, siempre comparando sin distinguir mayúsculas
 * (`btc` → `BTC`, `usde` → `USDe`).
 */
function findInCatalog<T extends NamedAsset>(index: unknown, symbol: string): T | null {
  const wanted = symbol.trim().toLowerCase();
  if (!wanted) return null;

  if (index instanceof Map) {
    for (const [key, value] of index as ReadonlyMap<string, unknown>) {
      if (typeof key === "string" && key.toLowerCase() === wanted && isNamedAsset(value)) {
        return value as T;
      }
    }
    return null;
  }

  if (typeof index === "function") {
    const lookup = index as (input: string) => unknown;
    for (const input of [symbol.trim(), symbol.trim().toUpperCase()]) {
      try {
        const hit = lookup(input);
        if (isNamedAsset(hit)) return hit as T;
      } catch {
        return null;
      }
    }
    return null;
  }

  if (index && typeof index === "object") {
    for (const [key, value] of Object.entries(index as Record<string, unknown>)) {
      if (key.toLowerCase() === wanted && isNamedAsset(value)) return value as T;
    }
  }

  return null;
}

/**
 * Nombre, tipo y sello de un símbolo cripto/LST. `null` si no está en K1/K2
 * (acciones y símbolos desconocidos): ahí manda el mapa de acciones del
 * llamador.
 */
export function positionMeta(symbol: string): PositionMeta | null {
  const crypto = findInCatalog<CryptoAsset>(cryptoBySymbol, symbol);
  if (crypto) return { name: crypto.name, kind: "crypto", seal: crypto.seal };

  const lst = findInCatalog<LstAsset>(lstBySymbol, symbol);
  if (lst) return { name: lst.name, kind: "lst" };

  return null;
}
