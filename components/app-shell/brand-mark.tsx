import Link from "next/link";

import { site } from "@/config/site";
import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/app" className={cn("flex min-w-0 items-center gap-2 rounded-full text-fg", className)}>
      <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
      <span className="truncate text-sm font-medium tracking-tight">{site.name}</span>
    </Link>
  );
}
