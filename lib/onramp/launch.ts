import type { OnrampProviderId, OnrampSession } from "@/lib/types";

export type OnrampLaunch =
  | { type: "dialog" }
  | { type: "url"; url: string }
  | { type: "sdk"; config: Record<string, unknown> };

/** Misma forma para Koywe y Onramper. El id dice cuál se abre. */
export interface OnrampAdapter {
  id: OnrampProviderId;
  launch(session: OnrampSession): OnrampLaunch;
}

function clientDataMode(): "mock" | "live" {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE?.trim();
  return mode === "live" ? "live" : "mock";
}

/**
 * Mock: diálogo. Live: la URL del widget o la config del SDK.
 * El SDK de Koywe y la URL de Onramper se conectan cuando el servicio live deje el stub.
 */
export function launchSession(session: OnrampSession): OnrampLaunch {
  if (clientDataMode() !== "live") return { type: "dialog" };
  if (session.mode === "widget_url" && session.widgetUrl) {
    return { type: "url", url: session.widgetUrl };
  }
  return { type: "sdk", config: session.sdkConfig ?? {} };
}
