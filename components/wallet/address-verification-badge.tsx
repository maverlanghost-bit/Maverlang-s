"use client";

export interface AddressVerificationBadgeProps {
  address: string;
  valid: boolean;
  own?: boolean;
  /** Para que el campo de destino pueda apuntar aquí con `aria-describedby`. */
  id?: string;
}

/**
 * Estado del destino mientras se escribe. Vive pegado al campo (no al pie del
 * formulario) porque es la única señal de que la dirección sirve o no.
 * El enlace a Solscan es la prueba externa: texto subrayado, no una píldora.
 */
export function AddressVerificationBadge({
  address,
  valid,
  own = false,
  id,
}: AddressVerificationBadgeProps) {
  const clean = address.trim();

  if (!clean) {
    return null;
  }

  if (!valid) {
    return (
      <div
        id={id}
        role="status"
        className="flex items-start gap-2 rounded-xl border border-down/40 bg-down-bg px-3 py-2 text-[13px] leading-relaxed text-down"
      >
        <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-down" />
        <span>Formato Base58 inválido · Verifica los 32 a 44 caracteres de la dirección Solana.</span>
      </div>
    );
  }

  return (
    <div
      id={id}
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2 text-[13px] leading-relaxed"
    >
      <span className="inline-flex min-w-0 items-start gap-2 font-medium text-fg">
        <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-up" aria-hidden="true" />
        <span className="min-w-0">
          {`✓ Dirección Solana Ed25519 válida (Base58)${own ? " · Tu propia billetera" : ""}`}
        </span>
      </span>
      <a
        href={`https://solscan.io/account/${encodeURIComponent(clean)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="-my-1 inline-flex min-h-11 shrink-0 items-center font-medium text-fg underline decoration-fg/40 underline-offset-4 hover:decoration-fg"
      >
        Inspeccionar cuenta en Solscan ↗
      </a>
    </div>
  );
}
