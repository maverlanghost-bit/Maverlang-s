import type { Metadata } from "next";

import { ReceiveScreen } from "./receive-screen";

export const metadata: Metadata = {
  title: "Recibir",
};

export default function RecibirPage() {
  return <ReceiveScreen />;
}
