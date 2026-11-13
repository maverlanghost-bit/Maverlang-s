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

/**
 * Medidor de contraseña: el nivel va escrito y cada requisito lleva su propio
 * glifo (✓ / ○), así el estado no depende sólo del color. Los 4 segmentos son
 * refuerzo visual, no la única señal.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const label = passwordStrengthLabel(password);

  const checks = [
    { label: "8 caracteres o más", met: password.length >= 8 },
    { label: "Letras y números", met: /[A-Za-z]/.test(password) && /\d/.test(password) },
    { label: "12 caracteres o más", met: password.length >= 12 },
    {
      label: "Una mayúscula o un símbolo",
      met: /[A-Z]/.test(password) || /[^A-Za-z0-9]/.test(password),
    },
  ];
  const score = Math.min(4, Math.max(1, checks.filter((check) => check.met).length));

  const tone = label === "Muy corta" ? "bg-down" : label === "Aceptable" ? "bg-warn" : "bg-up";

  return (
    <div className="mt-3 rounded-lg border border-border bg-bg p-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs">
        <span className="text-fg-muted">Seguridad de la contraseña</span>
        <span className="font-medium text-fg">{label}</span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1 rounded-full ${segment <= score ? tone : "bg-surface-3"}`}
          />
        ))}
      </div>

      <ul className="mt-2.5 grid gap-1 text-xs leading-snug sm:grid-cols-2">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`flex items-start gap-1.5 ${check.met ? "text-fg" : "text-fg-muted"}`}
          >
            <span
              aria-hidden="true"
              className={`w-3 shrink-0 text-center font-medium ${check.met ? "text-up" : "text-fg-subtle"}`}
            >
              {check.met ? "✓" : "○"}
            </span>
            <span>
              {check.label}
              <span className="sr-only">{check.met ? " (cumple)" : " (falta)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
