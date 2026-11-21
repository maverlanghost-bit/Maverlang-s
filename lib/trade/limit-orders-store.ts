"use client";

import { useMemo, useSyncExternalStore } from "react";

export type LimitOrderExpiry = "7d" | "30d" | "gtc";
export type LimitOrderStatus = "active" | "cancelled";

export interface LimitOrder {
  id: string;
  ownerId?: string;
  symbol: string;
  name: string;
  side: "buy" | "sell";
  amountUsd: number;
  targetPriceUsd: number;
  expiry: LimitOrderExpiry;
  status: LimitOrderStatus;
  createdAt: string;
}

export interface LimitOrdersStoreState {
  v: 1;
  limitOrders: LimitOrder[];
  // Conserva otros datos de borradores ya guardados con este esquema.
  dcaPlans: unknown[];
}

export type AddLimitOrderInput = {
  ownerId?: string;
  symbol: string;
  name: string;
  side: "buy" | "sell";
  amountUsd: number;
  targetPriceUsd: number;
  expiry: LimitOrderExpiry;
};

export const LIMIT_ORDERS_STORAGE_KEY = "maverlang_limit_orders_v1";
const STORE_EVENT = "maverlang-limit-orders-change";

const EMPTY_STATE: LimitOrdersStoreState = {
  v: 1,
  limitOrders: [],
  dcaPlans: [],
};

let cachedRaw: string | null | undefined;
let cachedState: LimitOrdersStoreState = EMPTY_STATE;
let memoryState: LimitOrdersStoreState = EMPTY_STATE;
const memoryListeners = new Set<() => void>();

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const MAX_STORED_ITEMS = 50;

function isValidLimitOrder(value: unknown): value is LimitOrder {
  if (!value || typeof value !== "object") return false;
  const o = value as Partial<LimitOrder>;
  return (
    typeof o.id === "string" &&
    o.id.trim().length > 0 &&
    o.id.length <= 64 &&
    (o.ownerId === undefined || (typeof o.ownerId === "string" && o.ownerId.length > 0 && o.ownerId.length <= 128)) &&
    typeof o.symbol === "string" &&
    o.symbol.trim().length > 0 &&
    o.symbol.length <= 24 &&
    typeof o.name === "string" &&
    o.name.length <= 120 &&
    (o.side === "buy" || o.side === "sell") &&
    typeof o.amountUsd === "number" &&
    Number.isFinite(o.amountUsd) &&
    o.amountUsd > 0 &&
    typeof o.targetPriceUsd === "number" &&
    Number.isFinite(o.targetPriceUsd) &&
    o.targetPriceUsd > 0 &&
    (o.expiry === "7d" || o.expiry === "30d" || o.expiry === "gtc") &&
    (o.status === "active" || o.status === "cancelled") &&
    typeof o.createdAt === "string" &&
    o.createdAt.length <= 40
  );
}

function parseState(raw: string | null): LimitOrdersStoreState {
  if (!raw) return EMPTY_STATE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_STATE;
    const record = parsed as { v?: unknown; limitOrders?: unknown; dcaPlans?: unknown };
    if (record.v !== 1) return EMPTY_STATE;
    const limitOrders = Array.isArray(record.limitOrders)
      ? record.limitOrders.filter(isValidLimitOrder).slice(0, MAX_STORED_ITEMS)
      : [];
    const dcaPlans = Array.isArray(record.dcaPlans)
      ? record.dcaPlans.slice(0, MAX_STORED_ITEMS)
      : [];
    return { v: 1, limitOrders, dcaPlans };
  } catch {
    return EMPTY_STATE;
  }
}

function readState(): LimitOrdersStoreState {
  if (!hasStorage()) {
    return memoryState;
  }
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LIMIT_ORDERS_STORAGE_KEY);
  } catch {
    return memoryState;
  }
  if (cachedRaw !== undefined && raw === cachedRaw) {
    return cachedState;
  }
  cachedRaw = raw;
  cachedState = parseState(raw);
  return cachedState;
}

function notifySubscribers(): void {
  for (const listener of memoryListeners) {
    listener();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STORE_EVENT));
  }
}

function writeState(next: LimitOrdersStoreState): void {
  memoryState = next;
  if (hasStorage()) {
    try {
      const payload = JSON.stringify(next);
      window.localStorage.setItem(LIMIT_ORDERS_STORAGE_KEY, payload);
      cachedRaw = payload;
      cachedState = next;
    } catch {
      cachedRaw = undefined;
      cachedState = next;
    }
  } else {
    cachedRaw = undefined;
    cachedState = next;
  }
  notifySubscribers();
}

function subscribe(onChange: () => void): () => void {
  memoryListeners.add(onChange);
  if (typeof window === "undefined") {
    return () => {
      memoryListeners.delete(onChange);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LIMIT_ORDERS_STORAGE_KEY) {
      cachedRaw = undefined;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(STORE_EVENT, onChange);
  return () => {
    memoryListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORE_EVENT, onChange);
  };
}

function serverSnapshot(): LimitOrdersStoreState {
  return EMPTY_STATE;
}

/** Agrega una orden límite simulada y la persiste en el store. */
export function addLimitOrder(input: AddLimitOrderInput): LimitOrder {
  const current = readState();
  const order: LimitOrder = {
    id: generateId("lim"),
    ownerId: input.ownerId,
    symbol: input.symbol,
    name: input.name,
    side: input.side,
    amountUsd: input.amountUsd,
    targetPriceUsd: input.targetPriceUsd,
    expiry: input.expiry,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  writeState({
    ...current,
    limitOrders: [order, ...current.limitOrders].slice(0, MAX_STORED_ITEMS),
  });
  return order;
}

/** Cancela una orden límite activa por id. */
export function cancelLimitOrder(id: string): LimitOrder | null {
  const current = readState();
  let updated: LimitOrder | null = null;
  const nextOrders = current.limitOrders.map((order) => {
    if (order.id !== id) return order;
    updated = { ...order, status: "cancelled" };
    return updated;
  });
  if (!updated) return null;
  writeState({
    ...current,
    limitOrders: nextOrders,
  });
  return updated;
}

/** Limpia el store completo (útil en tests). */
export function clearLimitOrdersStore(): void {
  memoryState = EMPTY_STATE;
  cachedRaw = undefined;
  cachedState = EMPTY_STATE;
  if (hasStorage()) {
    try {
      window.localStorage.removeItem(LIMIT_ORDERS_STORAGE_KEY);
    } catch {
      // Ignorar errores de almacenamiento
    }
  }
  notifySubscribers();
}

export function readLimitOrdersSnapshot(): LimitOrdersStoreState {
  return readState();
}

export function useLimitOrdersStore(): LimitOrdersStoreState {
  return useSyncExternalStore(subscribe, readState, serverSnapshot);
}

export function useLimitOrders(symbol?: string, ownerId?: string): LimitOrder[] {
  const { limitOrders } = useLimitOrdersStore();
  return useMemo(
    () => limitOrders.filter((order) => order.ownerId === ownerId && (!symbol || order.symbol === symbol)),
    [limitOrders, symbol, ownerId],
  );
}
