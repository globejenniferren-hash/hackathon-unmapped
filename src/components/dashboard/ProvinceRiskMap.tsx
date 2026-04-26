import type { Feature, FeatureCollection } from "geojson";
import L, { type PathOptions } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";
import { formatPct01 } from "../../lib/dashboardFormat";
import { loadCachedIdnAdm1Boundary } from "../../lib/localBoundaryGeoJson";
import { getRisk } from "../../lib/loadDashboardData";
import {
  computeBoundaryMockMatchDiagnostics,
  getShapeLabel,
  normalizeRegionKey,
  resolveProvinceIdFromBoundaryProperties,
  type BoundaryMockMatchDiagnostics,
} from "../../lib/provinceNameMatch";
import type { ProvinceRiskResponse } from "../../types/dashboard";
import type { ProvincialMetricKey } from "./MapCanvas";

const RISK_FILL = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ea580c",
  critical: "#dc2626",
  missing: "#cbd5e1",
} as const;

const GAP_FILL = {
  low: "#fbbf24",
  medium: "#f59e0b",
  high: "#ea580c",
  critical: "#b91c1c",
  missing: "#cbd5e1",
} as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  const u = Math.max(0, Math.min(1, t));
  return rgbToHex(c1.r + (c2.r - c1.r) * u, c1.g + (c2.g - c1.g) * u, c1.b + (c2.b - c1.b) * u);
}

function continuousFillForRisk(risk01: number, metric: ProvincialMetricKey): string {
  const stops =
    metric === "gap"
      ? ["#fef3c7", "#fde68a", "#f59e0b", "#ea580c", "#b91c1c"]
      : ["#e6f2ef", "#bfded7", "#7fb4aa", "#3f8f82", "#1f6b62"];
  const t = Math.max(0, Math.min(1, risk01));
  const scaled = t * (stops.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;
  const left = stops[Math.max(0, Math.min(stops.length - 1, idx))];
  const right = stops[Math.max(0, Math.min(stops.length - 1, idx + 1))];
  return lerpColor(left, right, frac);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMapTooltipHtml(
  geoLabel: string,
  pid: string | null,
  provinces: ProvinceRiskResponse["provinces"],
  year: number,
  metric: ProvincialMetricKey
): string {
  const label = geoLabel.trim() || "Unknown";
  const escGeo = escapeHtml(label);
  const prov = pid ? provinces.find((p) => p.id === pid) : undefined;
  const r = prov ? getRisk(prov, year) : null;

  const lines = [`<strong>${escGeo}</strong>`];

  if (prov && r != null) {
    const sameName =
      normalizeRegionKey(label) === normalizeRegionKey(prov.name) ||
      normalizeRegionKey(label) === normalizeRegionKey(prov.nameLocal);
    if (!sameName) {
      lines.push(`<span class="dash-map-tip-meta">Mock: ${escapeHtml(prov.name)}</span>`);
    }
    lines.push(`${metric === "gap" ? "Response gap" : "AI risk"}: ${formatPct01(r)}`);
  } else {
    lines.push(`<span class="dash-map-tip-meta">No mock risk match</span>`);
  }

  return `<div class="dash-map-tip">${lines.join("<br/>")}</div>`;
}

export type ProvinceRiskMapProps = {
  selectedYear: number;
  provinceRiskData: ProvinceRiskResponse;
  selectedProvince: string | null;
  onSelectProvince: (id: string) => void;
  /** Shown when cached GeoJSON is missing, invalid, or empty after validation. */
  fallback: ReactNode;
  /** Called when boundary ↔ mock match stats change (for Demo Diagnostics). */
  onBoundaryMatchDiagnostics?: (d: BoundaryMockMatchDiagnostics | null) => void;
  metric: ProvincialMetricKey;
};

function MapFitBounds({ collection }: { collection: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    try {
      const gj = L.geoJSON(collection as never);
      const b = gj.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [28, 28], maxZoom: 6 });
      }
    } catch {
      /* ignore */
    }
  }, [map, collection]);
  return null;
}

