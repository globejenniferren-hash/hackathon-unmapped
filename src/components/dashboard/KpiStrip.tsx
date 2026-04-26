import type { HighestRisk } from "../../lib/dashboardMetrics";
import { formatPct01 } from "../../lib/dashboardFormat";
import { KpiCard } from "./KpiCard";

export type KpiStripProps = {
  year: number;
  highest: HighestRisk;
  averageRisk: number | null;
  jobsCreated: number;
  jobsProtected: number;
};

export function KpiStrip({ year, highest, averageRisk, jobsCreated, jobsProtected }: KpiStripProps) {
  return (
    <section className="dash-kpi-strip" aria-label="Key indicators">
      <KpiCard
        label="Highest-risk province"
        value={highest ? `${highest.name}` : "—"}
        hint={highest ? `${formatPct01(highest.risk)} · ${year}` : undefined}
        emphasize
      />
      <KpiCard
        label="Average national risk"
        value={formatPct01(averageRisk)}
        hint={`All provinces · ${year}`}
      />
      <KpiCard
        label="Projected jobs created"
        value={jobsCreated.toLocaleString()}
        hint="National roll-up at budget %"
      />
      <KpiCard
        label="Projected jobs protected"
        value={jobsProtected.toLocaleString()}
        hint="National roll-up at budget %"
      />
    </section>
  );
}
