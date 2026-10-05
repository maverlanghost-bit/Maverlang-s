/**
 * Privy sólo si el modo público es `live` y hay app id.
 * En mock, o sin `NEXT_PUBLIC_PRIVY_APP_ID`, no se monta el SDK.
 */
export function shouldUsePrivy(
  env: { dataMode?: string | undefined; privyAppId?: string | undefined } = {
    dataMode: process.env.NEXT_PUBLIC_DATA_MODE,
    privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  },
): boolean {
  const mode = env.dataMode?.trim() || "mock";
  const appId = env.privyAppId?.trim() ?? "";
  return mode === "live" && appId.length > 0;
}

export function privyAppId(): string | null {
  const id = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  return id ? id : null;
}
