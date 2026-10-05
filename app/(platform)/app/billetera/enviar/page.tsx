import type { Metadata } from "next";

import { SendScreen } from "./send-screen";

export const metadata: Metadata = {
  title: "Enviar",
};

export default function EnviarPage() {
  return <SendScreen />;
}
