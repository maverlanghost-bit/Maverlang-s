"use client";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { usePrefs } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { useUpdatePrefs } from "@/lib/hooks/use-update-prefs";
import type { Preferences } from "@/lib/types";

import { SettingsFrame, SettingsPanel } from "../ui";

const ROWS = [
  { key: "notifyOrders", label: "notifyOrders", hint: "notifyOrdersHint" },
  { key: "notifyDeposits", label: "notifyDeposits", hint: "notifyDepositsHint" },
  { key: "notifyNews", label: "notifyNews", hint: "notifyNewsHint" },
] as const satisfies readonly { key: keyof Pick<Preferences, "notifyOrders" | "notifyDeposits" | "notifyNews">; label: "notifyOrders" | "notifyDeposits" | "notifyNews"; hint: "notifyOrdersHint" | "notifyDepositsHint" | "notifyNewsHint" }[];

export function NotificationsScreen() {
  const { t } = useT();
  const { toast } = useToast();
  const prefs = usePrefs();
  const update = useUpdatePrefs();
  const data = prefs.data;

  if (prefs.isPending) {
    return (
      <SettingsFrame title={t.profile.notifications} description={t.profile.notificationsLead}>
        <LoadingState label={t.states.loading} />
      </SettingsFrame>
    );
  }
  if (prefs.isError || !data) {
    return (
      <SettingsFrame title={t.profile.notifications} description={t.profile.notificationsLead}>
        <ErrorState
          label={t.states.error}
          title={t.profile.prefsError}
          retryLabel={t.states.retry}
          onRetry={() => void prefs.refetch()}
        />
      </SettingsFrame>
    );
  }

  return (
    <SettingsFrame title={t.profile.notifications} description={t.profile.notificationsLead}>
      <SettingsPanel>
        {ROWS.map((row) => (
          <div key={row.key} className="border-b border-border px-4 py-3 last:border-b-0 md:px-6">
            <Switch
              label={t.profile[row.label]}
              checked={data[row.key]}
              onCheckedChange={(checked) => {
                update({ [row.key]: checked }, () => toast({ title: t.profile.prefsError, tone: "down" }));
              }}
            />
            <p className="pr-16 text-sm text-fg-muted">{t.profile[row.hint]}</p>
          </div>
        ))}
      </SettingsPanel>
    </SettingsFrame>
  );
}
