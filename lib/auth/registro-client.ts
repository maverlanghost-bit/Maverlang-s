import { siteOrigin } from "@/config/site";
import { classifyAuthError, registroErrorMessage } from "@/lib/auth/registro-errors";
import { registroUserData, type RegistroValues, type RegistroVersions } from "@/lib/auth/registro-schema";
import { safeNextPath } from "@/lib/auth/paths";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function registroRedirectTo(next: string | null): string {
  const safe = safeNextPath(next) ?? "/app";
  const url = new URL("/auth/callback", siteOrigin());
  url.searchParams.set("next", safe);
  return url.toString();
}

/** Con sesión (confirmación apagada) entra al `next` saneado. Sin sesión, queda la pantalla del correo. */
export type SignUpDestination = { kind: "app"; path: string } | { kind: "email" };

export function signUpDestination(session: unknown, next: string | null): SignUpDestination {
  if (session === null || session === undefined) return { kind: "email" };
  return { kind: "app", path: safeNextPath(next) ?? "/app" };
}

function metadata(values: RegistroValues, versions: RegistroVersions) {
  return registroUserData(values, versions);
}

export async function signUpRegistro(
  values: RegistroValues,
  versions: RegistroVersions,
  next: string | null,
): Promise<{ ok: true; email: string; destination: SignUpDestination } | { ok: false; message: string }> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return { ok: false, message: registroErrorMessage("network") };
  try {
    const { data, error } = await supabase.auth.signUp({
      email: values.email.trim(),
      password: values.password,
      options: {
        emailRedirectTo: registroRedirectTo(next),
        data: metadata(values, versions),
      },
    });
    if (error) return { ok: false, message: registroErrorMessage(classifyAuthError(error)) };
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { ok: false, message: registroErrorMessage("already") };
    }
    return {
      ok: true,
      email: values.email.trim(),
      destination: signUpDestination(data.session, next),
    };
  } catch (error) {
    const code = error instanceof Error ? classifyAuthError(error) : "network";
    return { ok: false, message: registroErrorMessage(code === "unknown" ? "network" : code) };
  }
}

/** Null si el correo salió. Si no, el mensaje en español. */
export async function resendRegistro(email: string, next: string | null): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return registroErrorMessage("network");
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: registroRedirectTo(next) },
    });
    if (error) return registroErrorMessage(classifyAuthError(error));
    return null;
  } catch (error) {
    const code = error instanceof Error ? classifyAuthError(error) : "network";
    return registroErrorMessage(code === "unknown" ? "network" : code);
  }
}

/** Deja el JWT alineado con el perfil, sin consultar la tabla en el middleware. */
export async function publishRegistroMetadata(values: RegistroValues, versions: RegistroVersions): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return registroErrorMessage("network");
  try {
    const { error } = await supabase.auth.updateUser({ data: metadata(values, versions) });
    if (error) return registroErrorMessage(classifyAuthError(error));
    return null;
  } catch (error) {
    const code = error instanceof Error ? classifyAuthError(error) : "network";
    return registroErrorMessage(code === "unknown" ? "network" : code);
  }
}
