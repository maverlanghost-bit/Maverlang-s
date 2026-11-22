"use client";

import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { AccountSwitch } from "@/components/app-shell/account-switch";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { IconChevron, IconGear, IconHelp, IconLogout, IconUser } from "@/components/ui/icons";
import { LoadingState } from "@/components/ui/loading-state";
import { AchievementsCard } from "@/components/domain/achievements-card";
import { ResetDemoButton } from "@/components/domain/reset-demo-button";
import { SecurityShieldCard } from "@/components/domain/security-shield-card";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useMe } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isProfileMigrationMessage } from "@/lib/profile/migration";
import type { Messages } from "@/content/i18n/es-CL";

import { fill, regionName, SettingsNote } from "./ui";

/**
 * Perfil como menú: identidad arriba, dos grupos cortos de filas con icono y,
 * plegado, lo que es lectura opcional (resumen de seguridad y logros). Cada
 * fila mide 56px y se toca entera.
 */

const SHELL = "flex w-full max-w-2xl min-w-0 flex-col gap-6";
const GROUP = "overflow-hidden rounded-3xl border border-border bg-bg";
const ROW =
  "flex min-h-14 w-full min-w-0 items-center gap-3.5 px-4 py-3 text-left text-[15px] leading-5 text-fg outline-none transition-colors duration-[140ms] hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-inset md:px-5";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

function IconShield(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M8 1.75 2.75 3.6v4.1c0 3.1 2.2 5.4 5.25 6.55 3.05-1.15 5.25-3.45 5.25-6.55V3.6L8 1.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m5.75 8 1.6 1.6L10.5 6.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M4 6.6a4 4 0 0 1 8 0v2.6l1.25 2.05H2.75L4 9.2V6.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.4 13.25a1.7 1.7 0 0 0 3.2 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconDoc(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M4 1.75h5.25L12.5 5v9.25H4V1.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 1.75V5.3h3.5M6 8.5h4.5M6 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrophy(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M5 2.25h6v3.5a3 3 0 0 1-6 0v-3.5ZM8 8.75v2.5M5.5 13.75h5M5 3.5H2.75v.75A2.25 2.25 0 0 0 5 6.5M11 3.5h2.25v.75A2.25 2.25 0 0 1 11 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RowIcon({ icon: Glyph, tone = "default" }: { icon: Icon; tone?: "default" | "danger" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full",
        tone === "danger" ? "bg-down-bg text-down" : "bg-surface-2 text-fg",
      )}
    >
      <Glyph className="size-[18px]" />
    </span>
  );
}

function Chevron({ className }: { className?: string }) {
  return <IconChevron aria-hidden className={cn("size-4 shrink-0 -rotate-90 text-fg-subtle", className)} />;
}

function RowText({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate">{label}</span>
      {hint ? <span className="truncate text-[13px] leading-5 text-fg-muted">{hint}</span> : null}
    </span>
  );
}

function MenuGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-2">
      {label ? <h2 className="label px-1">{label}</h2> : null}
      <ul className={cn(GROUP, "divide-y divide-border")}>{children}</ul>
    </section>
  );
}

function MenuLink({ href, icon, label, hint }: { href: string; icon: Icon; label: string; hint?: string }) {
  return (
    <li>
      <Link href={href} className={ROW}>
        <RowIcon icon={icon} />
        <RowText label={label} hint={hint} />
        <Chevron />
      </Link>
    </li>
  );
}

