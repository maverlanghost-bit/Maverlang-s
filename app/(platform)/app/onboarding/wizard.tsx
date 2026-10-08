"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";

import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isOperationBlocked } from "@/config/compliance";
import { ApiError, addConsent, updateMe } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { writeClientCookie, readBrowserCookie } from "@/lib/auth/browser-cookies";
import { MOCK_ONBOARDING_COOKIE, ONBOARDING_DONE } from "@/lib/auth/cookies";

import { countryOptions } from "./countries";
import {
  clampDraft,
  emptyDraft,
  formValues,
  loadDraft,
  readDraftRaw,
  saveDraft,
  versionKey,
  type LegalVersions,
  type OnboardingDraft,
  type OnboardingStep,
} from "./draft";
import { LogoutButton } from "./logout-button";
import {
  BrandLink,
  CountryFields,
  DeclarationStep,
  DocumentsStep,
  NationalityField,
  DoneStep,
  StepProgress,
  UnavailableStep,
  WalletStep,
} from "./panel";
import { onboardingSchema, type OnboardingInput, type OnboardingOutput } from "./schema";

const CREATE_MS = 800;
const WALLET_WAIT_MS = 12_000;

const TITLES: Record<OnboardingStep, string> = {
  1: "¿Dónde vives?",
  2: "Declaración",
  3: "Términos y riesgos",
  4: "Tu billetera",
  5: "Todo listo",
};

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "No pudimos guardar este paso. Inténtalo otra vez.";
}

function prepareDraft(userId: string, versions: LegalVersions, hasWallet: boolean): OnboardingDraft {
  const loaded = loadDraft(userId, versions) ?? emptyDraft(userId);
  if (readBrowserCookie(MOCK_ONBOARDING_COOKIE) === ONBOARDING_DONE) {
    return { ...loaded, step: 5, finished: true, walletReady: loaded.walletReady || hasWallet };
  }
  // Sin la cookie, cerrar sesión no completa el ingreso: hay que volver a guardar.
  if (!hasWallet && loaded.walletReady) {
    return clampDraft({ ...loaded, walletReady: false, finished: false }, versions);
  }
  if (loaded.finished) return { ...loaded, finished: false };
  return loaded;
}

let draftCacheKey = "";
let draftCache: OnboardingDraft | null = null;

function subscribeDraft(): () => void {
  return () => {};
}

function draftSnapshot(userId: string | null, versions: LegalVersions, hasWallet: boolean): OnboardingDraft | null {
  if (!userId) return null;
  const key = `${userId}|${versionKey(versions)}|${hasWallet ? 1 : 0}|${readBrowserCookie(MOCK_ONBOARDING_COOKIE) ?? ""}|${readDraftRaw()}`;
  if (key === draftCacheKey && draftCache) return draftCache;
  draftCacheKey = key;
  draftCache = prepareDraft(userId, versions, hasWallet);
  return draftCache;
}

function draftServerSnapshot(): OnboardingDraft | null {
  return null;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <Card className="w-full max-w-md shadow-float">
      <BrandLink />
      {children}
    </Card>
  );
}

function LoadingCard() {
  return (
    <Shell>
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Cargando el registro</span>
        <Skeleton className="mt-6 h-3 w-24" />
        <Skeleton className="mt-4 h-8 w-4/5" />
        <Skeleton className="mt-4 h-11 w-full" />
      </div>
    </Shell>
  );
}

