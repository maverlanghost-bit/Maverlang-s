import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { buttonBase, buttonVariantClass, type ButtonVariant } from "@/components/ui/button";

const sizeClass = {
  sm: "size-10",
  md: "size-11 md:size-12",
  lg: "size-12",
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
