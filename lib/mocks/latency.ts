import { AsyncLocalStorage } from "node:async_hooks";

import { DomainError, isApiErrorCode } from "@/lib/api/result";
import type { ApiErrorCode } from "@/lib/types";
import { hashSeed, mulberry32 } from "@/lib/mocks/prng";

/**
 * Latencia mock 200–600 ms, determinista por semilla.
 * `?mockError=PRICE_DEVIATION` (u otro ApiErrorCode): el route handler llama
 * `withMockError(code, () => servicio...)`. También se acepta el argumento explícito.
 */
const mockErrorStore = new AsyncLocalStorage<ApiErrorCode>();

export function parseMockError(value: unknown): ApiErrorCode | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") return null;
  if (!isApiErrorCode(value)) {
    throw new DomainError("VALIDATION", "mockError no es un código de error conocido.");
  }
  return value;
}

export function withMockError<T>(mockError: unknown, run: () => T): T {
  const code = parseMockError(mockError);
  if (!code) return run();
  return mockErrorStore.run(code, run);
}

function delayMs(seed: string): number {
  const rand = mulberry32(hashSeed(`latency:${seed}`));
  return 200 + Math.floor(rand() * 401);
}

export async function simulateMock<T>(
  seed: string,
  produce: () => T | Promise<T>,
  mockError?: unknown,
): Promise<T> {
  const code = parseMockError(mockError) ?? mockErrorStore.getStore() ?? null;
  const ms = delayMs(seed);
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
  if (code) throw new DomainError(code);
  return produce();
}
