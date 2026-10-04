import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

type IconProps = SVGProps<SVGSVGElement>;

function base({ className, ...props }: IconProps) {
  return { className: cn("size-4", className), "aria-hidden": true as const, ...props };
}

export function IconClose(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M4 4.5 12 12.5M12 4.5 4 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v5.4A1.3 1.3 0 0 0 3.8 10.5H5.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconArrow({ direction = "up", ...props }: IconProps & { direction?: "up" | "down" | "flat" }) {
  const rotate = direction === "down" ? "rotate-180" : direction === "flat" ? "rotate-90" : "";
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base({ ...props, className: cn("size-3", rotate, props.className) })}>
      <path d="M8 12.5V3.5M8 3.5 4.5 7M8 3.5 11.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
