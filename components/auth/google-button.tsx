import { Button } from "@/components/ui/button";

/** Logo "G" de Google a color. Decorativo. */
export function GoogleIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.42Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.3.32-1.91V7.51H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.49l3.34-2.58Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2A10 10 0 0 0 3.06 7.51l3.34 2.58C7.19 7.73 9.4 5.97 12 5.97Z"
      />
    </svg>
  );
}

/** Separador "o" entre el formulario y las opciones alternativas. */
export function OrDivider() {
  return (
    <div className="mt-4 flex items-center gap-3" role="separator" aria-label="o">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span aria-hidden="true" className="text-[13px] text-fg-muted">
        o
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Botón "Continuar con Google". Sólo presentación: el llamador decide si está
 * habilitado. Deshabilitado muestra la etiqueta "Pronto".
 */
export function GoogleButton({
  disabled = false,
  loading = false,
  onClick,
}: {
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="relative mt-4 w-full"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      loading={loading}
      onClick={onClick}
    >
      <GoogleIcon className="mr-2 size-[18px] shrink-0" />
      Continuar con Google
      {disabled ? (
        <span className="absolute -top-2.5 right-4 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] leading-none font-medium text-fg-muted">
          Pronto
        </span>
      ) : null}
    </Button>
  );
}
