"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { isBarePlatformPath } from "@/components/app-shell/nav";
import {
  PWA_DISMISS_EVENT,
  PWA_DISMISS_KEY,
  PWA_DISMISS_VALUE,
  installOffer,
  isInstalledDisplay,
  isInstallDismissed,
  isIosHomeScreenDevice,
  shouldCaptureInstallPrompt,
} from "@/components/pwa/policy";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconClose } from "@/components/ui/icons";
import { pwaCopy } from "@/content/i18n/extra-pwa";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/** `beforeinstallprompt` todavía no está en lib.dom. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Lo único nuevo: cómo se instala en Android/Chrome. El resto del texto ya existe en `extra-pwa`. */
const ANDROID_BODY: Record<"es-CL" | "en", string> = {
  "es-CL": "Abre la app directo desde la pantalla de inicio, sin buscar la dirección.",
  en: "Open the app straight from your home screen, no address to type.",
};

function readDismissRaw(): string | null {
  try {
    return localStorage.getItem(PWA_DISMISS_KEY);
  } catch {
    return null;
  }
}

/** El cierre se recuerda con la misma llave que usa el resto de la app. */
function rememberDismiss() {
  try {
    localStorage.setItem(PWA_DISMISS_KEY, PWA_DISMISS_VALUE);
  } catch {
    // Sin almacenamiento el aviso igual se oculta en esta visita.
  }
  window.dispatchEvent(new Event(PWA_DISMISS_EVENT));
}

function subscribeNoop() {
  return () => {};
}

/** El HTML del servidor no conoce el navegador: el aviso aparece recién al montar. */
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/**
 * Aviso discreto para instalar la app. En Android/Chrome usa el diálogo nativo
 * (`beforeinstallprompt`); en iOS Safari muestra el gesto de Compartir. Cerrable,
 * y el cierre queda guardado en localStorage.
 */
export function InstallHint({ className }: { className?: string }) {
  const { language } = useT();
  const copy = pwaCopy(language);
  const androidBody = ANDROID_BODY[language === "en" ? "en" : "es-CL"];
  const pathname = usePathname();
  const mounted = useMounted();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [mobile, setMobile] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const standalone = window.matchMedia("(display-mode: standalone)");
    const fullscreen = window.matchMedia("(display-mode: fullscreen)");

    const readContext = () => {
      const nav = navigator as Navigator & { standalone?: boolean };
      return {
        mobile: media.matches,
        dismissed: isInstallDismissed(readDismissRaw()),
        standalone: isInstalledDisplay({
          standaloneMedia: standalone.matches || fullscreen.matches,
          navigatorStandalone: nav.standalone === true,
        }),
        ios: isIosHomeScreenDevice({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          maxTouchPoints: navigator.maxTouchPoints ?? 0,
        }),
      };
    };

    const evaluate = () => {
      const current = readContext();
      setMobile(current.mobile);
      setDismissed(current.standalone || current.dismissed);
      setIos(current.ios);
    };

    const onPrompt = (event: Event) => {
      // Misma política de siempre: no se intercepta el aviso nativo fuera del
      // celular, ni cuando ya está instalada o la persona lo cerró.
      if (!shouldCaptureInstallPrompt(readContext())) return;
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      rememberDismiss();
      evaluate();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== PWA_DISMISS_KEY) return;
      evaluate();
    };

    evaluate();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("storage", onStorage);
    window.addEventListener(PWA_DISMISS_EVENT, evaluate);
    media.addEventListener("change", evaluate);
    standalone.addEventListener("change", evaluate);
    fullscreen.addEventListener("change", evaluate);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PWA_DISMISS_EVENT, evaluate);
      media.removeEventListener("change", evaluate);
      standalone.removeEventListener("change", evaluate);
      fullscreen.removeEventListener("change", evaluate);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    setPrompt(null);
    rememberDismiss();
  }

  async function install() {
    const event = prompt;
    if (!event) return;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // El navegador no mostró el diálogo. El aviso se cierra igual.
    }
    dismiss();
  }

  // Misma política de siempre (`installOffer`): sólo en el celular, nunca en las
  // pantallas de ingreso, y sólo si hay algo concreto que ofrecer: el diálogo
  // nativo o el gesto de iOS. `dismissed` ya incluye "ya está instalada".
  const visible =
    mounted &&
    !isBarePlatformPath(pathname) &&
    installOffer({ mobile, dismissed, standalone: dismissed, ios, hasNativePrompt: prompt !== null }) !== "hidden";
  if (!visible) return null;

  return (
    <aside
      role="note"
      aria-label={copy.region}
      className={cn(
        "mb-4 flex max-w-full items-start gap-2 rounded-2xl border border-border/70 bg-surface-1/80 px-4 py-3 lg:hidden",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{copy.iosTitle}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{prompt ? androidBody : copy.iosBody}</p>
        {prompt ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-2.5 h-11 min-h-11 px-4"
            onClick={() => {
              void install();
            }}
          >
            {copy.install}
          </Button>
        ) : null}
      </div>
      <IconButton label={copy.dismiss} size="md" className="-mt-1.5 -mr-2" onClick={dismiss}>
        <IconClose />
      </IconButton>
    </aside>
  );
}
