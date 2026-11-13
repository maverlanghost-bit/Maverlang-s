"use client";

export interface InvestorPassportCardProps {
  displayName: string | null | undefined;
  email: string | null | undefined;
  country: string | null | undefined;
  userId: string;
}

/**
 * Iniciales para el avatar: primera letra de la primera y la segunda palabra;
 * si sólo hay una palabra, se usan sus dos primeras letras. Nunca devuelve "".
 */
function getInitials(source: string | null | undefined): string {
  const fallback = "MV";
  const text = (source ?? "").trim();

  if (!text) {
    return fallback;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  const second = words[1];

  const pair = second
    ? `${first.charAt(0)}${second.charAt(0)}`
    : first.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2);

  const initials = pair.toUpperCase().slice(0, 2);

  return initials || fallback;
}

/**
 * Credencial del inversionista: identidad visible, jurisdicción declarada,
 * custodia y comisión de corretaje. Sólo muestra los datos que recibe.
 */
export function InvestorPassportCard({
  displayName,
  email,
  country,
  userId,
}: InvestorPassportCardProps) {
  const initials = getInitials(displayName || email);

  return (
    <section className="rounded-3xl border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-fg"
            aria-hidden="true"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">
              {displayName || "Inversionista Maverlang"}
            </p>
            <p className="truncate text-xs text-fg-muted">{email || "Sin correo registrado"}</p>
          </div>
        </div>

        <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-0.5 text-[11px] font-medium text-fg-body">
          Elegibilidad Verificada · No US-Person
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="label-xs">Jurisdicción declarada</p>
          <p className="mt-1 font-medium text-fg">{`${country || "CL"} · Operación habilitada`}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="label-xs">Custodia de activos</p>
          <p className="mt-1 font-medium text-fg">SPL 1:1 en billetera propia</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="label-xs">Comisión de corretaje</p>
          <p className="mt-1 font-medium text-fg">0% (Tarifa plana Maverlang)</p>
        </div>
      </div>

      <p className="mt-3 truncate text-[11px] text-fg-muted" title={userId}>
        ID de inversionista · <span className="num tracking-tight">{userId}</span>
      </p>
    </section>
  );
}
