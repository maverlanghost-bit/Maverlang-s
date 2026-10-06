import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/lib/hooks/use-t";

/** Estado vacío de la cuenta real: todavía sin depósitos ni operaciones. */
export function RealAccountEmpty() {
  const { t } = useT();
  return <EmptyState title={t.account.comingTitle} description={t.account.comingBody} />;
}
