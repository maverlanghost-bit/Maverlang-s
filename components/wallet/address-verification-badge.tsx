"use client";

export interface AddressVerificationBadgeProps {
  address: string;
  valid: boolean;
  own?: boolean;
}

export function AddressVerificationBadge({
  address,
  valid,
  own = false,
}: AddressVerificationBadgeProps) {
  const clean = address.trim();

  if (!clean) {
    return null;
  }

  if (!valid) {
    return (
      <div
        role="status"
        className="mt-1 flex items-center gap-2 rounded-xl border border-down/30 bg-down/5 px-3 py-2 text-xs text-down"
      >
        <span>Formato Base58 inválido · Verifica los 32 a 44 caracteres de la dirección Solana.</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/25 bg-brand-soft/40 px-3 py-2 text-xs"
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-fg">
        <span className="size-1.5 rounded-full bg-up" aria-hidden="true" />
        <span>{`✓ Dirección Solana Ed25519 válida (Base58)${own ? " · Tu propia billetera" : ""}`}</span>
      </span>
      <a
        href={`https://solscan.io/account/${encodeURIComponent(clean)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand underline underline-offset-4 hover:text-fg"
      >
        Inspeccionar cuenta en Solscan ↗
      </a>
    </div>
  );
}
