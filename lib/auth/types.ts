export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export type LoginMethod = "email" | "google";

/** Método con el que la persona puede entrar. `detail` es el correo o el nombre. */
export type LinkedLogin = {
  method: LoginMethod;
  detail: string | null;
};

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
  /** Vacío si no hay sesión. En mock, el correo de la demo. En live, email y Google de Privy. */
  linkedLogins: LinkedLogin[];
};
