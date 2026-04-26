import type { BoundaryMockMatchDiagnostics } from "../../lib/provinceNameMatch";
import type { ProvinceRiskResponse } from "../../types/dashboard";
import { ProvinceRiskMap } from "./ProvinceRiskMap";
import { ProvinceGridFallback } from "./ProvinceRiskGrid";

const YEARS_FALLBACK = [2026, 2027, 2028, 2029, 2030, 2031];

const RISK_COLORS = {
  low: "#16a34a",
  medium: "#d97706",
  high: "#ea580c",
  critical: "#dc2626",
} as const;

export type MapCanvasProps = {
  displayRisk: ProvinceRiskResponse;
  year: number;
  onYearChange: (y: number) => void;
  selectedId: string | null;
  onSelectProvince: (id: string) => void;
  onBoundaryMatchDiagnostics?: (d: BoundaryMockMatchDiagnostics | null) => void;
};

export function MapCanvas({
  displayRisk,
  year,
  onYearChange,
  selectedId,
  onSelectProvince,
  onBoundaryMatchDiagnostics,
}: MapCanvasProps) {
  const yearsInData = displayRisk.years?.length ? displayRisk.years : YEARS_FALLBACK;
  const yMin = Math.min(...yearsInData);
  const yMax = Math.max(...yearsInData);

  const gridProps: MapCanvasProps = {
    displayRisk,
    year,
    onYearChange,
    selectedId,
    onSelectProvince,
  };

  return (
    <section className="dash-map-canvas dash-card dash-card--lift">
      <div className="dash-map-canvas__head">
        <h2 className="dash-map-canvas__title">Regional AI displacement risk</h2>
        <p className="dash-map-canvas__hint">Indonesia provinces · local cached GeoJSON or grid fallback</p>
      </div>

      <div className="dash-map-canvas__viz">
        <ProvinceRiskMap
          selectedYear={year}
          provinceRiskData={displayRisk}
          selectedProvince={selectedId}
          onSelectProvince={onSelectProvince}
          fallback={<ProvinceGridFallback {...gridProps} />}
          onBoundaryMatchDiagnostics={onBoundaryMatchDiagnostics}
        />
      </div>

      <div className="dash-year-block dash-year-block--map">
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

      <div className="dash-legend dash-legend--map" role="list" aria-label="Risk legend">
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

      <p className="dash-map-foot dash-map-foot--compact">
        Mock risk from <code>/mock/provinceRiskResponse.json</code> · Boundaries from{" "}
        <code>/geo/IDN_ADM1.geojson</code> (place file under <code>public/geo/</code>)
      </p>
    </section>
  );
}
