/**
 * Sentry en el cliente (navegador). Sólo se activa si hay NEXT_PUBLIC_SENTRY_DSN.
 * Captura errores de JS en producción para que un fallo con plata real no pase
 * inadvertido. Sin DSN, no hace nada (desarrollo y demos siguen limpios).
 */
import * as Sentry from "@sentry/nextjs";

import { scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/observability/redact";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

/**
 * Sentry v11 retiró `sendDefaultPii` de la API y lo reemplazó por
 * `dataCollection`. Se conserva el flag histórico de M-02 (lo leen versiones
 * anteriores del SDK) y se desactivan explícitamente las categorías de PII
 * equivalentes en v11.
 */
const privacyOptions = { sendDefaultPii: false } as const;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
    // Muestreo conservador: basta para detectar errores sin inflar costos.
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
    // M-02: misma política de redacción que el servidor, con funciones puras
    // compartidas (sin `server-only`, para que corran en el bundle cliente).
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
  });
}
