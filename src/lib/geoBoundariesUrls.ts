/**
 * Optional developer utilities for fetching geoBoundaries-hosted GeoJSON (metadata + Git LFS resolution).
 * The government dashboard does not import this module on page load; boundaries come from
 * `public/geo/IDN_ADM1.geojson` via `localBoundaryGeoJson.ts` instead.
 */
import type { FeatureCollection } from "geojson";
import { proxiedFetch } from "./geoProxyFetch";

/** geoBoundaries GitHub `raw` links often return a Git LFS pointer, not JSON. */
export function isGitLfsPointerBody(body: string): boolean {
  return body.trimStart().startsWith("version https://git-lfs.github.com/spec");
}

export type ParsedGithubGeoPath = {
  owner: string;
  repo: string;
  ref: string;
  path: string;
};

/** Parse `github.com/{o}/{r}/raw/{ref}/{path}` or `raw.githubusercontent.com/{o}/{r}/{ref}/{path}`. */
export function parseGithubGeoUrl(url: string): ParsedGithubGeoPath | null {
  try {
    const u = new URL(url);
    if (u.hostname === "github.com") {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/);
      if (m) return { owner: m[1], repo: m[2], ref: m[3], path: m[4] };
    }
    if (u.hostname === "raw.githubusercontent.com") {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
      if (m) return { owner: m[1], repo: m[2], ref: m[3], path: m[4] };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function resolveFullCommitSha(
  owner: string,
  repo: string,
  ref: string,
  signal: AbortSignal
): Promise<string> {
  if (/^[a-f0-9]{40}$/i.test(ref)) return ref;
  const res = await proxiedFetch(`https://api.github.com/repos/${owner}/${repo}/commits/${ref}`, {
    signal,
  });
  if (!res.ok) {
    throw new Error(`GitHub commit resolve ${res.status} (rate limit or network)`);
  }
  const j = (await res.json()) as { sha?: string };
  if (!j.sha || !/^[a-f0-9]{40}$/i.test(j.sha)) {
    throw new Error("GitHub API did not return a full commit SHA");
  }
  return j.sha;
}

function assertFeatureCollection(gj: unknown): asserts gj is FeatureCollection {
  const o = gj as FeatureCollection;
  if (o?.type !== "FeatureCollection" || !Array.isArray(o.features)) {
    throw new Error("Invalid GeoJSON");
  }
}

/**
 * Fetch GeoJSON from geoBoundaries `gjDownloadURL` / `simplifiedGeometryGeoJSON`.
 * Handles Git LFS pointer responses by resolving `media.githubusercontent.com` URLs.
 * All HTTP goes through `proxiedFetch` (same-origin `/edge-*` in dev + Vercel).
 */
export async function fetchGeoBoundariesGeoJson(
  downloadUrl: string,
  signal: AbortSignal
): Promise<FeatureCollection> {
  const res = await proxiedFetch(downloadUrl, { signal, redirect: "follow" });
  if (!res.ok) throw new Error(`GeoJSON download ${res.status}`);
  let text = await res.text();

  if (!isGitLfsPointerBody(text)) {
    const gj = JSON.parse(text) as unknown;
    assertFeatureCollection(gj);
    return gj;
  }

  const parsed = parseGithubGeoUrl(downloadUrl);
  if (!parsed) {
    throw new Error("GeoJSON is stored in Git LFS; URL is not a resolvable GitHub path");
  }

  const fullSha = await resolveFullCommitSha(parsed.owner, parsed.repo, parsed.ref, signal);
  const mediaUrl = `https://media.githubusercontent.com/media/${parsed.owner}/${parsed.repo}/${fullSha}/${parsed.path}`;
  const res2 = await proxiedFetch(mediaUrl, { signal, redirect: "follow" });
  if (!res2.ok) throw new Error(`LFS media download ${res2.status}`);
  text = await res2.text();
  if (isGitLfsPointerBody(text)) {
    throw new Error("Git LFS pointer persisted after media URL fetch");
  }
  const gj = JSON.parse(text) as unknown;
  assertFeatureCollection(gj);
  return gj;
}
