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

  const missing = checks.filter((check) => !check.met);

  return (
    <div className="mt-1.5 flex items-center gap-2 text-[13px] leading-snug">
      <div className="grid w-14 shrink-0 grid-cols-3 gap-0.5" aria-hidden="true">
        {checks.map((check, index) => (
          <span
            key={check.label}
            className={`h-1 rounded-full ${index < score ? tone : "bg-surface-3"}`}
          />
        ))}
      </div>
      <span className="min-w-0 text-fg-muted" role="status" aria-live="polite">
        <span className="sr-only">Seguridad de la clave: </span>
        <span className="font-medium text-fg">{label}</span>
        {missing.length ? ` · Falta: ${missing.map((check) => check.label).join(", ")}` : ""}
      </span>
    </div>
  );
}
