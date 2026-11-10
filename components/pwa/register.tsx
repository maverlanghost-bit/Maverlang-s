"use client";

import { useEffect } from "react";

import { InstallHint } from "@/components/pwa/install-hint";
import { SERVICE_WORKER_SCOPE, SERVICE_WORKER_URL, shouldRegisterServiceWorker } from "@/components/pwa/policy";

function useServiceWorker() {
  useEffect(() => {
    if (!shouldRegisterServiceWorker(process.env.NODE_ENV)) return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, {
        scope: SERVICE_WORKER_SCOPE,
        type: "module",
        updateViaCache: "none",
      })
      .catch(() => {
        // Si el navegador rechaza el registro, la app sigue en la pestaña.
      });
  }, []);
}

/**
 * Registro del service worker y el aviso discreto de instalar, sólo en el celular.
 * La invitación visible vive en `install-hint.tsx`, para no mostrar dos a la vez.
 */
export function PwaRegister() {
  useServiceWorker();
  return <InstallHint />;
}