/** Fila plegable: lectura opcional que no alarga el menú hasta que se pide. */
function MenuDisclosure({ icon, label, hint, children }: { icon: Icon; label: string; hint?: string; children: ReactNode }) {
  return (
    <li>
      <details className="group">
        <summary className={cn(ROW, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
          <RowIcon icon={icon} />
          <RowText label={label} hint={hint} />
          <Chevron className="rotate-0 transition-transform duration-[240ms] group-open:rotate-180" />
        </summary>
        <div className="border-t border-border bg-surface-1 p-3 md:p-4">{children}</div>
      </details>
    </li>
  );
}

/** Identidad: avatar, nombre, correo y el tipo de cuenta como insignia. */
function Identity({
  heading,
  email,
  country,
  badge,
}: {
  heading: string;
  email?: string;
  country?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-3xl border border-border bg-surface-1 p-4 md:p-5">
      <Avatar alt={heading} fallback={heading} size="lg" className="size-14 text-base" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] leading-6 font-medium text-fg">{heading}</p>
        {email ? <p className="truncate text-[13px] leading-5 text-fg-muted">{email}</p> : null}
        {badge || country ? (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
            {badge}
            {country ? <span className="text-[13px] leading-5 text-fg-muted">{country}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProfileNav({ t, securityHint }: { t: Messages; securityHint?: string }) {
  return (
    <nav aria-label={t.profile.menu} className="flex min-w-0 flex-col gap-6">
      <MenuGroup>
        <MenuLink href="/app/perfil/cuenta" icon={IconUser} label={t.profile.account} />
        <MenuLink href="/app/perfil/seguridad" icon={IconShield} label={t.profile.security} hint={securityHint} />
        <MenuLink href="/app/perfil/notificaciones" icon={IconBell} label={t.profile.notifications} />
      </MenuGroup>
      <MenuGroup>
        <MenuLink href="/app/ajustes" icon={IconGear} label={t.profile.settings} />
        <MenuLink href="/app/perfil/legal" icon={IconDoc} label={t.profile.legal} />
        <MenuLink href="/ayuda" icon={IconHelp} label={t.profile.help} />
      </MenuGroup>
    </nav>
  );
}

/** Cierre de sesión y versión: el pie del menú. */
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
    <div className="flex min-w-0 flex-col gap-3">
      <div className={GROUP}>
        <button
          type="button"
          onClick={onLogout}
          disabled={status === "loading"}
          className={cn(ROW, "text-down disabled:pointer-events-none disabled:opacity-50")}
        >
          <RowIcon icon={IconLogout} tone="danger" />
          <span className="flex-1">{t.profile.logout}</span>
        </button>
      </div>
      <p className="text-center text-[12px] leading-5 text-fg-subtle">{fill(t.profile.version, { version })}</p>
    </div>
  );
}

export function ProfileScreen({ version }: { version: string }) {
  const { t, language } = useT();
  const { status, logout, user } = useSession();
  const account = useAccountMode();
  const me = useMe();
  const profile = me.data;
  const en = language === "en";

  if (me.isPending) {
    return (
      <div className={SHELL}>
        <h1 className="sr-only">{t.pages.profile.title}</h1>
        <LoadingState variant="list" label={t.states.loading} />
      </div>
    );
  }
  if (isProfileMigrationMessage(me.error)) {
    const heading = user?.displayName ?? user?.email ?? t.profile.noEmail;
    return (
      <div className={SHELL}>
        <h1 className="sr-only">{t.pages.profile.title}</h1>
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
        <h1 className="sr-only">{t.pages.profile.title}</h1>
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
  const country = profile.country ? regionName(profile.country, language, t.profile.noCountry) : undefined;
  const heading = profile.displayName ?? email;
  const demo = account.mode === "demo";

  return (
    <div className={SHELL}>
      <h1 className="sr-only">{t.pages.profile.title}</h1>
      <Identity
        heading={heading}
        email={profile.displayName ? email : undefined}
        country={country}
        badge={<Badge tone={demo ? "warn" : "neutral"}>{demo ? t.account.demo : t.account.real}</Badge>}
      />

      <section aria-label={t.account.typeLabel} className="flex min-w-0 flex-col gap-3 rounded-3xl border border-border p-4 md:p-5">
        <h2 className="label">{t.account.typeLabel}</h2>
        <AccountSwitch mode={account.mode} onChange={account.select} />
        {demo ? <div><ResetDemoButton /></div> : null}
      </section>

      <ProfileNav t={t} />

      <MenuGroup label={en ? "More" : "Más"}>
        <MenuDisclosure
          icon={IconShield}
          label={en ? "Security summary" : "Resumen de seguridad"}
          hint={en ? "Custody, limits and session" : "Custodia, límites y sesión"}
        >
          <SecurityShieldCard email={profile.email} mode={account.mode} />
        </MenuDisclosure>
        <MenuDisclosure
          icon={IconTrophy}
          label={en ? "Learning achievements" : "Logros de aprendizaje"}
          hint={en ? "Visit streaks and guides read" : "Rachas de visitas y guías leídas"}
        >
          <AchievementsCard />
        </MenuDisclosure>
      </MenuGroup>

      <ProfileClose t={t} status={status} onLogout={() => void logout()} version={version} />
    </div>
  );
}
