import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Ingresar y onboarding siguen bajo esta ruta, pero AppShell no les pone chrome. */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
