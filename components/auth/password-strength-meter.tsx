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
 * glifo (✓ / ○), así el estado no depende sólo del color. Los segmentos son
 * refuerzo visual y miden lo mismo que la lista: 3 requisitos, 3 segmentos.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const label = passwordStrengthLabel(password);

  const checks = [
    { label: "8+ caracteres", met: password.length >= 8 },
    { label: "Letras y números", met: /[A-Za-z]/.test(password) && /\d/.test(password) },
    { label: "12+ caracteres", met: password.length >= 12 },
  ];
  const score = Math.max(1, checks.filter((check) => check.met).length);

  const tone = label === "Muy corta" ? "bg-down" : label === "Aceptable" ? "bg-warn" : "bg-up";

  return (
    <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="label-xs">Seguridad de la clave</span>
        <span className="text-[13px] font-medium text-fg" role="status" aria-live="polite">
          Nivel: {label}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1" aria-hidden="true">
        {checks.map((check, index) => (
          <span
            key={check.label}
            className={`h-1 rounded-full ${index < score ? tone : "bg-surface-3"}`}
          />
        ))}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] leading-snug">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`inline-flex items-start gap-1 ${check.met ? "text-fg" : "text-fg-muted"}`}
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
