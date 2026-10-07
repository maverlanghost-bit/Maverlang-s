import Link from "next/link";

import { BrandLogoImage } from "@/components/app-shell/brand-image";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

/** Marca con logo (sin punto naranja). El PNG vive en `public/brand/`. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/app"
      aria-label={site.name}
      className={cn("flex min-w-0 items-center rounded-full text-fg", className)}
    >
      <BrandLogoImage />
    </Link>
  );
}
