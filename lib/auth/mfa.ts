"use client";

import { site } from "@/config/site";
import { classifyLoginError } from "@/lib/auth/login-errors";
import { safeNextPath } from "@/lib/auth/paths";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Segundo paso TOTP. El gate deja pasar esta ruta con la sesión `aal1`. */
export const MFA_VERIFY_PATH = "/app/ingresar/verificar";

const BAD_CODE = "Código incorrecto o vencido. Intenta con el código nuevo de tu app";

const MESSAGES = {
  bad_code: BAD_CODE,
  network: "No pudimos conectar. Revisa tu red e inténtalo de nuevo.",
  rate: "Demasiados intentos. Espera un rato e inténtalo de nuevo.",
  unavailable: "La verificación en dos pasos no está disponible en este entorno.",
  aal: "Confirma el código de tu app antes de desactivar.",
  generic: "No pudimos completar la acción. Inténtalo otra vez.",
} as const;

export type MfaErrorCode = keyof typeof MESSAGES;

export type MfaFailure = { ok: false; code: MfaErrorCode; message: string };

export type TotpFactor = { id: string; friendlyName: string | null };

export type TotpEnrollment = { factorId: string; qrCode: string; secret: string };

type MfaError = { message?: string; code?: string; status?: number; name?: string };

type MfaResult<T> = { data: T | null; error: MfaError | null };

type ListedFactor = { id: string; factor_type: string; status: string; friendly_name?: string };

type MfaBrowser = {
  auth: {
    mfa: {
      enroll: (params: {
        factorType: "totp";
        friendlyName?: string;
        issuer?: string;
      }) => Promise<MfaResult<{ id: string; totp?: { qr_code?: string; secret?: string } }>>;
      challenge: (params: { factorId: string }) => Promise<MfaResult<{ id: string }>>;
      verify: (params: { factorId: string; challengeId: string; code: string }) => Promise<MfaResult<unknown>>;
      listFactors: () => Promise<MfaResult<{ all?: ListedFactor[]; totp?: ListedFactor[] }>>;
      unenroll: (params: { factorId: string }) => Promise<MfaResult<{ id: string }>>;
      getAuthenticatorAssuranceLevel: () => Promise<
        MfaResult<{ currentLevel: string | null; nextLevel: string | null }>
      >;
    };
  };
};

let override: MfaBrowser | null | undefined;

/** Solo tests. `undefined` vuelve al cliente real. */
export function __setMfaClientForTests(client: MfaBrowser | null | undefined): void {
  override = client;
}

function getClient(): MfaBrowser | null {
  if (override !== undefined) return override;
  const client = createSupabaseBrowserClient();
  if (!client) return null;
  return client as unknown as MfaBrowser;
}

export function mfaErrorMessage(code: MfaErrorCode): string {
  return MESSAGES[code];
}

function failure(code: MfaErrorCode): MfaFailure {
  return { ok: false, code, message: MESSAGES[code] };
}

function failureFrom(error: MfaError): MfaFailure {
  const kind = classifyLoginError(error);
  if (kind === "rate") return failure("rate");
  if (kind === "network") return failure("network");
  const blob = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
  if (blob.includes("insufficient_aal")) return failure("aal");
  if (
    blob.includes("mfa_verification") ||
    blob.includes("invalid totp") ||
    blob.includes("invalid code") ||
    blob.includes("otp_expired") ||
    blob.includes("mfa_challenge_expired") ||
    (blob.includes("challenge") && blob.includes("expired")) ||
    (error.status === 422 && blob.includes("code"))
  ) {
    return failure("bad_code");
  }
  return failure("generic");
}

/** Seis dígitos, sin letras. El espacio de un pegado se ignora. */
export function isTotpCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code.trim());
}

/**
 * Destino tras el código. Igual que el ingreso: sólo una ruta interna.
 * `https://…` y `//…` se ignoran y vuelven a `/app`.
 */
