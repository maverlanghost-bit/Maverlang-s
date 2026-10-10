"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";

import { countryOptions } from "@/app/(platform)/app/onboarding/countries";
import { LogoutButton } from "@/app/(platform)/app/onboarding/logout-button";
import {
  BrandLink,
  CheckField,
  CountryFields,
  DeclarationStep,
  FieldError,
  NationalityField,
  RISK_POINTS,
  UnavailableStep,
} from "@/app/(platform)/app/onboarding/panel";
import { Button, buttonClasses } from "@/components/ui/button";
import { isOperationBlocked } from "@/config/compliance";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, addConsent, updateMe } from "@/lib/api/client";
import { useT } from "@/lib/hooks/use-t";
import { useSession } from "@/lib/auth";
import { writeClientCookie } from "@/lib/auth/browser-cookies";
import { MOCK_ONBOARDING_COOKIE, ONBOARDING_DONE } from "@/lib/auth/cookies";
import { authMode, clientAuthModeInput } from "@/lib/auth/mode";
import { ingresarPath } from "@/lib/auth/paths";
import { publishRegistroMetadata, resendRegistro, signUpDemo, signUpRegistro } from "@/lib/auth/registro-client";
import {
  DEMO_LEGAL_MESSAGE,
  formatRut,
  normalizePhone,
  registroDemoSchema,
  registroSchemaAt,
  type RegistroDemoValues,
  type RegistroValues,
  type RegistroVersions,
} from "@/lib/auth/registro-schema";
import { PROFILE_MIGRATION_MESSAGE, isProfileMigrationMessage } from "@/lib/profile/migration";

type Step = 1 | 2 | 3;
type Mode = "alta" | "completar";
type RegistroControl = Control<RegistroValues>;

const EMPTY: RegistroValues = {
  email: "",
  password: "",
  passwordConfirm: "",
  nombre: "",
  pais: "",
  nacionalidad: "",
  rut: "",
  fechaNacimiento: "",
  telefono: "",
  notUsPerson: false,
  terminos: false,
  privacidad: false,
  riesgos: false,
};

const TITLES: Record<Step, string> = {
  1: "Crea tu cuenta",
  2: "Tus datos",
  3: "Términos y riesgos",
};

function messageFrom(error: unknown): string {
  if (isProfileMigrationMessage(error)) return PROFILE_MIGRATION_MESSAGE;
  if (error instanceof ApiError) return error.message;
  return "No pudimos guardar este paso. Inténtalo otra vez.";
}

function passwordLabel(password: string): string | null {
  if (!password) return null;
  if (password.length < 8) return "Muy corta";
  if (password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password)) return "Fuerte";
  return "Aceptable";
}

function maxBirth(today: Date): string {
  const limit = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const month = String(limit.getMonth() + 1).padStart(2, "0");
  const day = String(limit.getDate()).padStart(2, "0");
  return `${limit.getFullYear()}-${month}-${day}`;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <Card className="w-full max-w-md shadow-float">
      <BrandLink />
      {children}
    </Card>
  );
}

