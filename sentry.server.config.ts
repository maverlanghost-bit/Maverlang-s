/**
 * Sentry en el servidor (Node). Sólo se activa si hay SENTRY_DSN.
 * Atrapa errores de las rutas API y del render en servidor: un fallo al
 * cotizar, armar o enviar una operación real llega a Sentry en vez de perderse.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SUPABASE_PROJECT_ENV || "development",
    tracesSampleRate: 0.1,
  });
}
