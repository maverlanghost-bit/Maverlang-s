import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/lib/hooks/use-t";

/**
 * Estado vacío de la cuenta real: todavía sin depósitos ni operaciones.
 * M43: si el perfil no está completo, avisa que los datos se pedirán
 * cuando la cuenta Real esté disponible. El onboarding completo sigue
 * accesible desde acá (no se borra).
 */
export function RealAccountEmpty({ profileIncomplete = true }: { profileIncomplete?: boolean }) {
  const { t } = useT();
  return (
    <EmptyState
      title={t.account.comingTitle}
      description={profileIncomplete ? `${t.account.comingBody} ${t.account.comingProfileNote}` : t.account.comingBody}
      action={
        <Link
          href="/app/onboarding"
          className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
        >
          {t.account.completeProfile}
        </Link>
      }
    />
  );
}
