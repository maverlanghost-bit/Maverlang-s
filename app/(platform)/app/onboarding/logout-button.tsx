"use client";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { useSession } from "@/lib/auth";

export function LogoutButton({
  variant = "secondary",
  size = "lg",
  className = "w-full",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { status, logout } = useSession();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={status === "loading"}
      onClick={() => void logout()}
    >
      Cerrar sesión
    </Button>
  );
}
