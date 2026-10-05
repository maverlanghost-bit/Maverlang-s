"use client";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth";

export function LogoutButton() {
  const { status, logout } = useSession();

  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full"
      disabled={status === "loading"}
      onClick={() => void logout()}
    >
      Cerrar sesión
    </Button>
  );
}
