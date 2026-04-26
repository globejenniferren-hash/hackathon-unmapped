import { getRisk, riskBand } from "../../lib/loadDashboardData";
import { formatPct01 } from "../../lib/dashboardFormat";
import { modeledConnectivityScore, riskDriverChips } from "../../lib/dashboardMetrics";
import type { LaborSignals } from "../../types/dataIntake";
import type { ProvinceRiskResponse } from "../../types/dashboard";

export type SelectedProvincePanelProps = {
  displayRisk: ProvinceRiskResponse;
  selected: ProvinceRiskResponse["provinces"][0] | undefined;
  selectedId: string | null;
  year: number;
  displayLabor: LaborSignals;
  intakeOverridesActive: boolean;
};

export function SelectedProvincePanel({
  displayRisk,
  selected,
  selectedId,
  year,
  displayLabor,
  intakeOverridesActive,
}: SelectedProvincePanelProps) {
  const r = selected ? getRisk(selected, year) : null;
  const band = r != null ? riskBand(r, displayRisk.legend) : null;
  const drivers = riskDriverChips(selected, year, displayRisk.legend);
  const conn = modeledConnectivityScore(r);

  return (
    <section className="dash-card dash-card--sticky">
      <div className="dash-section-head">
        <h2 className="dash-h2">Selected province</h2>
        <p className="dash-muted">Decision focus</p>
      </div>

      {!selected && (
        <p className="dash-placeholder">Select a province on the grid to load detail.</p>
      )}

      {selected && (
        <>
          <div className="dash-prov-head">
            <h3 className="dash-h3">{selected.name}</h3>
            <p className="dash-sub">{selected.nameLocal}</p>
          </div>

          <dl className="dash-metrics">
            <div className="dash-metrics__row">
              <dt>Risk score ({year})</dt>
              <dd>{formatPct01(r)}</dd>
            </div>
            <div className="dash-metrics__row">
              <dt>Risk level</dt>
              <dd>
                {band ? (
                  <span className={"dash-chip dash-chip--" + band}>{displayRisk.legend.labels[band]}</span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="dash-metrics__row">
              <dt>Region</dt>
              <dd>{selected.region}</dd>
            </div>
            {selected.populationHint != null && (
              <div className="dash-metrics__row">
                <dt>Population (hint)</dt>
                <dd>~{selected.populationHint}M</dd>
              </div>
            )}
          </dl>

          <div className="dash-field">
            <span className="dash-eyebrow">Top risk drivers</span>
            <div className="dash-chip-row">
              {drivers.map((d) => (
                <span className="dash-chip dash-chip--neutral" key={d}>
                  {d}
                </span>
              ))}
            </div>
          </div>

          <div className="dash-field">
            <span className="dash-eyebrow">Modeled connectivity (demo)</span>
            <p className="dash-metric-lg">{conn != null ? `${conn} / 100` : "—"}</p>
            <p className="dash-micro">Indicative score derived from exposure index for this prototype.</p>
          </div>

          <div className="dash-field">
            <span className="dash-eyebrow">Labor market signals</span>
            <dl className="dash-metrics dash-metrics--compact">
              <div className="dash-metrics__row">
                <dt>Real wage growth (YoY)</dt>
                <dd>{displayLabor.medianRealWageGrowthYoY.toFixed(1)}%</dd>
              </div>
              <div className="dash-metrics__row">
                <dt>Informal share (hint)</dt>
                <dd>{displayLabor.informalSharePct.toFixed(1)}%</dd>
              </div>
            </dl>
            {selectedId && displayLabor.regionNotes[selectedId] && (
              <p className="dash-note dash-note--blue">{displayLabor.regionNotes[selectedId]}</p>
            )}
          </div>

          {intakeOverridesActive && (
            <div className="dash-callout">
              <span className="dash-eyebrow">Why this changed</span>
              <p className="dash-callout__text">
                Approved AI intake rows recalibrated province indices and downstream job projections for this
                session.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
