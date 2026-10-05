export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export type LoginMethod = "email" | "google";

/** Usuario de la sesión en el cliente. El perfil completo sigue en `/api/me`. */
export type SessionUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  walletAddress: string | null;
};

export type SessionValue = {
  status: SessionStatus;
  user: SessionUser | null;
  login: (method?: LoginMethod) => Promise<void>;
  logout: () => Promise<void>;
};
