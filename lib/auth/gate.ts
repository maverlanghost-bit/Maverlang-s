import { ONBOARDING_DONE } from "@/lib/auth/cookies";
import { isPublicAppPath, safeNextPath, splitPath } from "@/lib/auth/paths";

const COUNTRY = /^[A-Z]{2}$/;

export type GateInput = {
  pathname: string;
  search: string;
  countryHeader: string | null;
  countryQuery: string | null;
  /** `?country=` sólo fuera de production. */
  nodeEnv: string | undefined;
  blockedCountries: readonly string[];
  mockSession: string | null;
  onboarding: string | null;
  privyToken: string | null;
  usePrivy: boolean;
};

export type GateDecision =
  | { kind: "next" }
  | { kind: "redirect"; pathname: string; search: string };

const NEXT: GateDecision = { kind: "next" };

export function blockedCountryList(raw: string | undefined): string[] {
  if (!raw?.trim()) return ["US"];
  const list = raw
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => COUNTRY.test(part));
  return list.length > 0 ? list : ["US"];
}

export function isSkippedPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/_next" ||
    pathname.startsWith("/_next/") ||
    /\.(?:png|jpe?g|gif|webp|svg|ico|txt|xml|woff2?|map|css|js)$/i.test(pathname)
  );
}

export function resolveCountry(input: Pick<GateInput, "countryHeader" | "countryQuery" | "nodeEnv">): string | null {
  if (input.nodeEnv !== "production") {
    const query = input.countryQuery?.trim().toUpperCase() ?? "";
    if (COUNTRY.test(query)) return query;
  }
  const header = input.countryHeader?.trim().toUpperCase() ?? "";
  return COUNTRY.test(header) ? header : null;
}

function present(value: string | null): boolean {
  return value !== null && value.length > 0;
}

/** Misma regla que el middleware. En mock mira `a24_mock_session`; con Privy, `privy-token`. */
export function hasAuthSession(input: Pick<GateInput, "usePrivy" | "privyToken" | "mockSession">): boolean {
  return input.usePrivy ? present(input.privyToken) : present(input.mockSession);
}

function isAppPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/app/ingresar" || pathname.startsWith("/app/ingresar/");
}

function isOnboardingPath(pathname: string): boolean {
  return pathname === "/app/onboarding" || pathname.startsWith("/app/onboarding/");
}

function redirectTo(path: string): GateDecision {
  const target = splitPath(path);
  return { kind: "redirect", pathname: target.pathname, search: target.search };
}

function loginRedirect(pathname: string, search: string): GateDecision {
  const params = new URLSearchParams();
  params.set("next", `${pathname}${search}`);
  return { kind: "redirect", pathname: "/app/ingresar", search: `?${params.toString()}` };
}

function onboardingRedirect(pathname: string, search: string): GateDecision {
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const next = safeNextPath(current.get("next")) ?? safeNextPath(`${pathname}${search}`);
  if (!next || isOnboardingPath(splitPath(next).pathname)) {
    return { kind: "redirect", pathname: "/app/onboarding", search: "" };
  }
  const params = new URLSearchParams();
  params.set("next", next);
  return { kind: "redirect", pathname: "/app/onboarding", search: `?${params.toString()}` };
}

export function decideGate(input: GateInput): GateDecision {
  if (isSkippedPath(input.pathname)) return NEXT;

  const country = resolveCountry(input);
  const blocked = country !== null && input.blockedCountries.includes(country);
  if (blocked) {
    if (input.pathname === "/bloqueado") return NEXT;
    return { kind: "redirect", pathname: "/bloqueado", search: "" };
  }

  if (!isAppPath(input.pathname)) return NEXT;

  const hasSession = hasAuthSession(input);
  const onboarded = input.onboarding === ONBOARDING_DONE;
  const isPublic = isPublicAppPath(input.pathname);

  if (!hasSession) {
    if (isLoginPath(input.pathname) || isPublic) return NEXT;
    return loginRedirect(input.pathname, input.search);
  }

  if (!onboarded) {
    if (isOnboardingPath(input.pathname) || isPublic) return NEXT;
    return onboardingRedirect(input.pathname, input.search);
  }

  if (isLoginPath(input.pathname)) {
    const params = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
    return redirectTo(safeNextPath(params.get("next")) ?? "/app");
  }

  return NEXT;
}
