"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthFrame, AuthLegal, authLinkClass } from "@/components/auth/auth-frame";
import { FormAlert } from "@/components/auth/form-alert";
import { GoogleIcon } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { shouldUsePrivy, useSession, type LoginMethod } from "@/lib/auth";
import { readBrowserCookie } from "@/lib/auth/browser-cookies";
import { MOCK_ONBOARDING_COOKIE, ONBOARDING_DONE } from "@/lib/auth/cookies";
import { clientAuthModeInput, isSupabaseAuth } from "@/lib/auth/mode";
import { AUTH_STAY_PARAM, onboardingPath, registroPath, safeNextPath } from "@/lib/auth/paths";

import { SupabaseLogin } from "./supabase-login";

function MailIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, login } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<LoginMethod | null>(null);
  const next = safeNextPath(params.get("next")) ?? "/app";
  const stay = params.get(AUTH_STAY_PARAM) === "1";
  const [proceeded, setProceeded] = useState(false);
  const create = registroPath(next);
  const supabaseMode = isSupabaseAuth(clientAuthModeInput());
  const demo = !supabaseMode && !shouldUsePrivy();

  useEffect(() => {
    if (supabaseMode) return;
    if (status !== "authenticated") return;
    if (readBrowserCookie(MOCK_ONBOARDING_COOKIE) !== ONBOARDING_DONE) {
      // `stay` llega del gate al rebotar desde onboarding. Sin un ingreso nuevo
      // en esta pantalla, volver a empujar onboarding anida `next` y cicla.
      if (stay && !proceeded) return;
      router.replace(onboardingPath(next));
      return;
    }
    router.replace(next);
  }, [next, proceeded, router, status, stay, supabaseMode]);

  async function enter(method: LoginMethod) {
    setError(null);
    setPending(method);
    setProceeded(true);
    try {
      await login(method);
    } catch {
      setPending(null);
      setProceeded(false);
      setError("No pudimos abrir el ingreso. Inténtalo otra vez.");
    }
  }

  const busy = status !== "unauthenticated";

  if (supabaseMode) {
    return <SupabaseLogin next={next} createHref={create} linkError={params.get("error")} />;
  }

  return (
    <AuthFrame title="Ingresa o crea tu cuenta" lead="Con tu correo o con Google.">
      <div className="mt-5 flex flex-col gap-2">
        <Button
          className="w-full"
          size="lg"
          loading={pending === "email"}
          disabled={busy}
          onClick={() => void enter("email")}
        >
          <MailIcon />
          Continuar con correo
        </Button>
        <Button
          className="w-full"
          variant="secondary"
          size="lg"
          loading={pending === "google"}
          disabled={busy}
          onClick={() => void enter("google")}
        >
          <GoogleIcon />
          Continuar con Google
        </Button>
      </div>
      {demo ? (
        <FormAlert tone="info">En este entorno los dos botones abren la cuenta demo.</FormAlert>
      ) : null}
      <p className="mt-1 text-center text-[13px] leading-relaxed text-fg-muted">
        <Link href={create} className={authLinkClass}>
          Crear cuenta
        </Link>
      </p>
      {params.get("error") === "enlace" ? <FormAlert>Ese enlace no es válido o ya venció.</FormAlert> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <AuthLegal />
    </AuthFrame>
  );
}
