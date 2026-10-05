export function explorerTxUrl(signature: string): string {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim();
  const url = `https://solscan.io/tx/${encodeURIComponent(signature)}`;
  if (!cluster || cluster === "mainnet-beta") return url;
  return `${url}?cluster=${encodeURIComponent(cluster)}`;
}
