import type { CSSProperties } from "react";
import { getRisk, riskBand } from "../../lib/loadDashboardData";
import { formatPct01 } from "../../lib/dashboardFormat";
import type { ProvinceRiskResponse } from "../../types/dashboard";
import { ProvinceRiskMap } from "./ProvinceRiskMap";

const YEARS_FALLBACK = [2026, 2027, 2028, 2029, 2030, 2031];

const RISK_COLORS = {
  low: "#16a34a",
  medium: "#d97706",
  high: "#ea580c",
  critical: "#dc2626",
} as const;

export type ProvinceRiskGridProps = {
  displayRisk: ProvinceRiskResponse;
  year: number;
  onYearChange: (y: number) => void;
  selectedId: string | null;
  onSelectProvince: (id: string) => void;
};

export function ProvinceGridFallback({
  displayRisk,
  year,
  selectedId,
  onSelectProvince,
}: ProvinceRiskGridProps) {
  return (
    <div className="dash-prov-grid" role="list">
      {displayRisk.provinces.map((p) => {
        const v = getRisk(p, year);
        const b = v != null ? riskBand(v, displayRisk.legend) : "medium";
        const active = p.id === selectedId;
        const accent = RISK_COLORS[b];
        return (
          <button
            type="button"
            key={p.id}
            className={"dash-prov" + (active ? " dash-prov--active" : "")}
            style={
              {
                "--prov-accent": accent,
                "--prov-tint":
                  b === "low"
                    ? "rgba(22, 163, 74, 0.12)"
                    : b === "medium"
                      ? "rgba(217, 119, 6, 0.14)"
                      : b === "high"
                        ? "rgba(234, 88, 12, 0.14)"
                        : "rgba(220, 38, 38, 0.12)",
              } as CSSProperties
            }
            onClick={() => onSelectProvince(p.id)}
            role="listitem"
          >
            <span className="dash-prov__name">{p.name}</span>
            <span className="dash-prov__risk">{formatPct01(v)}</span>
            <span className="dash-prov__band" style={{ color: accent }}>
              {displayRisk.legend.labels[b]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ProvinceRiskGrid(props: ProvinceRiskGridProps) {
  const { displayRisk, year, onYearChange, selectedId, onSelectProvince } = props;
  const yearsInData = displayRisk.years?.length ? displayRisk.years : YEARS_FALLBACK;
  const yMin = Math.min(...yearsInData);
  const yMax = Math.max(...yearsInData);

  return (
    <section className="dash-card dash-card--lift">
      <div className="dash-section-head">
        <h2 className="dash-h2">Regional risk map</h2>
        <p className="dash-muted">Indonesia ADM1 choropleth · list fallback if boundaries fail to load</p>
      </div>

      <div className="dash-year-block">
        <div className="dash-year-block__label">
          <span className="dash-eyebrow">Simulation year</span>
          <span className="dash-year-block__value">{year}</span>
        </div>
        <input
          className="dash-year-slider"
          type="range"
          min={yMin}
          max={yMax}
          step={1}
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          aria-valuemin={yMin}
          aria-valuemax={yMax}
          aria-valuenow={year}
          aria-label="Simulation year"
        />
        <div className="dash-year-ticks" aria-hidden>
          <span>{yMin}</span>
          <span>{yMax}</span>
        </div>
      </div>

      <div className="dash-legend" role="list" aria-label="Risk legend">
        {(
          [
            ["low", displayRisk.legend.labels.low],
            ["medium", displayRisk.legend.labels.medium],
            ["high", displayRisk.legend.labels.high],
            ["critical", displayRisk.legend.labels.critical],
          ] as const
        ).map(([k, label]) => (
          <span className="dash-legend__item" key={k} role="listitem">
            <span className="dash-legend__sw" style={{ background: RISK_COLORS[k] }} />
            {label}
          </span>
        ))}
        <span className="dash-legend__item" role="listitem">
          <span className="dash-legend__sw" style={{ background: "#cbd5e1" }} />
          No mock match
        </span>
      </div>

      <ProvinceRiskMap
        selectedYear={year}
        provinceRiskData={displayRisk}
        selectedProvince={selectedId}
        onSelectProvince={onSelectProvince}
        fallback={<ProvinceGridFallback {...props} />}
      />

      <p className="dash-map-foot">
        Mock risk from <code>/mock/provinceRiskResponse.json</code> · Boundaries from{" "}
        <code>/geo/IDN_ADM1.geojson</code> (cached under <code>public/geo/</code>).
      </p>
    </section>
  );
}
