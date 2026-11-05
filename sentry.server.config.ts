/**
 * Sentry en el servidor (Node). Sólo se activa si hay SENTRY_DSN.
 * Atrapa errores de las rutas API y del render en servidor: un fallo al
 * cotizar, armar o enviar una operación real llega a Sentry en vez de perderse.
 */
import * as Sentry from "@sentry/nextjs";

import { scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/observability/redact";

const dsn = process.env.SENTRY_DSN?.trim();

/**
 * Sentry v11 retiró `sendDefaultPii` de la API y lo reemplazó por
 * `dataCollection`. Se conserva el flag histórico de M-02 (lo leen versiones
 * anteriores del SDK) y se desactivan explícitamente las categorías de PII
 * equivalentes en v11: usuario/IP, cookies, query params y cuerpos HTTP.
 */
const privacyOptions = { sendDefaultPii: false } as const;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SUPABASE_PROJECT_ENV || "development",
    tracesSampleRate: 0.1,
    ...privacyOptions,
    dataCollection: {
      userInfo: false,
      cookies: false,
      urlQueryParams: false,
      httpBodies: [],
      // Las variables locales de un stack frame pueden traer tokens o PII.
      stackFrameVariables: false,
    },
    // M-02: barrera final antes de que el evento salga hacia Sentry. Tapa
    // authorization/cookie/x-api-key, query params con claves, URLs con
    // secretos y campos email/rut/teléfono/token en body y extra.
    beforeSend: (event) => scrubSentryEvent(event),
    // M-02: los breadcrumbs de fetch/XHR y de console también se limpian
    // (una URL de RPC con ?api-key no debe viajar como contexto del error).
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
  });
}
