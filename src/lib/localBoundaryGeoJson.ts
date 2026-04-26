import type { FeatureCollection } from "geojson";
import { validateGeoJson } from "./validateBoundaryGeoJson";

/**
 * Demo reliability: Indonesia ADM1 choropleth uses a cached file only — no runtime geoBoundaries/GitHub fetch.
 *
 * To update boundaries: download IDN ADM1 GeoJSON once (e.g. from geoBoundaries or your GIS export) and save as:
 *   public/geo/IDN_ADM1.geojson
 * Served in the browser at: /geo/IDN_ADM1.geojson (Vite: files under public/ are served from site root, not /public/...).
 */
export const LOCAL_IDN_ADM1_PATH = "geo/IDN_ADM1.geojson";

/** URL path served from `public/geo/` (Vite: not `/public/geo/...`). Respects `import.meta.env.BASE_URL`. */
export function localCachedBoundaryUrl(): string {
  const base = import.meta.env.BASE_URL;
  if (!base || base === "/") {
    return `/${LOCAL_IDN_ADM1_PATH}`;
  }
  const root = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${root}/${LOCAL_IDN_ADM1_PATH}`;
}

export type BoundaryLoadDiagnostics = {
  url: string;
  validationOk: boolean;
  validationReason: string;
  rawFeatureCount: number | null;
  renderedFeatureCount: number | null;
  firstFeaturePropertyKeys: string[] | null;
};

export type LoadCachedIdnAdm1Result =
  | { status: "ok"; collection: FeatureCollection; diagnostics: BoundaryLoadDiagnostics }
  | { status: "fallback"; diagnostics: BoundaryLoadDiagnostics; bannerMessage: string };

/**
 * Fetch cached ADM1 GeoJSON from `public/geo/IDN_ADM1.geojson` and validate.
 * Does not call geoBoundaries or other remote boundary APIs.
 */
export async function loadCachedIdnAdm1Boundary(
  signal: AbortSignal
): Promise<LoadCachedIdnAdm1Result> {
  const url = localCachedBoundaryUrl();

  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch {
    return {
      status: "fallback",
      bannerMessage: "Cached boundary file missing. Showing province grid fallback.",
      diagnostics: {
        url,
        validationOk: false,
        validationReason: "Network error while fetching boundary file.",
        rawFeatureCount: null,
        renderedFeatureCount: null,
        firstFeaturePropertyKeys: null,
      },
    };
  }

  if (res.status === 404) {
    return {
      status: "fallback",
      bannerMessage: "Cached boundary file missing. Showing province grid fallback.",
      diagnostics: {
        url,
        validationOk: false,
        validationReason: "HTTP 404 — file not found at this URL.",
        rawFeatureCount: null,
        renderedFeatureCount: null,
        firstFeaturePropertyKeys: null,
      },
    };
  }

  if (!res.ok) {
    return {
      status: "fallback",
      bannerMessage: "Cached boundary file missing. Showing province grid fallback.",
      diagnostics: {
        url,
        validationOk: false,
        validationReason: `HTTP ${res.status} when loading boundary file.`,
        rawFeatureCount: null,
        renderedFeatureCount: null,
        firstFeaturePropertyKeys: null,
      },
    };
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    return {
      status: "fallback",
      bannerMessage: "Invalid boundary file: Could not read response body. Showing province grid fallback.",
      diagnostics: {
        url,
        validationOk: false,
        validationReason: "Could not read response body.",
        rawFeatureCount: null,
        renderedFeatureCount: null,
        firstFeaturePropertyKeys: null,
      },
    };
  }

  if (!text.trim()) {
    return {
      status: "fallback",
      bannerMessage: "Invalid boundary file: Boundary file is empty. Showing province grid fallback.",
      diagnostics: {
        url,
        validationOk: false,
        validationReason: "Boundary file is empty.",
        rawFeatureCount: null,
        renderedFeatureCount: null,
        firstFeaturePropertyKeys: null,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const hint = e instanceof SyntaxError ? e.message : "parse error";
    return {
      status: "fallback",
      bannerMessage: `Invalid boundary file: Not valid JSON (${hint}). Showing province grid fallback.`,
      diagnostics: {
        url,
        validationOk: false,
        validationReason: `Not valid JSON: ${hint}`,
        rawFeatureCount: null,
        renderedFeatureCount: null,
        firstFeaturePropertyKeys: null,
      },
    };
  }

  const v = validateGeoJson(parsed);
  if (!v.ok) {
    return {
      status: "fallback",
      bannerMessage: `Invalid boundary file: ${v.reason}. Showing province grid fallback.`,
      diagnostics: {
        url,
        validationOk: false,
        validationReason: v.reason,
        rawFeatureCount: null,
        renderedFeatureCount: null,
        firstFeaturePropertyKeys: null,
      },
    };
  }

  return {
    status: "ok",
    collection: v.collection,
    diagnostics: {
      url,
      validationOk: true,
      validationReason: v.reason,
      rawFeatureCount: v.totalFeatures,
      renderedFeatureCount: v.renderedFeatureCount,
      firstFeaturePropertyKeys: v.firstFeaturePropertyKeys,
    },
  };
}
