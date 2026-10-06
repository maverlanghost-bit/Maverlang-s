import { recoveryRedirectTo } from "@/lib/auth/callback-next";
import { classifyLoginError, loginErrorMessage, type LoginErrorCode } from "@/lib/auth/login-errors";
import { claimsDemoReady, claimsOnboarded } from "@/lib/auth/registro-schema";
import { registroRedirectTo } from "@/lib/auth/registro-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export { recoveryRedirectTo };

export type SignInResult = { ok: true; onboarded: boolean; demoReady: boolean } | { ok: false; code: LoginErrorCode };

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return { ok: false, code: "network" };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, code: classifyLoginError(error) };
    const meta = data.user ? { user_metadata: data.user.user_metadata } : null;
    return { ok: true, onboarded: claimsOnboarded(meta), demoReady: claimsDemoReady(meta) };
  } catch (error) {
    const code = error instanceof Error ? classifyLoginError(error) : "network";
    return { ok: false, code: code === "unknown" ? "network" : code };
  }
}

/** Null si el correo salió. Si no, el mensaje en español. */
export async function resendConfirmation(email: string, next: string | null): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return loginErrorMessage("network");
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: registroRedirectTo(next) },
    });
    if (error) return loginErrorMessage(classifyLoginError(error));
    return null;
  } catch (error) {
    const code = error instanceof Error ? classifyLoginError(error) : "network";
    return loginErrorMessage(code === "unknown" ? "network" : code);
  }
}

/**
 * Siempre el mismo resultado si el correo no existe, para no revelar cuentas.
 * Red o límite de intentos sí se cuentan.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return { ok: false, message: loginErrorMessage("network") };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: recoveryRedirectTo(),
    });
    if (!error) return { ok: true };
    const code = classifyLoginError(error);
    if (code === "rate" || code === "network") return { ok: false, message: loginErrorMessage(code) };
    const blob = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
    if (blob.includes("user not found") || blob.includes("user_not_found") || code === "invalid") return { ok: true };
    if (code === "unknown") return { ok: false, message: "No pudimos enviar el correo. Inténtalo otra vez." };
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error ? classifyLoginError(error) : "network";
    return { ok: false, message: loginErrorMessage(code === "unknown" ? "network" : code) };
  }
}

/** Null si la contraseña quedó guardada. */
export async function updatePassword(password: string): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return loginErrorMessage("network");
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) return null;
    return loginErrorMessage(classifyLoginError(error));
  } catch (error) {
    const code = error instanceof Error ? classifyLoginError(error) : "network";
    return loginErrorMessage(code === "unknown" ? "network" : code);
  }
}
