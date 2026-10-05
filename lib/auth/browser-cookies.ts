import { readCookieValue } from "@/lib/auth/cookies";

export const AUTH_COOKIE_EVENT = "a24-auth";

const MONTH_SECONDS = 60 * 60 * 24 * 30;

function cookieSuffix(): string {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  return `; Path=/; SameSite=Lax${secure}`;
}

function notify(): void {
  window.dispatchEvent(new Event(AUTH_COOKIE_EVENT));
}

export function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  return readCookieValue(document.cookie, name);
}

export function writeClientCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${MONTH_SECONDS}${cookieSuffix()}`;
  notify();
}

export function clearClientCookie(name: string): void {
  document.cookie = `${name}=; Max-Age=0${cookieSuffix()}`;
  notify();
}

export function subscribeAuthCookies(onChange: () => void): () => void {
  window.addEventListener(AUTH_COOKIE_EVENT, onChange);
  return () => window.removeEventListener(AUTH_COOKIE_EVENT, onChange);
}
