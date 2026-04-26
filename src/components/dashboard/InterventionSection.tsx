import { applyBudget } from "../../lib/dashboardFormat";
import type { Intervention, InterventionResponse } from "../../types/dashboard";
import { InterventionCard } from "./InterventionCard";

export type InterventionSectionProps = {
  interMeta: InterventionResponse["meta"];
  list: Intervention[];
  budgetPercent: number;
  onBudgetChange: (pct: number) => void;
  loadState: "idle" | "loading" | "ok" | "err";
  selectedProvinceId: string | null;
  provinceName?: string;
};

export function InterventionSection({
  interMeta,
  list,
  budgetPercent,
  onBudgetChange,
  loadState,
  selectedProvinceId,
  provinceName,
}: InterventionSectionProps) {
  const scale = applyBudget(list, budgetPercent);

  if (loadState === "loading" && list.length === 0) {
    return (
      <section className="dash-section dash-section--wide dash-card">
        <p className="dash-placeholder">Loading interventions…</p>
      </section>
    );
  }
  if (loadState === "err" && list.length === 0) {
    return (
      <section className="dash-section dash-section--wide dash-card">
        <p className="dash-placeholder" role="alert">
          Intervention list unavailable.
        </p>
      </section>
    );
  }
  if (!selectedProvinceId) {
    return (
      <section className="dash-section dash-section--wide dash-card">
        <h2 className="dash-h2">Recommended interventions</h2>
        <p className="dash-placeholder">Select a province to load ranked programs.</p>
      </section>
    );
  }
  if (list.length === 0) {
    return (
      <section className="dash-section dash-section--wide dash-card">
        <h2 className="dash-h2">Recommended interventions</h2>
        <p className="dash-placeholder">No mock interventions for {provinceName ?? "this province"}.</p>
      </section>
    );
  }

  return (
    <section className="dash-section dash-section--wide dash-card">
      <div className="dash-section-head dash-section-head--row">
        <div>
          <h2 className="dash-h2">Recommended interventions</h2>
          <p className="dash-muted">
            {interMeta.dataSource} · {provinceName ?? "Selected province"}
          </p>
        </div>
      </div>

      <div className="dash-budget-hero">
        <div className="dash-budget-hero__control">
          <span className="dash-eyebrow">Programme budget</span>
          <div className="dash-budget-hero__pct">{budgetPercent}%</div>
          <input
            className="dash-year-slider dash-year-slider--narrow"
            type="range"
            min={0}
            max={100}
            step={1}
            value={budgetPercent}
            onChange={(e) => onBudgetChange(Number(e.target.value))}
            aria-label="Programme budget percent"
          />
        </div>
        <div className="dash-budget-hero__nums">
          <div>
            <span className="dash-eyebrow">Jobs created</span>
            <div className="dash-big-num">{scale.totalC.toLocaleString()}</div>
          </div>
          <div>
            <span className="dash-eyebrow">Jobs protected</span>
            <div className="dash-big-num">{scale.totalP.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <p className="dash-micro" style={{ marginTop: "-0.25rem", marginBottom: "1rem" }}>
        {interMeta.disclaimer}
      </p>

      <div className="dash-inter-grid">
        {[...list]
          .sort((a, b) => a.rank - b.rank)
          .map((i) => (
            <InterventionCard key={i.id} intervention={i} budgetPercent={budgetPercent} />
          ))}
      </div>
    </section>
  );
}
