import type { Metadata } from "next";

import { readDepositEligibility } from "@/lib/deposits/pilot-session";

import { DepositScreen } from "./deposit-screen";

export const metadata: Metadata = {
  title: "Depositar",
};

/**
 * La elegibilidad se decide en el servidor (correo verificado de Supabase
 * Auth, sin lista de correos). El cliente recibe sólo un booleano.
 */
export default async function DepositarPage() {
  const eligibility = await readDepositEligibility();
  return <DepositScreen depositEligible={eligibility.eligible} />;
}
