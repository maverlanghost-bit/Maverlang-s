"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";

/**
 * Mock resuelve "mock": no hay clave y la UI no debe inventar una.
 * Live abre el modal de Privy (`useExportWallet`) y resuelve "privy".
 * Esta app nunca recibe la clave: Privy la muestra en otro dominio.
 */
export type ExportWalletResult = "mock" | "privy";

export type ExportWallet = () => Promise<ExportWalletResult>;

const ExportWalletContext = createContext<ExportWallet | null>(null);

export function ExportWalletProvider({
  exportWallet,
  children,
}: {
  exportWallet: ExportWallet;
  children: ReactNode;
}) {
  return createElement(ExportWalletContext.Provider, { value: exportWallet }, children);
}

export function useExportKey(): ExportWallet {
  const exportWallet = useContext(ExportWalletContext);
  if (!exportWallet) throw new Error("useExportKey debe usarse dentro de AuthProvider.");
  return exportWallet;
}

export async function exportMockWallet(): Promise<ExportWalletResult> {
  return "mock";
}
