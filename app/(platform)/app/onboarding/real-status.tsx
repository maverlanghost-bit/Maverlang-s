"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuthCard, authTitleClass } from "@/components/auth/auth-frame";
import { Button, buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { site } from "@/config/site";
import { getConsents, getMe } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import type { RegistroVersions } from "@/lib/auth/registro-schema";

import { RegistroWizard } from "../registro/wizard";
import { LogoutButton } from "./logout-button";
import {
  ONBOARDING_STATUS_COPY,
  onboardingProfileStatus,
  supportChannel,
  type OnboardingProfileStatus,
} from "./status";

function Frame({ children }: { children: ReactNode }) {
  return (
    <AuthCard>
      {children}
      <div className="mt-1">
        <LogoutButton variant="ghost" size="md" className="w-full" />
      </div>
    </AuthCard>
  );
}

function LoadingCard() {
  return (
    <Frame>
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Revisando el estado de tu registro</span>
        <Skeleton className="mt-6 h-3 w-24" />
        <Skeleton className="mt-4 h-8 w-4/5" />
        <Skeleton className="mt-4 h-16 w-full" />
      </div>
    </Frame>
  );
}

function SupportLink({ primary = false }: { primary?: boolean }) {
  const support = supportChannel(site.supportEmail);
  return (
    <div>
      <a
        href={support.href}
        className={buttonClasses({
          size: "lg",
          variant: primary ? "primary" : "secondary",
          className: "w-full",
        })}
      >
        {support.kind === "email" ? "Escribir a soporte" : "Ir al Centro de ayuda"}
      </a>
      {support.kind === "help" ? (
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{ONBOARDING_STATUS_COPY.supportPending}</p>
      ) : null}
    </div>
  );
}

function StatusCard({ status }: { status: Exclude<OnboardingProfileStatus, { kind: "pending" }> }) {
  const copy =
    status.kind === "complete"
      ? { title: ONBOARDING_STATUS_COPY.completeTitle, body: ONBOARDING_STATUS_COPY.completeBody }
      : status.kind === "declaration_review"
        ? {
            title: ONBOARDING_STATUS_COPY.reviewTitle,
            body: `${ONBOARDING_STATUS_COPY.reviewBody} ${ONBOARDING_STATUS_COPY.reviewSupport}`,
          }
        : { title: ONBOARDING_STATUS_COPY.blockedTitle, body: ONBOARDING_STATUS_COPY.blockedBody };

  return (
    <Frame>
      <h1 className={`mt-6 ${authTitleClass}`}>{copy.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-body">{copy.body}</p>
      <div className="mt-6 flex flex-col gap-3">
        {status.kind === "complete" ? (
          <Link href="/app" className={buttonClasses({ size: "lg", className: "w-full" })}>
            {ONBOARDING_STATUS_COPY.backToApp}
          </Link>
        ) : (
          <>
            <SupportLink primary />
            {status.kind === "declaration_review" ? (
              <Link
                href="/app"
                className={buttonClasses({ variant: "secondary", size: "lg", className: "w-full" })}
              >
                {ONBOARDING_STATUS_COPY.backToApp}
              </Link>
            ) : null}
          </>
        )}
      </div>
    </Frame>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame>
      <h1 className={`mt-6 ${authTitleClass}`}>{ONBOARDING_STATUS_COPY.errorTitle}</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-body">{ONBOARDING_STATUS_COPY.errorBody}</p>
      <div className="mt-6 flex flex-col gap-3">
        <Button type="button" size="lg" className="w-full" onClick={onRetry}>
          {ONBOARDING_STATUS_COPY.retry}
        </Button>
        <SupportLink />
      </div>
    </Frame>
  );
}

/**
 * Onboarding real (Supabase). Antes de mostrar el wizard comprueba el perfil:
 * un perfil ya completo no se puede volver a declarar por la RPC, así que no
 * se le ofrece un formulario que fallaría al final. La consulta usa
 * `/api/me` y `/api/me/consents` (nada de Supabase directo desde el cliente).
 */
export function RealOnboardingGate({
  next,
  versions,
  declarationVersion,
  demoForBlocked,
}: {
  next: string | null;
  versions: RegistroVersions;
  declarationVersion: string;
  demoForBlocked: boolean;
}) {
  const { status, user } = useSession();
  const query = useQuery({
    queryKey: ["onboarding-profile-status", user?.id ?? null],
    queryFn: async () => {
      const [profile, consents] = await Promise.all([getMe(), getConsents()]);
      return { profile, consents };
    },
    enabled: status === "authenticated",
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (status === "loading") return <LoadingCard />;

  // Sin sesión, el wizard de registro ya muestra la tarjeta de ingreso.
  if (status !== "authenticated") {
    return (
      <RegistroWizard
        mode="completar"
        next={next}
        versions={versions}
        declarationVersion={declarationVersion}
        demoForBlocked={demoForBlocked}
      />
    );
  }

  if (query.isPending) return <LoadingCard />;
  if (query.isError) return <ErrorCard onRetry={() => void query.refetch()} />;

  const statusOfProfile = onboardingProfileStatus({
    onboardingCompleted: query.data.profile.onboardingCompleted,
    isUsPerson: query.data.profile.isUsPerson,
    currentDeclarationVersion: declarationVersion,
    consents: query.data.consents,
  });

  if (statusOfProfile.kind === "pending") {
    return (
      <RegistroWizard
        mode="completar"
        next={next}
        versions={versions}
        declarationVersion={declarationVersion}
        demoForBlocked={demoForBlocked}
      />
    );
  }

  return <StatusCard status={statusOfProfile} />;
}
