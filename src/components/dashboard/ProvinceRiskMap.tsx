import type { Feature, FeatureCollection } from "geojson";
import L, { type PathOptions } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { formatPct01 } from "../../lib/dashboardFormat";
import type { BoundaryLoadDiagnostics } from "../../lib/localBoundaryGeoJson";
import { loadCachedIdnAdm1Boundary, localCachedBoundaryUrl } from "../../lib/localBoundaryGeoJson";
import { getRisk, riskBand } from "../../lib/loadDashboardData";
import {
  computeBoundaryMockMatchDiagnostics,
  getShapeLabel,
  normalizeRegionKey,
  resolveProvinceIdFromBoundaryProperties,
  type BoundaryMockMatchDiagnostics,
} from "../../lib/provinceNameMatch";
import type { ProvinceRiskResponse } from "../../types/dashboard";

const RISK_FILL = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ea580c",
  critical: "#dc2626",
  missing: "#cbd5e1",
} as const;

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
  year: number
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
    lines.push(`Risk: ${formatPct01(r)}`);
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

function BoundaryDevDiag({ d }: { d: BoundaryLoadDiagnostics }) {
  return (
    <div className="dash-map-boundary-diag" aria-label="Boundary load diagnostics">
      <span className="dash-map-boundary-diag__label">Boundary (dev)</span>
      <code className="dash-map-boundary-diag__url">{d.url}</code>
      <span className={d.validationOk ? "dash-map-boundary-diag__ok" : "dash-map-boundary-diag__bad"}>
        {d.validationOk ? "valid" : "invalid"} — {d.validationReason}
      </span>
      {d.rawFeatureCount != null && (
        <span>
          features: {d.renderedFeatureCount ?? 0} rendered / {d.rawFeatureCount} in file
        </span>
      )}
      {d.firstFeaturePropertyKeys && d.firstFeaturePropertyKeys.length > 0 && (
        <span>first feature keys: {d.firstFeaturePropertyKeys.join(", ")}</span>
      )}
    </div>
  );
}

export function ProvinceRiskMap({
  selectedYear,
  provinceRiskData,
  selectedProvince,
  onSelectProvince,
  fallback,
  onBoundaryMatchDiagnostics,
}: ProvinceRiskMapProps) {
  const [phase, setPhase] = useState<"loading" | "ready" | "fallback">("loading");
  const [collection, setCollection] = useState<FeatureCollection | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<BoundaryLoadDiagnostics | null>(null);
  const matchCbRef = useRef(onBoundaryMatchDiagnostics);
  matchCbRef.current = onBoundaryMatchDiagnostics;

  useEffect(() => {
    const ac = new AbortController();
    setPhase("loading");
    setCollection(null);
    setFallbackMessage(null);
    setDiagnostics({ ...emptyDiagnostics(), url: localCachedBoundaryUrl() });
    matchCbRef.current?.(null);

    (async () => {
      const result = await loadCachedIdnAdm1Boundary(ac.signal);
      if (ac.signal.aborted) return;

      setDiagnostics(result.diagnostics);

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
      const band = r != null ? riskBand(r, provinceRiskData.legend) : "missing";
      const fill = band === "missing" ? RISK_FILL.missing : RISK_FILL[band];
      const selected = pid != null && pid === selectedProvince;
      return {
        fillColor: fill,
        fillOpacity: band === "missing" ? 0.45 : 0.82,
        color: selected ? "#0f766e" : "#f1f5f9",
        weight: selected ? 2.2 : 0.55,
        opacity: 1,
      };
    },
    [provinceRiskData, selectedYear, selectedProvince]
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
      const tip = buildMapTooltipHtml(label, pid, provinceRiskData.provinces, selectedYear);
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
    [onSelectProvince, provinceRiskData, selectedYear, styleFeature]
  );

  const geoKey = useMemo(
    () => `${selectedYear}-${selectedProvince ?? ""}-${collection?.features?.length ?? 0}`,
    [selectedYear, selectedProvince, collection]
  );

  const cacheUrl = useMemo(() => localCachedBoundaryUrl(), []);

  const showDevDiag = import.meta.env.DEV && diagnostics;

  if (phase === "loading") {
    return (
      <div className="dash-map-wrap dash-map-wrap--loading" aria-busy="true">
        <div className="dash-map-skeleton" />
        <p className="dash-map-load">Loading cached boundaries…</p>
        {showDevDiag && <BoundaryDevDiag d={diagnostics} />}
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
        {showDevDiag && <BoundaryDevDiag d={diagnostics} />}
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
          opacity={0.55}
        />
        <MapFitBounds collection={collection} />
        <GeoJSON
          key={geoKey}
          data={collection}
          style={styleFeature as L.StyleFunction<Feature>}
          onEachFeature={onEach}
        />
      </MapContainer>
      <p className="dash-map-meta">
        Indonesia ADM1 · Cached local boundaries · <code>{cacheUrl}</code>
      </p>
      {showDevDiag && diagnostics && <BoundaryDevDiag d={diagnostics} />}
    </div>
  );
}

function emptyDiagnostics(): BoundaryLoadDiagnostics {
  return {
    url: "",
    validationOk: false,
    validationReason: "Loading…",
    rawFeatureCount: null,
    renderedFeatureCount: null,
    firstFeaturePropertyKeys: null,
  };
}