function StepBar({ index, total }: { index: number; total: number }) {
  const current = index + 1;
  return (
    <div className="mt-6">
      <p className="label">
        Paso {current} de {total}
      </p>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`Paso ${current} de ${total}`}
      >
        <div
          className="h-full rounded-full bg-fg transition-[width] duration-[240ms] ease-spring"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  error,
  hint,
  ...props
}: { id: string; label: string; error?: string; hint?: string } & ComponentProps<"input">) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <Input
        id={id}
        className="mt-2"
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="mt-2 text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function MailScreen({ email, next }: { email: string; next: string | null }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [left, setLeft] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const enter = ingresarPath(next ?? "/app");

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);

  async function resend() {
    if (left > 0 || busy) return;
    setBusy(true);
    setError(null);
    const message = await resendRegistro(email, next);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setLeft(60);
  }

  return (
    <Shell>
      <h1 ref={headingRef} tabIndex={-1} className="mt-6 text-3xl text-balance focus:shadow-none">
        Revisa tu correo
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-body">
        Te enviamos un enlace a <span className="font-medium text-fg">{email}</span>. Ábrelo para confirmar la cuenta.
      </p>
      {error ? (
        <p className="mt-4 text-sm text-down" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-6">
        <Button type="button" size="lg" className="w-full" loading={busy} disabled={left > 0} onClick={() => void resend()}>
          {left > 0 ? `Reenviar en ${left} s` : "Reenviar correo"}
        </Button>
      </div>
      <p className="mt-4 text-center text-sm text-fg-muted">
        <Link href={enter} className="inline-flex min-h-11 items-center justify-center rounded-sm px-2 font-medium text-fg underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20">
          Ingresar
        </Link>
      </p>
    </Shell>
  );
}

function NeedSession() {
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

function DocCheck({
  control,
  name,
  version,
  href,
  label,
}: {
  control: RegistroControl;
  name: "terminos" | "privacidad" | "riesgos";
  version: string;
  href: string;
  label: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <CheckField
          checked={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          inputRef={field.ref}
          error={fieldState.error?.message}
          label={
            <>
              Acepto la versión {version} de{" "}
              <Link
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-medium underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
              >
                {label}
              </Link>
              .
            </>
          }
        />
      )}
    />
  );
}

export function RegistroWizard({
  mode,
  next,
  versions,
  declarationVersion,
  demoForBlocked = false,
}: {
  mode: Mode;
  next: string | null;
  versions: RegistroVersions;
  declarationVersion?: string;
  demoForBlocked?: boolean;
}) {
  const { status, login } = useSession();
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  if (sentEmail) return <MailScreen email={sentEmail} next={next} />;
  if (mode === "alta") return <DemoRegistroForm next={next} versions={versions} onSent={setSentEmail} login={login} />;
  if (status === "loading") return <LoadingCard />;
  if (status !== "authenticated") return <NeedSession />;

  return (
    <RegistroForm
      mode={mode}
      next={next}
      versions={versions}
      declarationVersion={declarationVersion}
      demoForBlocked={demoForBlocked}
      onSent={setSentEmail}
      login={login}
    />
  );
}

const DEMO_EMPTY: RegistroDemoValues = {
  email: "",
  password: "",
  passwordConfirm: "",
  aceptaLegal: false,
};

/**
 * Alta demo mínima (M43): un solo paso con correo, contraseña,
 * repetir contraseña y el checkbox legal obligatorio.
 * Sin RUT, teléfono, nombre, país ni fecha.
 */
function DemoRegistroForm({
  next,
  versions,
  onSent,
  login,
}: {
  next: string | null;
  versions: RegistroVersions;
  onSent: (email: string) => void;
  login: (method?: "email" | "google") => Promise<void>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useT();
  const lock = useRef(false);
  const schema = useMemo(() => registroDemoSchema(), []);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    control,
    register,
    getValues,
    formState: { errors },
  } = useForm<RegistroDemoValues>({
    resolver: zodResolver(schema),
    defaultValues: DEMO_EMPTY,
    mode: "onSubmit",
  });

  const password = useWatch({ control, name: "password" });
  const strength = passwordLabel(password ?? "");
  const enter = ingresarPath(next ?? "/app");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || busy) return;
    lock.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const parsed = schema.safeParse(getValues());
      if (!parsed.success) {
        const legal = parsed.error.issues.find((issue) => issue.path[0] === "aceptaLegal");
        setFormError(legal?.message ?? "Revisa los datos del formulario.");
        return;
      }
      const values = parsed.data;
      if (!values.aceptaLegal) {
        setFormError(DEMO_LEGAL_MESSAGE);
        return;
      }
      if (authMode(clientAuthModeInput()) !== "supabase") {
        await login("email");
        writeClientCookie(MOCK_ONBOARDING_COOKIE, ONBOARDING_DONE);
        router.push(next ?? "/app");
        router.refresh();
        return;
      }
      if (!versions.terminos || !versions.privacidad) {
        setFormError("Falta la versión de un documento.");
        return;
      }
      const result = await signUpDemo(
        values,
        { terminos: versions.terminos, privacidad: versions.privacidad },
        next,
      );
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      if (result.destination.kind === "email") {
        onSent(result.email);
        return;
      }
      toast({ title: t.auth.accountCreated, tone: "up" });
      router.refresh();
      router.push(result.destination.path);
    } catch (error) {
      setFormError(messageFrom(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form className="mt-6" onSubmit={(event) => void onSubmit(event)} noValidate>
        <h1 className="text-3xl text-balance">Crea tu cuenta demo</h1>
        <TextField
          id="registro-email"
          label="Correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          id="registro-password"
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          hint={strength ? `Seguridad: ${strength}. Mínimo 8 caracteres. Recomendamos 12 o más.` : "Mínimo 8 caracteres. Recomendamos 12 o más."}
          error={errors.password?.message}
          {...register("password")}
        />
        <TextField
          id="registro-password-confirm"
          label="Repetir contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.passwordConfirm?.message}
          {...register("passwordConfirm")}
        />
        <div className="mt-4">
          <Controller
            name="aceptaLegal"
            control={control}
            render={({ field, fieldState }) => (
              <CheckField
                checked={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                error={fieldState.error?.message}
                label={
                  <>
                    Acepto los{" "}
                    <Link
                      href="/legal/terminos"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm font-medium underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                    >
                      Términos y Condiciones
                    </Link>{" "}
                    y la{" "}
                    <Link
                      href="/legal/privacidad"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm font-medium underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                    >
                      Política de Privacidad
                    </Link>
                    .
                  </>
                }
              />
            )}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">Borrador. [REVISIÓN ABOGADO]</p>
        {formError ? (
          <p className="mt-4 text-sm text-down" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="mt-6">
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {t.auth.createDemoAccount}
          </Button>
        </div>
        <p className="mt-4 text-center text-sm text-fg-muted">
          <Link href={enter} className="inline-flex min-h-11 items-center justify-center rounded-sm px-2 font-medium text-fg underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20">
            Ya tengo cuenta
          </Link>
        </p>
      </form>
    </Shell>
  );
}

function RegistroForm({
  mode,
  next,
  versions,
  declarationVersion,
  demoForBlocked,
  onSent,
  login,
}: {
  mode: Mode;
  next: string | null;
  versions: RegistroVersions;
  declarationVersion?: string;
  demoForBlocked: boolean;
  onSent: (email: string) => void;
  login: (method?: "email" | "google") => Promise<void>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useT();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipFocus = useRef(true);
  const lock = useRef(false);
  const today = useMemo(() => new Date(), []);
  const schema = useMemo(() => registroSchemaAt(today, mode === "alta"), [today, mode]);
  const countries = useMemo(() => countryOptions(), []);
  const birthLimit = useMemo(() => maxBirth(today), [today]);
  const steps: Step[] = mode === "alta" ? [1, 2, 3] : [2, 3];
  const [step, setStep] = useState<Step>(steps[0] ?? 2);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    control,
    register,
    trigger,
    getValues,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<RegistroValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
    shouldUnregister: false,
    mode: "onSubmit",
  });

  const pais = useWatch({ control, name: "pais" });
  const nacionalidad = useWatch({ control, name: "nacionalidad" });
  const password = useWatch({ control, name: "password" });
  const unavailable = step === 2 && (isOperationBlocked(pais) || isOperationBlocked(nacionalidad));
  const stepIndex = Math.max(0, steps.indexOf(step));
  const strength = passwordLabel(password ?? "");

  useEffect(() => {
    if (skipFocus.current) {
      skipFocus.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, unavailable]);

  function goBack() {
    if (busy) return;
    const previous = steps[steps.indexOf(step) - 1];
    if (!previous) return;
    setFormError(null);
    setStep(previous);
  }

  function leaveBlocked() {
    if (demoForBlocked) {
      router.push(next ?? "/app");
      router.refresh();
      return;
    }
    router.push("/bloqueado?motivo=residencia");
  }

  async function finish() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const parsed = schema.safeParse(getValues());
      if (!parsed.success) {
        setFormError("Faltan datos del registro. Vuelve a los pasos anteriores.");
        return;
      }
      const values = parsed.data;
      if (isOperationBlocked(values.pais) || isOperationBlocked(values.nacionalidad)) {
        leaveBlocked();
        return;
      }
      if (mode === "alta" && authMode(clientAuthModeInput()) !== "supabase") {
        await login("email");
        writeClientCookie(MOCK_ONBOARDING_COOKIE, ONBOARDING_DONE);
        router.push(next ?? "/app");
        router.refresh();
        return;
      }
      if (mode === "alta") {
        const result = await signUpRegistro(
          values,
          {
            ...versions,
            usPersonDeclarationVersion: declarationVersion ?? versions.usPersonDeclarationVersion,
          },
          next,
        );
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        if (result.destination.kind === "email") {
          onSent(result.email);
          return;
        }
        toast({ title: t.auth.accountCreated, tone: "up" });
        router.refresh();
        router.push(result.destination.path);
        return;
      }
      if (!versions.terminos || !versions.privacidad || !versions.riesgos) {
        setFormError("Falta la versión de un documento.");
        return;
      }
      await Promise.all([
        addConsent({ doc: "terminos", version: versions.terminos }),
        addConsent({ doc: "privacidad", version: versions.privacidad }),
        addConsent({ doc: "riesgos", version: versions.riesgos }),
      ]);
      await updateMe({
        displayName: values.nombre,
        country: values.pais,
        isUsPerson: false,
        onboardingCompleted: true,
        rut: values.pais === "CL" ? formatRut(values.rut) : null,
        birthDate: values.fechaNacimiento,
        phone: normalizePhone(values.telefono),
        residenceCountry: values.pais,
        nationalityCountry: values.nacionalidad,
        usPersonDeclarationVersion: declarationVersion ?? versions.usPersonDeclarationVersion,
      });
      const metaError = await publishRegistroMetadata(values, {
        ...versions,
        usPersonDeclarationVersion: declarationVersion ?? versions.usPersonDeclarationVersion,
      });
      if (metaError) {
        setFormError(metaError);
        return;
      }
      router.push(next ?? "/app");
      router.refresh();
    } catch (error) {
      setFormError(messageFrom(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function onContinue() {
    if (busy || unavailable) return;
    setFormError(null);
    const names =
      step === 1
        ? (["email", "password", "passwordConfirm"] as const)
        : step === 2
          ? (["nombre", "pais", "nacionalidad", "rut", "fechaNacimiento", "telefono", "notUsPerson"] as const)
          : (["terminos", "privacidad", "riesgos"] as const);
    const ok = await trigger([...names]);
    if (!ok) return;
    clearErrors();
    if (step < 3) {
      setStep((step + 1) as Step);
      return;
    }
    await finish();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onContinue();
  }

  const title = unavailable ? "No disponible" : TITLES[step];
  const canGoBack = steps.indexOf(step) > 0 && !unavailable;
  const enter = ingresarPath(next ?? "/app");

  return (
    <Shell>
      <StepBar index={stepIndex} total={steps.length} />
      <form className="mt-6" onSubmit={onSubmit} noValidate>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl text-balance focus:shadow-none">
          {title}
        </h1>
        {step === 1 ? (
          <div>
            <TextField
              id="registro-email"
              label="Correo"
              type="email"
              autoComplete="email"
              inputMode="email"
              error={errors.email?.message}
              {...register("email")}
            />
            <TextField
              id="registro-password"
              label="Contraseña"
              type="password"
              autoComplete="new-password"
              hint={strength ? `Seguridad: ${strength}` : undefined}
              error={errors.password?.message}
              {...register("password")}
            />
            <TextField
              id="registro-password-confirm"
              label="Confirmar contraseña"
              type="password"
              autoComplete="new-password"
              error={errors.passwordConfirm?.message}
              {...register("passwordConfirm")}
            />
            <p className="mt-4 text-center text-sm text-fg-muted">
              <Link href={enter} className="inline-flex min-h-11 items-center justify-center rounded-sm px-2 font-medium text-fg underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20">
                Ya tengo cuenta
              </Link>
            </p>
          </div>
        ) : null}
        {step === 2 && !unavailable ? (
          <div>
            <TextField
              id="registro-nombre"
              label="Nombre completo"
              autoComplete="name"
              maxLength={80}
              error={errors.nombre?.message}
              {...register("nombre")}
            />
            <Controller
              name="pais"
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
              name="nacionalidad"
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
            {pais === "CL" ? (
              <Controller
                name="rut"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    id="registro-rut"
                    label="RUT"
                    autoComplete="off"
                    placeholder="12.345.678-5"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={() => {
                      field.onBlur();
                      const formatted = formatRut(field.value);
                      if (formatted !== field.value) setValue("rut", formatted, { shouldValidate: false });
                    }}
                    ref={field.ref}
                    error={fieldState.error?.message}
                  />
                )}
              />
            ) : null}
            <TextField
              id="registro-nacimiento"
              label="Fecha de nacimiento"
              type="date"
              autoComplete="bday"
              max={birthLimit}
              error={errors.fechaNacimiento?.message}
              {...register("fechaNacimiento")}
            />
            <TextField
              id="registro-telefono"
              label="Teléfono"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+56912345678"
              error={errors.telefono?.message}
              {...register("telefono")}
            />
            <div className="mt-4">
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
            </div>
          </div>
        ) : null}
        {unavailable ? (
          <UnavailableStep
            onLeave={leaveBlocked}
            onChooseAgain={() => {
              setValue("pais", "", { shouldValidate: false });
              setValue("nacionalidad", "", { shouldValidate: false });
              setFormError(null);
            }}
          />
        ) : null}
        {step === 3 ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-fg-body">
              Resumen de riesgos. El texto completo está en cada documento. Al continuar queda registrada la versión que
              aceptas.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-fg-body">
              {RISK_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="flex flex-col gap-3">
              <DocCheck control={control} name="terminos" version={versions.terminos} href="/legal/terminos" label="Términos y condiciones" />
              <DocCheck control={control} name="privacidad" version={versions.privacidad} href="/legal/privacidad" label="Política de privacidad" />
              <DocCheck control={control} name="riesgos" version={versions.riesgos} href="/legal/riesgos" label="Divulgación de riesgos" />
            </div>
            <p className="text-sm leading-relaxed text-fg-muted">Borrador. [REVISIÓN ABOGADO]</p>
          </div>
        ) : null}
        {formError ? (
          <p className="mt-4 text-sm text-down" role="alert">
            {formError}
          </p>
        ) : null}
        {!unavailable ? (
          <div className="mt-6">
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {step === 3 ? (mode === "alta" ? "Crear cuenta" : "Guardar") : "Continuar"}
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
        {mode === "completar" ? (
          <div className={unavailable ? "mt-6" : "mt-3"}>
            <LogoutButton variant="ghost" size="md" className="w-full" />
          </div>
        ) : null}
      </form>
    </Shell>
  );
}
