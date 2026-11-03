/** One transport configuration for local Vite and the hosted static build. */
export function normalizeBackendOrigin(value: string): string {
  if (!value.trim()) return "";
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VITE_BACKEND_ORIGIN must be an HTTP(S) origin without a path or credentials.");
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("A remote Eldoria backend must use HTTPS.");
  }
  return url.origin;
}

export const backendOrigin = normalizeBackendOrigin(import.meta.env.VITE_BACKEND_ORIGIN ?? "");
export const remoteBackend = backendOrigin !== "";

export function backendUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Backend paths must begin with one slash.");
  }
  return `${backendOrigin}${path}`;
}

export function mediaUrl(path: string): string {
  if (!path.startsWith("/media/")) throw new Error("Invalid Eldoria media path.");
  return backendUrl(path);
}

export function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(backendUrl(path), {
    ...init,
    // Private remote gateways need their own host-scoped login cookie.
    credentials: remoteBackend ? "include" : "same-origin",
  });
}
