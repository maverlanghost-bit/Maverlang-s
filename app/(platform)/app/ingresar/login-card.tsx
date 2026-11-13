"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthFrame, AuthLegal } from "@/components/auth/auth-frame";
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

function GoogleIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.42Z"
      />
      <path
        fill="currentColor"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
      />
      <path
        fill="currentColor"
        d="M6.4 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.3.32-1.91V7.51H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.49l3.34-2.58Z"
      />
      <path
        fill="currentColor"
        d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2A10 10 0 0 0 3.06 7.51l3.34 2.58C7.19 7.73 9.4 5.97 12 5.97Z"
      />
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
      <div className="mt-6 flex flex-col gap-3">
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
        <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-center text-sm leading-relaxed text-fg-muted">
          En este entorno los dos botones abren la cuenta demo.
        </p>
      ) : null}
      <p className="mt-4 text-center text-sm leading-relaxed text-fg-muted">
        <Link
          href={create}
          className="inline-flex min-h-11 items-center justify-center rounded-sm px-2 font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg"
        >
          Crear cuenta
        </Link>
      </p>
      {params.get("error") === "enlace" ? (
        <p className="mt-4 rounded-lg border border-down/20 bg-down-bg px-3 py-2.5 text-center text-sm leading-relaxed text-down" role="alert">
          Ese enlace no es válido o ya venció.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg border border-down/20 bg-down-bg px-3 py-2.5 text-center text-sm leading-relaxed text-down" role="alert">
          {error}
        </p>
      ) : null}
      <AuthLegal />
    </AuthFrame>
  );
}
