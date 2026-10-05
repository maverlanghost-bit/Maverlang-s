"use client";

import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useCallback, type ReactNode } from "react";

import { SignerProvider, type SignTrade } from "@/lib/auth/sign-transaction";
import { useSession } from "@/lib/auth/session-context";

function solanaChain(): "solana:mainnet" | "solana:devnet" | "solana:testnet" {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim();
  if (cluster === "devnet") return "solana:devnet";
  if (cluster === "testnet") return "solana:testnet";
  return "solana:mainnet";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Firma con la billetera embebida de Privy. Sólo se monta en modo live. */
export function PrivyTradeSigner({ children }: { children: ReactNode }) {
  const { signTransaction } = useSignTransaction();
  const { wallets } = useWallets();
  const session = useSession();
  const address = session.user?.walletAddress ?? null;

  const sign = useCallback<SignTrade>(
    async (transactionBase64) => {
      const wallet = (address ? wallets.find((item) => item.address === address) : undefined) ?? wallets[0];
      if (!wallet) throw new Error("NO_WALLET");
      const signed = await signTransaction({
        transaction: base64ToBytes(transactionBase64),
        wallet,
        chain: solanaChain(),
      });
      return bytesToBase64(signed.signedTransaction);
    },
    [address, signTransaction, wallets],
  );

  return <SignerProvider sign={sign}>{children}</SignerProvider>;
}
