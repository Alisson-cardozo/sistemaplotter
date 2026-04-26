import type { AuthUser } from "../ui/AuthPanel";

let runtimeSession: AuthUser | null = null;

export function loadAuthSession(): AuthUser | null {
  return runtimeSession;
}

export function saveAuthSession(session: AuthUser | null) {
  runtimeSession = session;
}

export function clearAuthSession() {
  runtimeSession = null;
}

export function authHeaders(headers?: HeadersInit) {
  const session = loadAuthSession();
  const next = new Headers(headers);
  if (session?.token) {
    next.set("Authorization", `Bearer ${session.token}`);
  }
  return next;
}

export async function apiFetch(input: string, init?: RequestInit) {
  return fetch(input, {
    ...init,
    headers: authHeaders(init?.headers)
  });
}

export function resolveAssetUrl(value: string) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  if (/^https?:\/\//i.test(source) || source.startsWith("data:")) {
    return source;
  }

  if (source.startsWith("/")) {
    return source;
  }

  return `/${source.replace(/^\.?\//, "")}`;
}
