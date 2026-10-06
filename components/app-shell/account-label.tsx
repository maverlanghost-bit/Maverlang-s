"use client";

import { useQuery } from "@tanstack/react-query";

import { getMe } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session-context";
import { useT } from "@/lib/hooks/use-t";

/** Nombre y correo del perfil. Si la tabla todavía no está, usa la sesión. */
export function useAccountLabel() {
  const { t } = useT();
  const session = useSession();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: session.status === "authenticated",
  });
  const profileName = me.data?.displayName?.trim() || "";
  const profileEmail = me.data?.email?.trim() || "";
  const sessionName = session.user?.displayName?.trim() || "";
  const sessionEmail = session.user?.email?.trim() || "";
  const email = profileEmail || sessionEmail;
  const name = profileName || sessionName || email || t.nav.profile;
  return {
    name,
    email: email && email !== name ? email : null,
    loading: session.status === "loading",
    logout: session.logout,
    status: session.status,
  };
}
