"use client";

export function passwordStrengthLabel(
  password: string,
): "Muy corta" | "Aceptable" | "Fuerte" | null {
  if (!password) return null;
  if (password.length < 8) return "Muy corta";
  if (password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password)) {
    return "Fuerte";
  }
  return "Aceptable";
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const label = passwordStrengthLabel(password);

  const len8 = password.length >= 8;
  const alnum = /[A-Za-z]/.test(password) && /\d/.test(password);
  const len12 = password.length >= 12;
  const extra = /[A-Z]/.test(password) || /[^A-Za-z0-9]/.test(password);

  const checks = [len8, alnum, len12, extra];
  const trueCount = checks.filter(Boolean).length;
  const score = Math.min(4, Math.max(1, trueCount));

  const activeColor =
    label === "Muy corta"
      ? "bg-down"
      : label === "Aceptable"
        ? "bg-warn"
        : "bg-up";

  return (
    <div
      className="mt-2.5 rounded-xl border border-border/60 bg-surface-1/60 p-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">Seguridad de la clave</span>
        <span className="font-medium text-fg">Nivel: {label}</span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 rounded-full ${segment <= score ? activeColor : "bg-surface-3"}`}
          />
        ))}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-muted">
        <li className="inline-flex items-center gap-1">
          <span
            className={len8 ? "size-1.5 rounded-full bg-up" : "size-1.5 rounded-full bg-surface-3"}
            aria-hidden="true"
          />
          8+ caracteres
        </li>
        <li className="inline-flex items-center gap-1">
          <span
            className={alnum ? "size-1.5 rounded-full bg-up" : "size-1.5 rounded-full bg-surface-3"}
            aria-hidden="true"
          />
          Letras y números
        </li>
        <li className="inline-flex items-center gap-1">
          <span
            className={len12 ? "size-1.5 rounded-full bg-up" : "size-1.5 rounded-full bg-surface-3"}
            aria-hidden="true"
          />
          12+ caracteres
        </li>
      </ul>
    </div>
  );
}
