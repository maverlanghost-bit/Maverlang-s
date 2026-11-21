import type { Activity } from "@/lib/types";

export function depositConfirmationStatus(row?: Activity): "pending" | "confirmed" | null {
  if (row?.kind !== "deposit" && row?.kind !== "onramp") return null;
  if (row.status === "pending" || row.status === "submitted") return "pending";
  return row.status === "confirmed" ? "confirmed" : null;
}
