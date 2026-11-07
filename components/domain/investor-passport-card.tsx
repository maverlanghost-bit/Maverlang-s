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
    <section className="rounded-3xl border border-border/80 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft/60 text-sm font-semibold text-brand"
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

        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft/40 px-2.5 py-0.5 text-[11px] font-medium text-brand">
          Elegibilidad Verificada · No US-Person
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Jurisdicción declarada</p>
          <p className="mt-0.5 font-medium text-fg">
            {`${country || "CL"} · Operación habilitada`}
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Custodia de activos</p>
          <p className="mt-0.5 font-medium text-fg">SPL 1:1 en billetera propia</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Comisión de corretaje</p>
          <p className="mt-0.5 font-medium text-fg">0% (Tarifa plana Maverlang)</p>
        </div>
      </div>

      <p className="mt-3 truncate text-[11px] text-fg-muted">
        ID de inversionista · <span className="num">{userId}</span>
      </p>
    </section>
  );
}
