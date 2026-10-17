import Link from "next/link";

import { BrandFavicon, BrandLogoImage } from "@/components/app-shell/brand-image";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

/**
 * Marca con logo (sin punto naranja). El PNG vive en `public/brand/`.
 *
 * `compactOnMobile`: en `< md` muestra el isotipo cuadrado (favicon recortado)
 * en vez del logo ancho de 148px, para que en celulares de 375–390px los
 * controles del header respiren como en un broker de primera línea.
 */
export function BrandMark({ className, compactOnMobile = false }: { className?: string; compactOnMobile?: boolean }) {
  return (
    <Link
      href="/app"
      aria-label={site.name}
      className={cn("flex min-w-0 items-center rounded-full text-fg", className)}
    >
      {compactOnMobile ? (
        <>
          <span className="flex size-8 items-center justify-center md:hidden" aria-hidden>
            <BrandFavicon className="w-8" />
          </span>
          <span className="hidden md:block">
            <BrandLogoImage />
          </span>
        </>
      ) : (
        <BrandLogoImage />
      )}
    </Link>
  );
}
