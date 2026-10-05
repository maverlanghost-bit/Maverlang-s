"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useReveal, type RevealPhase } from "@/lib/hooks/use-reveal";

const phaseClass: Record<RevealPhase, string | undefined> = {
  static: undefined,
  wait: "reveal-wait",
  in: "reveal-in",
};

export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const { ref, phase } = useReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn(phaseClass[phase], className)}
      style={phase === "in" ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
