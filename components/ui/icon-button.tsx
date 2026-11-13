import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { buttonBase, buttonVariantClass, type ButtonVariant } from "@/components/ui/button";

const sizeClass = {
  /* Misma escala que Button: 44 px táctiles; 36/44/48 con puntero.
     `lg` baja a 44 en móvil para no quedar más alto que el Button lg. */
  sm: "size-11 sm:size-9",
  md: "size-11",
  lg: "size-11 md:size-12",
} as const;

type IconButtonProps = ComponentProps<"button"> & {
  label: string;
  variant?: ButtonVariant;
  size?: keyof typeof sizeClass;
  children: ReactNode;
};

export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(buttonBase, buttonVariantClass[variant], sizeClass[size], "shrink-0 p-0", className)}
      {...props}
    >
      {children}
    </button>
  );
}
