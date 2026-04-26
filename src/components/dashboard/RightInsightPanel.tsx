import { applyBudget, formatPct01 } from "../../lib/dashboardFormat";
import { getRisk, riskBand } from "../../lib/loadDashboardData";
import { modeledConnectivityScore, riskDriverChips } from "../../lib/dashboardMetrics";
import type { LaborSignals } from "../../types/dataIntake";
import type { Intervention, InterventionResponse, ProvinceRiskResponse } from "../../types/dashboard";
import { InterventionCard } from "./InterventionCard";

export type RightInsightPanelProps = {
  displayRisk: ProvinceRiskResponse;
  selected: ProvinceRiskResponse["provinces"][0] | undefined;
  selectedId: string | null;
  year: number;
  displayLabor: LaborSignals;
  aiOverrideActive: boolean;
  budgetPercent: number;
  onBudgetChange: (pct: number) => void;
  interMeta: InterventionResponse["meta"];
  interventions: Intervention[];
  loadState: "idle" | "loading" | "ok" | "err";
};

export function RightInsightPanel({
  displayRisk,
  selected,
  selectedId,
  year,
  displayLabor,
  aiOverrideActive,
  budgetPercent,
  onBudgetChange,
  interMeta,
  interventions,
  loadState,
}: RightInsightPanelProps) {
  const r = selected ? getRisk(selected, year) : null;
  const band = r != null ? riskBand(r, displayRisk.legend) : null;
  const drivers = riskDriverChips(selected, year, displayRisk.legend);
  const penetration = modeledConnectivityScore(r);

  const sorted = [...interventions].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const scale = applyBudget(interventions, budgetPercent);

  return (
    <div className="dash-right-stack">
      <section className="dash-right-card">
        <div className="dash-right-card__head">
          <h2 className="dash-h2">Selected province</h2>
          {aiOverrideActive && (
            <span className="dash-badge dash-badge--teal dash-badge--sm">AI-extracted override active</span>
          )}
        </div>

        {!selected && (
          <p className="dash-placeholder">Select a province on the map or grid.</p>
        )}

        {selected && (
          <>
            <div className="dash-prov-head dash-prov-head--tight">
              <h3 className="dash-h3">{selected.name}</h3>
              <p className="dash-sub">{selected.nameLocal}</p>
            </div>
            <dl className="dash-metrics dash-metrics--tight">
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
            </dl>

            <div className="dash-field dash-field--tight">
              <span className="dash-eyebrow">Top at-risk clusters</span>
              <div className="dash-chip-row">
                {drivers.map((d) => (
                  <span className="dash-chip dash-chip--neutral" key={d}>
                    {d}
                  </span>
                ))}
              </div>
            </div>

            <div className="dash-field dash-field--tight">
              <span className="dash-eyebrow">Internet penetration (modeled)</span>
              <p className="dash-metric-lg dash-metric-lg--sm">{penetration != null ? `${penetration} / 100` : "—"}</p>
            </div>

            <div className="dash-field dash-field--tight">
              <span className="dash-eyebrow">Labor market signals</span>
              <dl className="dash-metrics dash-metrics--compact">
                <div className="dash-metrics__row">
                  <dt>Real wage growth (YoY)</dt>
                  <dd>{displayLabor.medianRealWageGrowthYoY.toFixed(1)}%</dd>
                </div>
                <div className="dash-metrics__row">
                  <dt>Informal share</dt>
                  <dd>{displayLabor.informalSharePct.toFixed(1)}%</dd>
                </div>
              </dl>
              {selectedId && displayLabor.regionNotes[selectedId] && (
                <p className="dash-note dash-note--blue dash-note--tight">{displayLabor.regionNotes[selectedId]}</p>
              )}
            </div>
          </>
        )}
      </section>

      <section className="dash-right-card">
        <h2 className="dash-h2">Impact / budget</h2>
        <p className="dash-muted dash-muted--inline">{interMeta.disclaimer}</p>
        <div className="dash-budget-hero dash-budget-hero--stack">
          <div className="dash-budget-hero__control">
            <span className="dash-eyebrow">Programme budget</span>
            <div className="dash-budget-hero__pct">{budgetPercent}%</div>
            <input
              className="dash-year-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={budgetPercent}
              onChange={(e) => onBudgetChange(Number(e.target.value))}
              aria-label="Programme budget percent"
            />
          </div>
          <div className="dash-budget-hero__nums dash-budget-hero__nums--col">
            <div>
              <span className="dash-eyebrow">Projected jobs created</span>
              <div className="dash-big-num">{scale.totalC.toLocaleString()}</div>
            </div>
            <div>
              <span className="dash-eyebrow">Projected jobs protected</span>
              <div className="dash-big-num">{scale.totalP.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="dash-right-card dash-right-card--grow">
        <div className="dash-section-head dash-section-head--row">
          <div>
            <h2 className="dash-h2">Recommended interventions</h2>
            <p className="dash-muted">
              {interMeta.dataSource} · {selected?.name ?? "Province"}
            </p>
          </div>
        </div>

        {loadState === "loading" && interventions.length === 0 && (
          <p className="dash-placeholder">Loading…</p>
        )}
        {!selectedId && <p className="dash-placeholder">Select a province for ranked programs.</p>}
        {selectedId && interventions.length === 0 && loadState !== "loading" && (
          <p className="dash-placeholder">No mock interventions for this province.</p>
        )}
        <div className="dash-right-inter-grid">
          {sorted.map((i) => (
            <InterventionCard key={i.id} intervention={i} budgetPercent={budgetPercent} />
          ))}
        </div>
      </section>
    </div>
  );
}
