import { cloneElement, Fragment, isValidElement, type ComponentProps, type ReactElement } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export const buttonVariantClass: Record<ButtonVariant, string> = {
  /* D1: un solo botón negro por vista. */
  primary: "bg-fg text-white hover:bg-[#1f2329]",
  /* D1: contorno de control (3,74:1) en vez de relleno gris que parecía deshabilitado. */
  secondary: "border border-control bg-bg text-fg hover:bg-surface-1",
  ghost: "bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-down text-white hover:bg-[#a81a1a]",
};

const sizeClass: Record<ButtonSize, string> = {
  /* Escala vertical única: 44 táctil en móvil y 36/44/48 con puntero.
     `md` es la altura de referencia: Input y Select también miden 44 (min-h-11). */
  sm: "h-11 gap-1.5 px-3 text-sm sm:h-9",
  md: "h-11 gap-2 px-4 text-sm md:px-6",
  lg: "h-11 gap-2 px-5 text-base md:h-12 md:px-7",
};

export const buttonBase =
  "inline-flex touch-manipulation items-center justify-center rounded-full font-medium select-none transition duration-[140ms] ease-spring active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50";

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(buttonBase, buttonVariantClass[variant], sizeClass[size], className);
}

function Spinner() {
  return (
    <svg className="size-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type ChildProps = {
  className?: string;
  "aria-disabled"?: boolean;
  "aria-busy"?: boolean;
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  asChild = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = buttonClasses({ variant, size, className });
  const isDisabled = Boolean(disabled || loading);

  if (asChild && isValidElement<ChildProps>(children) && children.type !== Fragment) {
    const child = children as ReactElement<ChildProps>;
    return cloneElement(child, {
      className: cn(classes, child.props.className),
      "aria-disabled": isDisabled || undefined,
      "aria-busy": loading || undefined,
    });
  }

  return (
    <button type={type} className={classes} disabled={isDisabled} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner /> : null}
      {loading ? <span className="sr-only">Cargando</span> : null}
      {children}
    </button>
  );
}
