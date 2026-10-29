"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { isBarePlatformPath } from "@/components/app-shell/nav";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { IconClose } from "@/components/ui/icons";
import { pwaCopy } from "@/content/i18n/extra-pwa";
import { useT } from "@/lib/hooks/use-t";

import {
  PWA_DISMISS_EVENT,
  PWA_DISMISS_KEY,
  PWA_DISMISS_VALUE,
  SERVICE_WORKER_SCOPE,
  SERVICE_WORKER_URL,
  installOffer,
  isInstalledDisplay,
  isIosHomeScreenDevice,
  isInstallDismissed,
  shouldCaptureInstallPrompt,
  shouldRegisterServiceWorker,
  type InstallContext,
} from "@/components/pwa/policy";

const SERVER_INSTALL: InstallContext = {
  mobile: false,
  dismissed: false,
  standalone: false,
  ios: false,
  hasNativePrompt: false,
};

let clientInstall: InstallContext = SERVER_INSTALL;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readDismissRaw(): string | null {
  try {
    return localStorage.getItem(PWA_DISMISS_KEY);
  } catch {
    return null;
  }
}

function readNavigatorStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function readInstallContext(): InstallContext {
  const next: InstallContext = {
    mobile: window.matchMedia("(max-width: 1023px)").matches,
    dismissed: isInstallDismissed(readDismissRaw()),
    standalone: isInstalledDisplay({
      standaloneMedia:
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches,
      navigatorStandalone: readNavigatorStandalone(),
    }),
    ios: isIosHomeScreenDevice({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
    }),
    hasNativePrompt: false,
  };
  if (
    clientInstall.mobile === next.mobile &&
    clientInstall.dismissed === next.dismissed &&
    clientInstall.standalone === next.standalone &&
    clientInstall.ios === next.ios
  ) {
    return clientInstall;
  }
  clientInstall = next;
  return clientInstall;
}

function subscribeInstall(onChange: () => void) {
  const mobile = window.matchMedia("(max-width: 1023px)");
  const standalone = window.matchMedia("(display-mode: standalone)");
  const fullscreen = window.matchMedia("(display-mode: fullscreen)");
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PWA_DISMISS_KEY) return;
    onChange();
  };
  mobile.addEventListener("change", onChange);
  standalone.addEventListener("change", onChange);
  fullscreen.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener(PWA_DISMISS_EVENT, onChange);
  return () => {
    mobile.removeEventListener("change", onChange);
    standalone.removeEventListener("change", onChange);
    fullscreen.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PWA_DISMISS_EVENT, onChange);
  };
}

function useInstallContext(): InstallContext {
  return useSyncExternalStore(subscribeInstall, readInstallContext, () => SERVER_INSTALL);
}

function rememberDismiss() {
  try {
    localStorage.setItem(PWA_DISMISS_KEY, PWA_DISMISS_VALUE);
  } catch {
    // Sin almacenamiento igual ocultamos el chip en esta vista.
  }
  window.dispatchEvent(new Event(PWA_DISMISS_EVENT));
}

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

/** Registro del service worker y el aviso discreto de instalar, sólo en el celular. */
export function PwaRegister() {
  useServiceWorker();
  const context = useInstallContext();
  const pathname = usePathname();
  const bare = isBarePlatformPath(pathname);
  const contextRef = useRef(context);
  const bareRef = useRef(bare);
  contextRef.current = context;
  bareRef.current = bare;
  const { language } = useT();
  const copy = pwaCopy(language);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [iosOpen, setIosOpen] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      if (bareRef.current) return;
      const current = contextRef.current;
      if (!shouldCaptureInstallPrompt(current)) return;
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setIosOpen(false);
      setClosed(true);
      rememberDismiss();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const offer = closed
    ? "hidden"
    : installOffer({ ...context, hasNativePrompt: promptEvent !== null });

  function dismiss() {
    setPromptEvent(null);
    setIosOpen(false);
    setClosed(true);
    rememberDismiss();
  }

  async function onInstall() {
    if (offer === "ios") {
      setIosOpen(true);
      return;
    }
    const event = promptEvent;
    if (!event) return;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // El navegador no mostró el diálogo. El chip se cierra igual.
    }
    setPromptEvent(null);
    dismiss();
  }

  if (offer === "hidden" || bare) return null;

  return (
    <>
      <div role="region" aria-label={copy.region} className="mb-4 flex max-w-full items-center gap-2 lg:hidden">
        <Button
          type="button"
          variant="secondary"
          className="h-11 min-h-11 min-w-0 flex-1 px-4 md:h-11"
          aria-haspopup={offer === "ios" ? "dialog" : undefined}
          onClick={() => {
            void onInstall();
          }}
        >
          {copy.install}
        </Button>
        <IconButton label={copy.dismiss} onClick={dismiss}>
          <IconClose />
        </IconButton>
      </div>
      <Dialog open={iosOpen} onOpenChange={setIosOpen} title={copy.iosTitle} description={copy.iosBody}>
        <Button
          type="button"
          variant="secondary"
          className="h-11 min-h-11 w-full"
          onClick={() => setIosOpen(false)}
        >
          {copy.iosClose}
        </Button>
      </Dialog>
    </>
  );
}
