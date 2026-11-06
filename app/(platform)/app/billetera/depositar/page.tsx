import type { Metadata } from "next";

import { readDepositPilotEligibility } from "@/lib/deposits/pilot-session";

import { DepositScreen } from "./deposit-screen";

export const metadata: Metadata = {
  title: "Depositar",
};

/**
 * La elegibilidad del piloto se decide en el servidor (correo verificado de
 * Supabase Auth + lista del servidor). El cliente recibe sólo un booleano.
 */
export default async function DepositarPage() {
  const pilot = await readDepositPilotEligibility();
  return (
    <DepositScreen
      pilotEligible={pilot.eligible}
      pilotConfigured={pilot.allowlistConfigured}
    />
  );
}
