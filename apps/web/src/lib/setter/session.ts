// Session token storage for the setter app. Mirrors the closer web app's
// localStorage approach — the token itself is opaque; the server resolves
// identity from its hash on every call.

const KEY = "sequ3nce_setter_session";

export function getSetterToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setSetterToken(token: string): void {
  window.localStorage.setItem(KEY, token);
}

export function clearSetterToken(): void {
  window.localStorage.removeItem(KEY);
}
