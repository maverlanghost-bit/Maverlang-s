import { koyweAdapter } from "@/lib/onramp/koywe";
import { onramperAdapter } from "@/lib/onramp/onramper";
import type { OnrampAdapter } from "@/lib/onramp/launch";
import type { OnrampProviderId } from "@/lib/types";

const adapters: Record<OnrampProviderId, OnrampAdapter> = {
  koywe: koyweAdapter,
  onramper: onramperAdapter,
};

export function onrampAdapter(id: OnrampProviderId): OnrampAdapter {
  return adapters[id];
}

export { koyweAdapter, onramperAdapter };
export type { OnrampAdapter, OnrampLaunch } from "@/lib/onramp/launch";
