"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";

import { MOCK_SIGN_MS } from "@/config/trade";

/** Recibe la transacción en base64 y devuelve la firmada, también en base64. */
export type SignTrade = (transactionBase64: string) => Promise<string>;

const SignerContext = createContext<SignTrade | null>(null);

export function SignerProvider({ sign, children }: { sign: SignTrade; children: ReactNode }) {
  return createElement(SignerContext.Provider, { value: sign }, children);
}

export function useSignTrade(): SignTrade {
  const sign = useContext(SignerContext);
  if (!sign) throw new Error("useSignTrade debe usarse dentro de AuthProvider.");
  return sign;
}

/**
 * Firma de DEMO (AUTH_MODE=mock). No hay clave privada: espera y devuelve la
 * misma transacción, así que NO es una firma criptográfica y nunca debe
 * montarse con una identidad real (Supabase/Privy). El servidor mock sólo
 * comprueba que el campo firmado no venga vacío.
 */
export async function signDemoTransaction(transactionBase64: string): Promise<string> {
  if (transactionBase64.trim() === "") throw new Error("NO_WALLET");
  await new Promise((resolve) => {
    setTimeout(resolve, MOCK_SIGN_MS);
  });
  return transactionBase64;
}