export function OnboardingWizard({
  terminosVersion,
  privacidadVersion,
  riesgosVersion,
  returnTo,
  declarationVersion,
  demoForBlocked = false,
}: {
  terminosVersion: string;
  privacidadVersion: string;
  riesgosVersion: string;
  returnTo: string | null;
  declarationVersion: string;
  demoForBlocked?: boolean;
}) {
  const { status, user } = useSession();
  const versions = useMemo<LegalVersions>(
    () => ({ terminos: terminosVersion, privacidad: privacidadVersion, riesgos: riesgosVersion }),
    [terminosVersion, privacidadVersion, riesgosVersion],
  );
  const userId = status === "authenticated" ? (user?.id ?? null) : null;
  const walletAddress = status === "authenticated" ? (user?.walletAddress ?? null) : null;
  const hasWallet = Boolean(walletAddress);
  const initial = useSyncExternalStore(
    subscribeDraft,
    () => draftSnapshot(userId, versions, hasWallet),
    draftServerSnapshot,
  );

  if (status === "loading") return <LoadingCard />;

  if (status !== "authenticated" || !userId || !initial) {
    return (
      <Shell>
        <h1 className="mt-6 text-3xl text-balance">Necesitas iniciar sesión</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-body">El registro continúa después del ingreso.</p>
        <div className="mt-6">
          <Link href="/app/ingresar" className={buttonClasses({ size: "lg", className: "w-full" })}>
            Ingresar
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <WizardBody
      key={userId}
      initial={initial}
      userId={userId}
      versions={versions}
      walletAddress={walletAddress}
      returnTo={returnTo}
      declarationVersion={declarationVersion}
      demoForBlocked={demoForBlocked}
    />
  );
}

function WizardBody({
  initial,
  userId,
  versions,
  walletAddress,
  returnTo,
  declarationVersion,
  demoForBlocked,
}: {
  initial: OnboardingDraft;
  userId: string;
  versions: LegalVersions;
  walletAddress: string | null;
  returnTo: string | null;
  declarationVersion: string;
  demoForBlocked: boolean;
}) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipFocus = useRef(true);
  const lock = useRef(false);
  const countries = useMemo(() => countryOptions(), []);
  const [step, setStep] = useState<OnboardingStep>(initial.step);
  const [consentsSaved, setConsentsSaved] = useState(initial.consentsSaved);
  const [consentVersionKey, setConsentVersionKey] = useState<string | null>(initial.consentVersionKey);
  const [walletReady, setWalletReady] = useState(initial.walletReady && Boolean(walletAddress));
  const [walletFailed, setWalletFailed] = useState(false);
  const [walletAttempt, setWalletAttempt] = useState(0);
  const [finished, setFinished] = useState(initial.finished);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyHref, setBusyHref] = useState<string | null>(null);

  const { control, setValue, trigger, getValues } = useForm<
    OnboardingInput,
    unknown,
    OnboardingOutput
  >({
    resolver: zodResolver(onboardingSchema),
    defaultValues: formValues(initial),
    shouldUnregister: false,
    mode: "onSubmit",
  });

  const country = useWatch({ control, name: "country" });
  const nationality = useWatch({ control, name: "nationality" });
  const notUsPerson = useWatch({ control, name: "notUsPerson" });
  const terminos = useWatch({ control, name: "terminos" });
  const privacidad = useWatch({ control, name: "privacidad" });
  const riesgos = useWatch({ control, name: "riesgos" });
  const unavailable =
    step === 1 && (isOperationBlocked(country) || isOperationBlocked(nationality));
  const consentsCurrent =
    consentsSaved &&
    terminos &&
    privacidad &&
    riesgos &&
    consentVersionKey === versionKey(versions);
  const walletListed = walletReady && Boolean(walletAddress);

  useEffect(() => {
    saveDraft({
      v: 1,
      userId,
      step,
      country,
      nationality,
      notUsPerson,
      terminos,
      privacidad,
      riesgos,
      consentsSaved: consentsCurrent,
      consentVersionKey: consentsCurrent ? versionKey(versions) : null,
      walletReady: walletListed,
      finished,
    });
  }, [
    userId,
    step,
    country,
    nationality,
    notUsPerson,
    terminos,
    privacidad,
    riesgos,
    consentsCurrent,
    versions,
    walletListed,
    finished,
  ]);

  useEffect(() => {
    if (skipFocus.current) {
      skipFocus.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, unavailable]);

  useEffect(() => {
    if (step !== 4 || walletListed || !walletAddress) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setWalletReady(true), reduced ? 0 : CREATE_MS);
    return () => window.clearTimeout(timer);
  }, [step, walletListed, walletAddress]);

  useEffect(() => {
    if (step !== 4 || walletListed || walletAddress) return;
    const timer = window.setTimeout(() => setWalletFailed(true), WALLET_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [step, walletListed, walletAddress, walletAttempt]);

  function goBack() {
    if (busy || step === 1 || finished) return;
    setFormError(null);
    setStep((current) => (current > 1 ? ((current - 1) as OnboardingStep) : current));
  }

  async function postConsents(force = false): Promise<boolean> {
    if (!force && consentsCurrent) return true;
    if (!versions.terminos || !versions.privacidad || !versions.riesgos) {
      setFormError("Falta la versión de un documento.");
      return false;
    }
    try {
      await Promise.all([
        addConsent({ doc: "terminos", version: versions.terminos }),
        addConsent({ doc: "privacidad", version: versions.privacidad }),
        addConsent({ doc: "riesgos", version: versions.riesgos }),
      ]);
      setConsentsSaved(true);
      setConsentVersionKey(versionKey(versions));
      return true;
    } catch (error) {
      setFormError(messageFrom(error));
      return false;
    }
  }

  async function saveConsents(): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setFormError(null);
    try {
      return await postConsents();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function onContinue() {
    if (busy || unavailable) return;
    setFormError(null);
    if (step === 1) {
      const ok = await trigger(["country", "nationality"]);
      if (!ok) return;
      const picked = getValues();
      if (isOperationBlocked(picked.country) || isOperationBlocked(picked.nationality)) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await trigger("notUsPerson");
      if (!ok) return;
      setStep(3);
      return;
    }
    if (step === 3) {
      const ok = await trigger(["terminos", "privacidad", "riesgos"]);
      if (!ok) return;
      const saved = await saveConsents();
      if (!saved) return;
      setStep(4);
      return;
    }
    if (step === 4) {
      if (!walletListed) return;
      setStep(5);
    }
  }

  async function finish(href: "/app" | "/app/billetera/depositar") {
    if (lock.current) return;
    lock.current = true;
    setFormError(null);
    setBusyHref(href);
    try {
      if (!finished) {
        const parsed = onboardingSchema.safeParse(getValues());
        if (
          !parsed.success ||
          isOperationBlocked(parsed.data.country) ||
          isOperationBlocked(parsed.data.nationality) ||
          !walletListed
        ) {
          setFormError("Faltan datos del registro. Vuelve a los pasos anteriores.");
          setBusyHref(null);
          return;
        }
        const saved = await postConsents(true);
        if (!saved) {
          setBusyHref(null);
          return;
        }
        await updateMe({
          country: parsed.data.country,
          isUsPerson: false,
          onboardingCompleted: true,
          residenceCountry: parsed.data.country,
          nationalityCountry: parsed.data.nationality,
          usPersonDeclarationVersion: declarationVersion,
        });
        writeClientCookie(MOCK_ONBOARDING_COOKIE, ONBOARDING_DONE);
        setFinished(true);
      } else if (readBrowserCookie(MOCK_ONBOARDING_COOKIE) !== ONBOARDING_DONE) {
        writeClientCookie(MOCK_ONBOARDING_COOKIE, ONBOARDING_DONE);
      }
      router.push(href === "/app" ? (returnTo ?? "/app") : href);
      router.refresh();
    } catch (error) {
      setFormError(messageFrom(error));
      setBusyHref(null);
    } finally {
      lock.current = false;
    }
  }

  function leaveBlocked() {
    if (demoForBlocked) {
      writeClientCookie(MOCK_ONBOARDING_COOKIE, ONBOARDING_DONE);
      router.push(returnTo ?? "/app");
      router.refresh();
      return;
    }
    router.push("/bloqueado?motivo=residencia");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 5) return;
    void onContinue();
  }

  const title = unavailable ? "No disponible" : TITLES[step];
  const walletPhase = walletListed ? "ready" : walletFailed ? "error" : "creating";
  const canGoBack = step > 1 && !finished && !unavailable;

  return (
    <Shell>
      <StepProgress step={step} />
      <form className="mt-6" onSubmit={onSubmit} noValidate>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl text-balance focus:shadow-none">
          {title}
        </h1>
        {step === 1 && !unavailable ? (
          <>
            <Controller
              name="country"
              control={control}
              render={({ field, fieldState }) => (
                <CountryFields
                  options={countries}
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="nationality"
              control={control}
              render={({ field, fieldState }) => (
                <NationalityField
                  options={countries}
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          </>
        ) : null}
        {unavailable ? (
          <UnavailableStep
            onLeave={leaveBlocked}
            onChooseAgain={() => {
              setValue("country", "", { shouldValidate: false });
              setValue("nationality", "", { shouldValidate: false });
              setFormError(null);
            }}
          />
        ) : null}
        {step === 2 ? (
          <Controller
            name="notUsPerson"
            control={control}
            render={({ field, fieldState }) => (
              <DeclarationStep
                checked={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                error={fieldState.error?.message}
                onDeclareYes={leaveBlocked}
              />
            )}
          />
        ) : null}
        {step === 3 ? (
          <DocumentsStep
            control={control}
            versions={versions}
            onReject={() => {
              setConsentsSaved(false);
              setConsentVersionKey(null);
            }}
          />
        ) : null}
        {step === 4 ? (
          <WalletStep
            phase={walletPhase}
            address={walletAddress}
            onRetry={() => {
              setWalletFailed(false);
              setWalletAttempt((attempt) => attempt + 1);
            }}
          />
        ) : null}
        {step === 5 ? (
          <DoneStep
            busyHref={busyHref}
            onDeposit={() => void finish("/app/billetera/depositar")}
            onExplore={() => void finish("/app")}
          />
        ) : null}
        {formError ? (
          <p className="mt-4 text-sm text-down" role="alert">
            {formError}
          </p>
        ) : null}
        {step < 5 && !unavailable ? (
          <div className="mt-6">
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={step === 4 && !walletListed}>
              Continuar
            </Button>
          </div>
        ) : null}
        {canGoBack ? (
          <div className="mt-3">
            <Button type="button" variant="ghost" size="lg" className="w-full" onClick={goBack} disabled={busy}>
              Atrás
            </Button>
          </div>
        ) : null}
        <div className={step < 5 && !unavailable ? "mt-3" : "mt-6"}>
          <LogoutButton variant="ghost" size="md" className="w-full" />
        </div>
      </form>
    </Shell>
  );
}
