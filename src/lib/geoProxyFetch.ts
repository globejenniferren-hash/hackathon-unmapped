/**
 * Same-origin URL rewriting for geoBoundaries + GitHub fetches (optional; used only by `geoBoundariesUrls.ts`).
 * The dashboard map does not use this path; it loads `public/geo/IDN_ADM1.geojson` instead.
 */
function withBase(path: string): string {
  const b = import.meta.env.BASE_URL;
  if (!b || b === "/") return path.startsWith("/") ? path : `/${path}`;
  const root = b.endsWith("/") ? b.slice(0, -1) : b;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${root}${p}`;
}

/** Rewrite known external URLs to `/edge-*` paths handled by Vite (dev) or Vercel (prod). */
export function toProxiedUrl(absoluteUrl: string): string {
  try {
    const u = new URL(absoluteUrl);
    if (u.hostname === "www.geoboundaries.org" && u.pathname.startsWith("/api/")) {
      return withBase(`/edge-gb${u.pathname.replace(/^\/api/, "")}${u.search}`);
    }
    if (u.hostname === "api.github.com") {
      return withBase(`/edge-gh-api${u.pathname}${u.search}`);
    }
    if (u.hostname === "media.githubusercontent.com") {
      return withBase(`/edge-gh-media${u.pathname}${u.search}`);
    }
  } catch {
    /* ignore */
  }
  return absoluteUrl;
}

export function proxiedFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(toProxiedUrl(input), init);
}
