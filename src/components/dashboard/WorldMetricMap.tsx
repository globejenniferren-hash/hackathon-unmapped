import type { Feature, FeatureCollection } from "geojson";
import L, { type PathOptions } from "leaflet";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";

export type WorldMetricKey = "gap" | "aiRisk";

type WorldMetricMapProps = {
  metric: WorldMetricKey;
  countryCode: string;
  countryGapPct: number;
  countryAiRiskPct: number;
  year: number;
};

const WORLD_GEOJSON_URL =
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

type MetricRow = {
  gapPct: number;
  aiRiskPct: number;
};

function hashCode(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function evolveMetricByYear(base: number, seed: number, year: number): number {
  const yearOffset = year - 2026;
  const drift = ((seed % 13) - 5) * 0.32; // about -1.6..+2.6 pct per year
  const wave = Math.sin((seed % 90) + year * 0.85) * 0.9;
  return clamp(base + yearOffset * drift + wave, 0, 100);
}

function toCountryCode(f: Feature): string | null {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const candidates = [
    p["ISO3166-1-Alpha-3"],
    p.ISO_A3,
    p.iso_a3,
    p.ADM0_A3,
    p.adm0_a3,
    p.ISO3,
    p.iso3,
  ];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim() && raw !== "-99") return raw.trim().toUpperCase();
  }
  return null;
}

function toCountryCode2(f: Feature): string | null {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const candidates = [p["ISO3166-1-Alpha-2"], p.ISO_A2, p.iso_a2];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim() && raw !== "-99") return raw.trim().toUpperCase();
  }
  return null;
}

function toCountryName(f: Feature): string {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const candidates = [p.ADMIN, p.admin, p.NAME, p.name, p.COUNTRY, p.country, p.NAME_EN, p.name_en];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "Unknown";
}

function buildGlobalMetrics(
  collection: FeatureCollection,
  focusIso3: string,
  focusGap: number,
  focusAiRisk: number,
  year: number
): Map<string, MetricRow> {
  const rows = new Map<string, MetricRow>();
  for (const f of collection.features) {
    const iso3 = toCountryCode(f);
    if (!iso3) continue;
    const seed = hashCode(iso3);
    const gapBase = 22 + (seed % 44); // 22 - 65
    const aiBase = 16 + ((seed >>> 4) % 54); // 16 - 69
    const gapPct = evolveMetricByYear(gapBase, seed, year);
    const aiRiskPct = evolveMetricByYear(aiBase, seed >>> 2, year);
    rows.set(iso3, { gapPct, aiRiskPct });
  }
  rows.set(focusIso3, {
    gapPct: evolveMetricByYear(clamp(focusGap, 0, 100), hashCode(`${focusIso3}:gap`), year),
    aiRiskPct: evolveMetricByYear(clamp(focusAiRisk, 0, 100), hashCode(`${focusIso3}:ai`), year),
  });
  return rows;
}

function resolveFocusIso3(collection: FeatureCollection, countryCode: string): string {
  const code = countryCode.trim().toUpperCase();
  if (!code) return "IDN";
  if (code.length === 3) return code;
  if (code.length === 2) {
    for (const f of collection.features) {
      if (toCountryCode2(f) === code) {
        return toCountryCode(f) ?? "IDN";
      }
    }
  }
  return code;
}

function metricColor(metric: WorldMetricKey, value: number): string {
  const t = clamp(value / 100, 0, 1);
  if (metric === "gap") {
    if (t < 0.2) return "#fef3c7";
    if (t < 0.4) return "#fde68a";
    if (t < 0.6) return "#f59e0b";
    if (t < 0.8) return "#ea580c";
    return "#b91c1c";
  }
  if (t < 0.2) return "#e6f2ef";
  if (t < 0.4) return "#bfded7";
  if (t < 0.6) return "#7fb4aa";
  if (t < 0.8) return "#3f8f82";
  return "#1f6b62";
}

function metricLabel(metric: WorldMetricKey): string {
  return metric === "gap" ? "Response gap" : "AI risk";
}

function mapTooltipHtml(countryName: string, metric: WorldMetricKey, value: number): string {
  return `<div class="dash-map-tip"><strong>${countryName}</strong><br/>${metricLabel(metric)}: ${value.toFixed(1)}%</div>`;
}

function FitWorld({ collection }: { collection: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    const gj = L.geoJSON(collection as never);
    const b = gj.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [20, 20], maxZoom: 5 });
  }, [collection, map]);

  useEffect(() => {
    const timers: number[] = [];
    const kick = (delay: number) => {
      const t = window.setTimeout(() => map.invalidateSize(), delay);
      timers.push(t);
    };

    // Re-tile a few times as parent cards/fonts/layout settle.
    kick(0);
    kick(120);
    kick(320);

    const container = map.getContainer();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        map.invalidateSize();
      });
      ro.observe(container);
      return () => {
        ro.disconnect();
        timers.forEach((t) => window.clearTimeout(t));
      };
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [map]);

  return null;
}

export function WorldMetricMap({ metric, countryCode, countryGapPct, countryAiRiskPct, year }: WorldMetricMapProps) {
  const [collection, setCollection] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setError(null);
        const res = await fetch(WORLD_GEOJSON_URL, { signal: ac.signal });
        if (!res.ok) throw new Error(`GeoJSON load failed (${res.status})`);
        const json = (await res.json()) as FeatureCollection;
        if (!json || json.type !== "FeatureCollection") throw new Error("Invalid world boundary format");
        setCollection(json);
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load world map");
      }
    })();
    return () => ac.abort();
  }, []);

  const metrics = useMemo(() => {
    if (!collection) return null;
    const focusIso3 = resolveFocusIso3(collection, countryCode);
    return buildGlobalMetrics(collection, focusIso3, countryGapPct, countryAiRiskPct, year);
  }, [collection, countryCode, countryGapPct, countryAiRiskPct, year]);

  const styleFeature = useCallback(
    (feature?: Feature): PathOptions => {
      if (!feature || !metrics) return { fillColor: "#cbd5e1", fillOpacity: 0.8, color: "#94a3b8", weight: 0.45 };
      const iso3 = toCountryCode(feature);
      const row = iso3 ? metrics.get(iso3) : null;
      const value = row ? (metric === "gap" ? row.gapPct : row.aiRiskPct) : 0;
      return {
        fillColor: metricColor(metric, value),
        fillOpacity: 0.82,
        color: "#cbd5e1",
        weight: 0.5,
        opacity: 1,
      };
    },
    [metric, metrics]
  );

  const onEach = useCallback(
    (feature: Feature, layer: L.Layer) => {
      if (!metrics) return;
      const iso3 = toCountryCode(feature);
      const row = iso3 ? metrics.get(iso3) : null;
      const value = row ? (metric === "gap" ? row.gapPct : row.aiRiskPct) : 0;
      layer.bindTooltip(mapTooltipHtml(toCountryName(feature), metric, value), {
        sticky: true,
        direction: "auto",
        className: "dash-map-tooltip",
      });
    },
    [metric, metrics]
  );

  if (error) return <p className="dash-placeholder">World map unavailable: {error}</p>;
  if (!collection || !metrics) return <p className="dash-placeholder">Loading world-level view…</p>;

  return (
    <div className="dash-map-wrap">
      <MapContainer
        className="dash-leaflet dash-leaflet--world"
        center={[10, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={6}
        scrollWheelZoom={false}
      >
        <FitWorld collection={collection} />
        <GeoJSON data={collection} style={styleFeature as L.StyleFunction<Feature>} onEachFeature={onEach} />
      </MapContainer>
    </div>
  );
}
