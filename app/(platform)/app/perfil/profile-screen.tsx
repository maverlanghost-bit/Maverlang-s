"use client";

import Link from "next/link";

import { AccountSwitch } from "@/components/app-shell/account-switch";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { IconChevron } from "@/components/ui/icons";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { ResetDemoButton } from "@/components/domain/reset-demo-button";
import { useSession } from "@/lib/auth";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useMe } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isProfileMigrationMessage } from "@/lib/profile/migration";
import type { Messages } from "@/content/i18n/es-CL";

import { fill, regionName } from "./ui";

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
    <div className="flex flex-col gap-3">
      <nav aria-label={t.profile.menu}>
        <ul className="overflow-hidden rounded-3xl border border-border bg-surface-1">
          {LINKS.map((item) => (
            <li key={item.href} className="border-b border-border last:border-b-0">
              <Link
                href={item.href}
                className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm text-fg outline-none transition duration-[140ms] hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-inset"
              >
                <span>{t.profile[item.id]}</span>
                <IconChevron className="-rotate-90 text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label={t.profile.logout}>
        <ul className="overflow-hidden rounded-3xl border border-border bg-surface-1">
          <li>
            <button
              type="button"
              onClick={onLogout}
              disabled={status === "loading"}
              className="flex min-h-11 w-full items-center px-4 py-3 text-left text-sm text-down outline-none transition duration-[140ms] hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-inset disabled:opacity-40"
            >
              {t.profile.logout}
            </button>
          </li>
        </ul>
      </nav>
      <p className="text-center text-sm text-fg-muted">{fill(t.profile.version, { version })}</p>
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
        <LoadingState label={t.states.loading} />
      </div>
    );
  }
  if (isProfileMigrationMessage(me.error)) {
    const heading = user?.displayName ?? user?.email ?? t.profile.noEmail;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
        <p role="status" className="rounded-2xl border border-border bg-surface-1 px-4 py-3 text-sm leading-relaxed text-fg-muted">
          {t.profile.schemaMissing}
        </p>
        <Card className="flex items-center gap-4 p-4 md:p-6">
          <Avatar alt={heading} fallback={heading} size="lg" className="size-16 text-lg" />
          <p className="min-w-0 flex-1 break-words text-lg text-fg">{heading}</p>
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
    <div className="flex flex-col gap-6">
      <PageHeader title={t.pages.profile.title} description={t.pages.profile.lead} />
      <Card className="flex items-center gap-4 p-4 md:p-6">
        <Avatar alt={heading} fallback={heading} size="lg" className="size-16 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-lg text-fg">{heading}</p>
          {profile.displayName ? <p className="break-all text-sm text-fg-muted">{email}</p> : null}
          <p className="text-sm text-fg-muted">{country}</p>
        </div>
      </Card>
      <Card className="flex flex-col gap-4 p-4 md:p-6">
        <AccountSwitch mode={account.mode} onChange={account.select} />
        {account.mode === "demo" ? (
          <div>
            <ResetDemoButton />
          </div>
        ) : null}
      </Card>
      <ProfileMenu t={t} status={status} onLogout={() => void logout()} version={version} />
    </div>
  );
}