export function mfaReturnPath(next: string | null | undefined): string {
  return safeNextPath(next) ?? "/app";
}

export function mfaVerifyPath(dest: string): string {
  const params = new URLSearchParams();
  params.set("next", mfaReturnPath(dest));
  return `${MFA_VERIFY_PATH}?${params.toString()}`;
}

/**
 * El cliente antepone `data:` sin codificar el SVG. Un `#` del dibujo corta la imagen.
 * Si no hay SVG usable, queda vacío: la pantalla muestra sólo el secreto.
 */
export function totpQrSrc(qrCode: string): string {
  const value = qrCode.trim();
  if (!value) return "";
  const comma = value.indexOf(",");
  const payload = value.startsWith("data:") && comma !== -1 ? value.slice(comma + 1) : value;
  if (payload.includes("<")) return `data:image/svg+xml;utf-8,${encodeURIComponent(payload)}`;
  if (value.startsWith("data:")) return value;
  return "";
}

/** `true` sólo si falta el segundo factor: la sesión está en `aal1` y el siguiente nivel es `aal2`. */
export async function needsMfaStep(): Promise<boolean> {
  try {
    const supabase = getClient();
    if (!supabase) return false;
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.nextLevel === "aal2" && data.currentLevel === "aal1";
  } catch {
    return false;
  }
}

export async function listTotp(): Promise<{ ok: true; factors: TotpFactor[] } | MfaFailure> {
  try {
    const supabase = getClient();
    if (!supabase) return failure("unavailable");
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) return error ? failureFrom(error) : failure("generic");
    const verified = data.totp ?? (data.all ?? []).filter((factor) => factor.factor_type === "totp" && factor.status === "verified");
    return {
      ok: true,
      factors: verified.map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name ?? null,
      })),
    };
  } catch (error) {
    return error instanceof Error ? failureFrom(error) : failure("network");
  }
}

export async function enrollTotp(): Promise<{ ok: true; enrollment: TotpEnrollment } | MfaFailure> {
  try {
    const supabase = getClient();
    if (!supabase) return failure("unavailable");
    const listed = await supabase.auth.mfa.listFactors();
    if (listed.error || !listed.data) return listed.error ? failureFrom(listed.error) : failure("generic");
    for (const factor of listed.data.all ?? []) {
      if (factor.factor_type !== "totp" || factor.status === "verified") continue;
      const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) return failureFrom(removed.error);
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: site.name,
      issuer: site.name,
    });
    if (error || !data?.id || !data.totp?.secret) return error ? failureFrom(error) : failure("generic");
    return {
      ok: true,
      enrollment: {
        factorId: data.id,
        qrCode: totpQrSrc(data.totp.qr_code ?? ""),
        secret: data.totp.secret,
      },
    };
  } catch (error) {
    return error instanceof Error ? failureFrom(error) : failure("network");
  }
}

export async function verifyTotp(factorId: string, code: string): Promise<{ ok: true } | MfaFailure> {
  if (!isTotpCode(code)) return failure("bad_code");
  if (!factorId) return failure("generic");
  try {
    const supabase = getClient();
    if (!supabase) return failure("unavailable");
    const digits = code.trim();
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data?.id) return challenge.error ? failureFrom(challenge.error) : failure("generic");
    const verified = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: digits,
    });
    if (verified.error || !verified.data) return verified.error ? failureFrom(verified.error) : failure("generic");
    return { ok: true };
  } catch (error) {
    return error instanceof Error ? failureFrom(error) : failure("network");
  }
}

export async function removeTotp(factorId: string): Promise<{ ok: true } | MfaFailure> {
  if (!factorId) return failure("generic");
  try {
    const supabase = getClient();
    if (!supabase) return failure("unavailable");
    const { data, error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error || !data) return error ? failureFrom(error) : failure("generic");
    return { ok: true };
  } catch (error) {
    return error instanceof Error ? failureFrom(error) : failure("network");
  }
}
