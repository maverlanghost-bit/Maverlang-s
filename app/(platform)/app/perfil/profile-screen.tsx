"use client";

import { AccountSwitch } from "@/components/app-shell/account-switch";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { AchievementsCard } from "@/components/domain/achievements-card";
import { ResetDemoButton } from "@/components/domain/reset-demo-button";
import { SecurityShieldCard } from "@/components/domain/security-shield-card";
import { useSession } from "@/lib/auth";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useMe } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isProfileMigrationMessage } from "@/lib/profile/migration";
import type { Messages } from "@/content/i18n/es-CL";

import {
  fill,
  regionName,
  SettingsButton,
  SettingsItem,
  SettingsLink,
  SettingsList,
  SettingsNote,
  SettingsPanel,
} from "./ui";

const LINKS = [
  { href: "/app/perfil/cuenta", id: "account" },
  { href: "/app/perfil/seguridad", id: "security" },
  { href: "/app/perfil/notificaciones", id: "notifications" },
  { href: "/app/ajustes", id: "settings" },
  { href: "/app/perfil/legal", id: "legal" },
  { href: "/ayuda", id: "help" },
] as const;

function ProfileMenu({
  t,
  status,
  onLogout,
  version,
}: {
  t: Messages;
  status: "loading" | "authenticated" | "unauthenticated";
  onLogout: () => void;
  version: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t.profile.menu}>
        <SettingsPanel>
          <SettingsList>
            {LINKS.map((item) => (
              <SettingsItem key={item.href}>
                <SettingsLink href={item.href} label={t.profile[item.id]} />
              </SettingsItem>
            ))}
          </SettingsList>
        </SettingsPanel>
      </nav>
      <SettingsPanel>
        <SettingsList>
          <SettingsItem>
            <SettingsButton onClick={onLogout} disabled={status === "loading"}>
              {t.profile.logout}
            </SettingsButton>
          </SettingsItem>
        </SettingsList>
      </SettingsPanel>
      <p className="text-center text-[13px] leading-5 text-fg-muted">{fill(t.profile.version, { version })}</p>
    </div>
  );
}

export function ProfileScreen({ version }: { version: string }) {
  const { t, language } = useT();
  const { status, logout, user } = useSession();
  const account = useAccountMode();
  const me = useMe();
  const profile = me.data;

  if (me.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
        <LoadingState variant="list" label={t.states.loading} />
      </div>
    );
  }
  if (isProfileMigrationMessage(me.error)) {
    const heading = user?.displayName ?? user?.email ?? t.profile.noEmail;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
        <SettingsNote role="status">{t.profile.schemaMissing}</SettingsNote>
        <Card className="flex items-center gap-4 p-5 md:p-6">
          <Avatar alt={heading} fallback={heading} size="lg" className="size-14 text-base md:size-16 md:text-lg" />
          <p className="min-w-0 flex-1 break-words text-[17px] leading-6 text-fg">{heading}</p>
        </Card>
        <ProfileMenu t={t} status={status} onLogout={() => void logout()} version={version} />
      </div>
    );
  }
  if (me.isError || !profile) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
        <ErrorState
          label={t.states.error}
          title={t.profile.loadError}
          retryLabel={t.states.retry}
          onRetry={() => void me.refetch()}
        />
      </div>
    );
  }

  const email = profile.email ?? t.profile.noEmail;
  const country = regionName(profile.country, language, t.profile.noCountry);
  const heading = profile.displayName ?? email;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
      <Card className="flex items-center gap-4 p-5 md:p-6">
        <Avatar alt={heading} fallback={heading} size="lg" className="size-14 text-base md:size-16 md:text-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-6 font-medium break-words text-fg">{heading}</p>
          {profile.displayName ? <p className="mt-0.5 text-[13px] leading-5 break-all text-fg-muted">{email}</p> : null}
          <p className="text-[13px] leading-5 text-fg-muted">{country}</p>
        </div>
      </Card>
      <Card className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-2">
          <p className="label">{t.account.typeLabel}</p>
          <AccountSwitch mode={account.mode} onChange={account.select} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4 lg:hidden">
          <p className="label">{t.shell.currencyLabel}</p>
          <CurrencySwitch />
        </div>
        {account.mode === "demo" ? (
          <div className="border-t border-border/70 pt-4">
            <ResetDemoButton />
          </div>
        ) : null}
      </Card>
      <SecurityShieldCard email={profile.email} mode={account.mode} />
      <AchievementsCard />
      <ProfileMenu t={t} status={status} onLogout={() => void logout()} version={version} />
    </div>
  );
}
