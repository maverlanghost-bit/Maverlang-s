import type { Metadata } from "next";

import { site } from "@/config/site";
import { isOtpType, isPlausibleTokenHash } from "@/lib/auth/otp";
import { safeNextPath } from "@/lib/auth/paths";

// Página dinámica (la CSP con nonce lo exige) y fuera de los buscadores.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmar ingreso",
  description: `Confirma el enlace de tu correo para continuar en ${site.name}.`,
  robots: { index: false, follow: false },
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * AUTH-3: el enlace del correo aterriza acá y NO inicia sesión por sí solo.
 * Sólo el botón "Continuar" (POST same-origin a /auth/callback) verifica el token.
 */
export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = one(params.token_hash);
  const type = one(params.type);
  const next = safeNextPath(one(params.next)) ?? "/app";
  const valid = isPlausibleTokenHash(tokenHash) && isOtpType(type);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border/80 bg-white p-6 shadow-float sm:p-10">
        {valid ? (
          <>
            <h1 className="text-3xl text-balance">Confirma para continuar</h1>
            <p className="mt-3 text-sm leading-relaxed text-fg-body">
              Pulsa el botón para confirmar el enlace de tu correo y entrar a {site.name}. Si no lo
              pediste tú, cierra esta página.
            </p>
            <form method="post" action="/auth/callback" className="mt-6">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <button
                type="submit"
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-white"
              >
                Continuar
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-3xl text-balance">Enlace no válido</h1>
            <p className="mt-3 text-sm leading-relaxed text-fg-body">
              El enlace está incompleto o venció. Vuelve a pedir uno desde la pantalla de ingreso.
            </p>
            <a
              href="/app/ingresar"
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full border border-border px-5 text-sm font-medium"
            >
              Ir a ingresar
            </a>
          </>
        )}
      </div>
    </main>
  );
}
