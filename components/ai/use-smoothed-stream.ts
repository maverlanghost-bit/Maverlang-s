"use client";

import { useEffect, useState } from "react";

/**
 * Caracteres a revelar en el próximo frame para un texto con `remaining`
 * pendientes: mínimo 1, máximo 28. Nunca devuelve NaN.
 */
export function computeStreamStep(remaining: number): number {
  // `!(remaining > 0)` cubre 0, negativos y NaN; Infinity cae al tope de 28.
  if (!(remaining > 0)) return 1;
  return Math.max(1, Math.min(28, Math.ceil(remaining / 6)));
}

/**
 * Revela `source` carácter a carácter con `requestAnimationFrame`. Con
 * `active` en false, o en SSR, devuelve el texto completo de inmediato.
 */
export function useSmoothedStream(source: string, active: boolean): string {
  // El conteo se guarda junto al texto al que pertenece: si `source` cambia,
  // el render ya lo trata como 0 sin un setState sincrónico dentro del efecto.
  const [reveal, setReveal] = useState({ source, count: source.length });
  const count = reveal.source === source ? Math.min(reveal.count, source.length) : 0;

  useEffect(() => {
    if (!active || typeof window === "undefined" || source.length === 0) return;

    let revealed = 0;
    let frame = 0;

    const tick = () => {
      revealed = Math.min(
        source.length,
        revealed + computeStreamStep(source.length - revealed),
      );
      setReveal({ source, count: revealed });
      if (revealed < source.length) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [source, active]);

  if (!active || typeof window === "undefined") return source;
  return source.slice(0, count);
}
