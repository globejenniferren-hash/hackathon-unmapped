import { applyBudget, formatUsd } from "../../lib/dashboardFormat";
import { computeResilienceScore } from "../../lib/dashboardMetrics";
import type { Intervention } from "../../types/dashboard";

export type InterventionCardProps = {
  intervention: Intervention;
  budgetPercent: number;
};

export function InterventionCard({ intervention: i, budgetPercent }: InterventionCardProps) {
  const scale = applyBudget([i], budgetPercent);
  const s = scale.per(i);
  const res = computeResilienceScore(i);
  const top = i.rank === 1;

  return (
    <article className={"dash-inter-card" + (top ? " dash-inter-card--top" : "")}>
      <div className="dash-inter-card__head">
        <span className={"dash-rank" + (top ? " dash-rank--top" : "")}>Rank {i.rank}</span>
        <span className="dash-inter-card__res">Resilience {res}</span>
      </div>
      <h3 className="dash-inter-card__title">{i.title}</h3>
      <p className="dash-inter-card__loc">{i.titleLocal}</p>
      <p className="dash-inter-card__desc">{i.description}</p>
      <dl className="dash-inter-card__stats">
        <div>
          <dt>Cost</dt>
          <dd>{formatUsd(i.estimatedCostUsd)}</dd>
        </div>
        <div>
          <dt>Jobs @ budget</dt>
          <dd>
            {s.c.toLocaleString()} / {s.p.toLocaleString()}
          </dd>
        </div>
      </dl>
    </article>
  );
}
