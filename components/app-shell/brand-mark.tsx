import Link from "next/link";
import Image from "next/image";

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
      <Image
        src="/brand/maverlang-logo.png"
        alt={site.name}
        width={148}
        height={26}
        priority
        className="h-6 w-auto dark:invert"
      />
    </Link>
  );
}
