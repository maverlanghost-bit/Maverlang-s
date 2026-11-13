"use client";

import { AccountSwitch } from "@/components/app-shell/account-switch";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import { Avatar } from "@/components/ui/avatar";
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
  SettingsField,
  SettingsItem,
  SettingsLink,
  SettingsList,
  SettingsNote,
  SettingsPanel,
} from "./ui";

/**
 * Perfil es una lista: identidad, secciones con hairline y acciones al final.
 * Sin tarjetas apiladas ni sombras; cada fila mide 56px y se toca entera.
 */

const SHELL = "flex w-full max-w-2xl min-w-0 flex-col gap-6";

const LINKS = [
  { href: "/app/perfil/cuenta", id: "account" },
  { href: "/app/perfil/seguridad", id: "security" },
  { href: "/app/perfil/notificaciones", id: "notifications" },
  { href: "/app/ajustes", id: "settings" },
  { href: "/app/perfil/legal", id: "legal" },
  { href: "/app/ayuda", id: "help" },
] as const;

/** Identidad sin caja: avatar, nombre y los dos datos que importan. */
function Identity({ heading, email, country }: { heading: string; email?: string; country?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <Avatar alt={heading} fallback={heading} size="lg" className="size-12 text-[15px] md:size-14 md:text-base" />
      <div className="min-w-0 flex-1">
        <p className="text-[17px] leading-6 font-medium break-words text-fg">{heading}</p>
        {email ? <p className="text-[13px] leading-5 break-words text-fg-muted">{email}</p> : null}
        {country ? <p className="text-[13px] leading-5 break-words text-fg-muted">{country}</p> : null}
      </div>
    </div>
  );
}

/** Secciones: una lista de filas, sin caja. */
function ProfileNav({ t }: { t: Messages }) {
  return (
    <nav aria-label={t.profile.menu} className="min-w-0">
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
  );
}

/** Cierre de sesión y versión: el pie de la lista. */
function ProfileClose({
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
    <>
      <SettingsPanel>
        <SettingsList>
          <SettingsItem>
            <SettingsButton onClick={onLogout} disabled={status === "loading"}>
              {t.profile.logout}
            </SettingsButton>
          </SettingsItem>
        </SettingsList>
      </SettingsPanel>
      <p className="text-[13px] leading-5 text-fg-muted">{fill(t.profile.version, { version })}</p>
    </>
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
      <div className={SHELL}>
        <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
        <LoadingState variant="list" label={t.states.loading} />
      </div>
    );
  }
  if (isProfileMigrationMessage(me.error)) {
    const heading = user?.displayName ?? user?.email ?? t.profile.noEmail;
    return (
      <div className={SHELL}>
        <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
        <SettingsNote role="status">{t.profile.schemaMissing}</SettingsNote>
        <Identity heading={heading} />
        <ProfileNav t={t} />
        <ProfileClose t={t} status={status} onLogout={() => void logout()} version={version} />
      </div>
    );
  }
  if (me.isError || !profile) {
    return (
      <div className={SHELL}>
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
    <div className={SHELL}>
      <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
      <Identity heading={heading} email={profile.displayName ? email : undefined} country={country} />
      <ProfileNav t={t} />
      <SettingsPanel>
        <SettingsField label={t.account.typeLabel}>
          <AccountSwitch mode={account.mode} onChange={account.select} />
        </SettingsField>
        <div className="flex min-w-0 items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-5 lg:hidden">
          <p className="label">{t.shell.currencyLabel}</p>
          <CurrencySwitch />
        </div>
        {account.mode === "demo" ? (
          <div className="border-t border-border px-4 py-3 md:px-5">
            <ResetDemoButton />
          </div>
        ) : null}
      </SettingsPanel>

      <SecurityShieldCard email={profile.email} mode={account.mode} />
      <AchievementsCard />
      <ProfileClose t={t} status={status} onLogout={() => void logout()} version={version} />
    </div>
  );
}