export function ProvinceRiskMap({
  selectedYear,
  provinceRiskData,
  selectedProvince,
  onSelectProvince,
  fallback,
  onBoundaryMatchDiagnostics,
  metric,
}: ProvinceRiskMapProps) {
  const [phase, setPhase] = useState<"loading" | "ready" | "fallback">("loading");
  const [collection, setCollection] = useState<FeatureCollection | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const matchCbRef = useRef(onBoundaryMatchDiagnostics);
  matchCbRef.current = onBoundaryMatchDiagnostics;

  useEffect(() => {
    const ac = new AbortController();
    setPhase("loading");
    setCollection(null);
    setFallbackMessage(null);
    matchCbRef.current?.(null);

    (async () => {
      const result = await loadCachedIdnAdm1Boundary(ac.signal);
      if (ac.signal.aborted) return;

      if (result.status === "ok") {
        if (import.meta.env.DEV) {
          const first = result.collection.features[0];
          console.info("[IDN_ADM1] first feature properties:", first?.properties ?? null);
        }
        setCollection(result.collection);
        setPhase("ready");
        return;
      }

      setFallbackMessage(result.bannerMessage);
      setPhase("fallback");
      setCollection(null);
    })();

    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!collection) {
      matchCbRef.current?.(null);
      return;
    }
    matchCbRef.current?.(
      computeBoundaryMockMatchDiagnostics(collection, provinceRiskData.provinces)
    );
  }, [collection, provinceRiskData]);

  const styleFeature = useCallback(
    (feature?: Feature): PathOptions => {
      if (!feature) {
        return { fillColor: RISK_FILL.missing, fillOpacity: 0.55, color: "#e5e7eb", weight: 0.4 };
      }
      const pid = resolveProvinceIdFromBoundaryProperties(
        feature.properties as Record<string, unknown>,
        provinceRiskData.provinces
      );
      const prov = pid ? provinceRiskData.provinces.find((p) => p.id === pid) : undefined;
      const r = prov ? getRisk(prov, selectedYear) : null;
      const palette = metric === "gap" ? GAP_FILL : RISK_FILL;
      const fill = r == null ? palette.missing : continuousFillForRisk(r, metric);
      const selected = pid != null && pid === selectedProvince;
      return {
        fillColor: fill,
        fillOpacity: r == null ? 0.45 : 0.82,
        color: selected ? "#0f766e" : "#f1f5f9",
        weight: selected ? 2.2 : 0.55,
        opacity: 1,
      };
    },
    [provinceRiskData, selectedYear, selectedProvince, metric]
  );

  const onEach = useCallback(
    (feature: Feature, layer: L.Layer) => {
      const label = getShapeLabel(feature.properties as Record<string, unknown>);
      const pid = resolveProvinceIdFromBoundaryProperties(
        feature.properties as Record<string, unknown>,
        provinceRiskData.provinces
      );
      const prov = pid ? provinceRiskData.provinces.find((p) => p.id === pid) : undefined;
      const r = prov ? getRisk(prov, selectedYear) : null;
      const tip = buildMapTooltipHtml(label, pid, provinceRiskData.provinces, selectedYear, metric);
      layer.bindTooltip(tip, { sticky: true, direction: "auto", className: "dash-map-tooltip" });
      layer.on("click", () => {
        if (pid) onSelectProvince(pid);
      });
      const path = layer as L.Path;
      path.on("mouseover", () => {
        path.setStyle({ weight: 1.6, fillOpacity: r != null ? 0.9 : 0.55 });
      });
      path.on("mouseout", () => {
        path.setStyle(styleFeature(feature));
      });
    },
    [onSelectProvince, provinceRiskData, selectedYear, styleFeature, metric]
  );

  const geoKey = useMemo(
    () => `${selectedYear}-${selectedProvince ?? ""}-${collection?.features?.length ?? 0}`,
    [selectedYear, selectedProvince, collection]
  );

  if (phase === "loading") {
    return (
      <div className="dash-map-wrap dash-map-wrap--loading" aria-busy="true">
        <div className="dash-map-skeleton" />
        <p className="dash-map-load">Loading cached boundaries…</p>
      </div>
    );
  }

  if (phase === "fallback" || !collection) {
    return (
      <div className="dash-map-fallback">
        <p className="dash-map-fallback__msg dash-map-fallback__msg--local" role="status">
          {fallbackMessage ?? "Cached boundary file missing. Showing province grid fallback."}
        </p>
        {fallback}
      </div>
    );
  }

  return (
    <div className="dash-map-wrap">
      <MapContainer
        className="dash-leaflet"
        center={[-2, 118]}
        zoom={4}
        scrollWheelZoom={false}
        attributionControl
        minZoom={3}
        maxZoom={10}
      >
        <MapFitBounds collection={collection} />
        <GeoJSON
          key={geoKey}
          data={collection}
          style={styleFeature as L.StyleFunction<Feature>}
          onEachFeature={onEach}
        />
      </MapContainer>
    </div>
  );
}
