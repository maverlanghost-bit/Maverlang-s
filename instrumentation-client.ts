/**
 * Sentry en el cliente (navegador). Sólo se activa si hay NEXT_PUBLIC_SENTRY_DSN.
 * Captura errores de JS en producción para que un fallo con plata real no pase
 * inadvertido. Sin DSN, no hace nada (desarrollo y demos siguen limpios).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
    // Muestreo conservador: basta para detectar errores sin inflar costos.
    tracesSampleRate: 0.1,
  });
}
