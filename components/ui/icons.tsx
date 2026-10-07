import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

type IconProps = SVGProps<SVGSVGElement>;

function base({ className, ...props }: IconProps) {
  return { className: cn("size-4", className), "aria-hidden": true as const, ...props };
}

export function IconMenu(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M4 4.5 12 12.5M12 4.5 4 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Flecha para volver (N18): detalle → mercado. */
export function IconBack(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M13.5 8h-9M7 4.5 3.5 8 7 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

export function IconChart(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M2.5 13.5h11M4.5 13.5v-4M8 13.5V3.5M11.5 13.5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconPortfolio(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <rect x="2.5" y="4.5" width="11" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 4.5V3.8A1.3 1.3 0 0 1 7.3 2.5h1.4A1.3 1.3 0 0 1 10 3.8v.7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <rect x="2.5" y="4" width="11" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 7h11" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="9.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <circle cx="8" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 13.2c.7-2 2.4-3.2 4.5-3.2s3.8 1.2 4.5 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M1.5 8S3.8 4.2 8 4.2 14.5 8 14.5 8 12.2 11.8 8 11.8 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M2.5 3.5 13.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6.3 6.5A2 2 0 0 0 9.6 9.7M4.2 5.4C2.9 6.4 1.5 8 1.5 8s2.3 3.8 6.5 3.8c1 0 2-.3 2.8-.7M6.7 4.3c.4-.1.8-.1 1.3-.1 4.2 0 6.5 3.8 6.5 3.8s-.6 1-1.6 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.2 10.2 13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconStar({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" {...base(props)}>
      <path
        d="M8 1.75 9.55 5.35l3.85.35-2.95 2.55.9 3.75L8 10.15 4.65 12l.9-3.75L2.6 5.7l3.85-.35L8 1.75Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M6.2 9.1 13.2 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.6 2.6h4.8V7.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M13.2 9v2.4a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V4.4a1.6 1.6 0 0 1 1.6-1.6H6.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 5.2v3.1l2.2 1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 8h11" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 2.5c1.7 1.8 2.5 3.6 2.5 5.5S9.7 11.7 8 13.5C6.3 11.7 5.5 9.9 5.5 8S6.3 4.3 8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
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

export function IconPanel(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 3v10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <path d="M6.5 3.5H4.2A1.7 1.7 0 0 0 2.5 5.2v5.6a1.7 1.7 0 0 0 1.7 1.7h2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6.5 8h7M10.5 5.5 13 8l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconGear(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...base(props)}>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
