import type { Feature, FeatureCollection, Geometry } from "geojson";

const POLYGON_TYPES = new Set(["Polygon", "MultiPolygon"]);

function isPolygonalGeometry(g: unknown): g is Geometry {
  if (!g || typeof g !== "object") return false;
  const t = (g as { type?: unknown }).type;
  return typeof t === "string" && POLYGON_TYPES.has(t);
}

/** Normalize root to a candidate object (wrap a lone Feature as a one-item collection). */
function normalizeRoot(data: unknown): { root: Record<string, unknown>; wrappedFromFeature: boolean } | null {
  if (data == null) return null;
  if (typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type === "Feature") {
    return { root: { type: "FeatureCollection", features: [d] }, wrappedFromFeature: true };
  }
  return { root: d, wrappedFromFeature: false };
}

export type ValidateGeoJsonResult =
  | {
      ok: true;
      reason: string;
      collection: FeatureCollection;
      /** Features in file before filtering */
      totalFeatures: number;
      /** Features kept (Polygon / MultiPolygon, type Feature) */
      renderedFeatureCount: number;
      wrappedFromFeature: boolean;
      firstFeaturePropertyKeys: string[];
    }
  | { ok: false; reason: string };

/**
 * Validates cached boundary JSON for the choropleth.
 * Accepts a FeatureCollection with a non-empty features array, or a single Feature (wrapped).
 * Keeps only Feature objects whose geometry is Polygon or MultiPolygon.
 */
export function validateGeoJson(data: unknown): ValidateGeoJsonResult {
  if (data == null || data === "") {
    return { ok: false, reason: "Boundary file is empty." };
  }

  if (typeof data !== "object") {
    return { ok: false, reason: "Boundary file is not a JSON object." };
  }

  const raw = data as Record<string, unknown>;

  if (raw.type === "Topology") {
    return {
      ok: false,
      reason: "Expected FeatureCollection, got Topology (convert to GeoJSON for this demo).",
    };
  }

  const norm = normalizeRoot(data);
  if (!norm) {
    return { ok: false, reason: "Boundary file is empty." };
  }

  const { root, wrappedFromFeature } = norm;

  if (root.type !== "FeatureCollection") {
    return {
      ok: false,
      reason: `Expected FeatureCollection, got ${String(root.type ?? "unknown")}.`,
    };
  }

  if (!Array.isArray(root.features)) {
    return { ok: false, reason: "Boundary file has no features array." };
  }

  if (root.features.length === 0) {
    return { ok: false, reason: "Boundary file contains zero features." };
  }

  const validFeatures = root.features.filter((f): f is Feature => {
    if (!f || typeof f !== "object") return false;
    const feat = f as Record<string, unknown>;
    if (feat.type !== "Feature") return false;
    return isPolygonalGeometry(feat.geometry);
  });

  if (validFeatures.length === 0) {
    return {
      ok: false,
      reason:
        "Boundary file has no valid features with geometry (need Feature objects with Polygon or MultiPolygon).",
    };
  }

  const first = validFeatures[0];
  const props = first.properties;
  const firstFeaturePropertyKeys =
    props && typeof props === "object" && !Array.isArray(props)
      ? Object.keys(props as Record<string, unknown>)
      : [];

  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: validFeatures,
  };

  return {
    ok: true,
    reason: "Valid GeoJSON.",
    collection,
    totalFeatures: root.features.length,
    renderedFeatureCount: validFeatures.length,
    wrappedFromFeature,
    firstFeaturePropertyKeys,
  };
}
