import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function LandingSection({
  id,
  titleId,
  children,
  className,
}: {
  id?: string;
  titleId: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("scroll-mt-16 px-5 py-20 md:py-28 lg:py-32", className)}
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </section>
  );
}

export function SectionIntro({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="text-3xl sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">{children}</p>
    </div>
  );
}
