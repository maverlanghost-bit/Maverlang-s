/**
 * Sentry en el runtime edge (middleware/proxy y rutas edge). Misma política de
 * privacidad que `sentry.server.config.ts` (OBS-01): sin PII, redacción de
 * eventos, breadcrumbs y spans antes de salir. Sólo se activa con SENTRY_DSN.
 */
import * as Sentry from "@sentry/nextjs";

import { scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/observability/redact";

const dsn = process.env.SENTRY_DSN?.trim();

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
      stackFrameVariables: false,
    },
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
    // Con `traceLifecycle: 'stream'` (por defecto en v11) `beforeSendTransaction`
    // se ignora: los spans salen sueltos y se limpian aquí.
    beforeSendSpan: (span) => scrubSentryEvent(span),
  });
}
