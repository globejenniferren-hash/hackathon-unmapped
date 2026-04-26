import { applyBudget } from "./dashboardFormat";
import { getRisk, riskBand } from "./loadDashboardData";
import type { Intervention, InterventionResponse, ProvinceRiskResponse } from "../types/dashboard";

export type HighestRisk = { id: string; name: string; risk: number } | null;

export function computeHighestRiskProvince(
  provinces: ProvinceRiskResponse["provinces"],
  year: number
): HighestRisk {
  let best: HighestRisk = null;
  for (const p of provinces) {
    const r = getRisk(p, year);
    if (r == null) continue;
    if (!best || r > best.risk) best = { id: p.id, name: p.name, risk: r };
  }
  return best;
}

export function computeAverageNationalRisk(
  provinces: ProvinceRiskResponse["provinces"],
  year: number
): number | null {
  const vals = provinces
    .map((p) => getRisk(p, year))
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Sum projected jobs across all provinces at current budget % (demo national view). */
export function computeNationalJobTotals(
  data: InterventionResponse,
  budgetPercent: number
): { created: number; protected: number } {
  let created = 0;
  let prot = 0;
  for (const bucket of Object.values(data.byProvince)) {
    const list = bucket?.interventions ?? [];
    const s = applyBudget(list, budgetPercent);
    created += s.totalC;
    prot += s.totalP;
  }
  return { created, protected: prot };
}

/** Demo-only resilience score from existing intervention fields (not a mock JSON field). */
export function computeResilienceScore(i: Intervention): number {
  const costM = Math.max(i.estimatedCostUsd / 1_000_000, 0.25);
  const jobs = i.baseJobsCreated + i.baseJobsProtected;
  const raw = 42 + jobs / 900 + 12 / i.rank - costM * 1.5;
  return Math.min(97, Math.max(38, Math.round(raw)));
}

/** Indicative connectivity-style score derived from risk (no new JSON fields). */
export function modeledConnectivityScore(risk01: number | null): number | null {
  if (risk01 == null) return null;
  const v = Math.round(58 + (0.42 - risk01) * 85);
  return Math.min(94, Math.max(32, v));
}

export function riskDriverChips(
  p: ProvinceRiskResponse["provinces"][0] | undefined,
  year: number,
  legend: ProvinceRiskResponse["legend"]
): string[] {
  if (!p) return [];
  const r = getRisk(p, year);
  const r26 = getRisk(p, 2026);
  const r31 = getRisk(p, 2031);
  const chips: string[] = [];
  if (r != null) {
    const b = riskBand(r, legend);
    if (b === "critical" || b === "high") chips.push("Above-threshold exposure");
    else if (b === "medium") chips.push("Moderate exposure band");
    else chips.push("Lower band vs. peers");
  }
  if (r26 != null && r31 != null && r31 - r26 >= 0.12) chips.push("Steep 2026–2031 trajectory");
  else if (r26 != null && r31 != null && r31 > r26) chips.push("Rising automation pressure");
  return chips.slice(0, 3);
}
