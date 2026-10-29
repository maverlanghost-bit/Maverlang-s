/**
 * Textos para instalar la app en el celular.
 * No van en es-CL.ts / en.ts: esta parte no edita esos archivos.
 */

import type { Preferences } from "@/lib/types";

export interface PwaCopy {
  install: string;
  region: string;
  dismiss: string;
  iosTitle: string;
  iosBody: string;
  iosClose: string;
}

export const pwaExtra: { esCL: PwaCopy; en: PwaCopy } = {
  esCL: {
    install: "Instalar app",
    region: "Instalar la app en este celular",
    dismiss: "Ahora no",
    iosTitle: "Agregar a inicio",
    iosBody: "Compartir > Agregar a inicio.",
    iosClose: "Listo",
  },
  en: {
    install: "Install app",
    region: "Install the app on this phone",
    dismiss: "Not now",
    iosTitle: "Add to Home Screen",
    iosBody: "Share > Add to Home Screen.",
    iosClose: "Done",
  },
};

export function pwaCopy(language: Preferences["language"]): PwaCopy {
  return language === "en" ? pwaExtra.en : pwaExtra.esCL;
}
