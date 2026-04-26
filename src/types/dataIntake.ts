import type { Intervention, InterventionResponse, ProvinceRiskResponse } from "./dashboard";

export type DataIntakeApply =
  | {
      type: "riskByYear";
      provinceId: string;
      adjustments: Record<string, number>;
    }
  | {
      type: "intervention";
      provinceId: string;
      interventionId: string;
      patch: Partial<Intervention>;
    }
  | {
      type: "laborMarket";
      medianRealWageGrowthYoY?: number;
      informalSharePct?: number;
      regionNoteByProvinceId?: Record<string, string>;
    };

export type ProposedUpdate = {
  id: string;
  dataset: string;
  region: string;
  regionId: string;
  field: string;
  currentValue: string;
  proposedValue: string;
  confidence: number;
  evidenceSnippet: string;
  apply: DataIntakeApply;
};

export type DataIntakeCatalog = {
  meta: { mock?: boolean; note?: string };
  documents: Record<string, { proposedUpdates: ProposedUpdate[] }>;
};

export type DataIntakeAnalyzeResponse = {
  meta?: { mock?: boolean; note?: string };
  proposedUpdates: ProposedUpdate[];
};

export type LaborSignals = {
  medianRealWageGrowthYoY: number;
  informalSharePct: number;
  /** Optional per-province note shown when labor doc proposes it */
  regionNotes: Record<string, string>;
};

export function defaultLaborSignals(): LaborSignals {
  return {
    medianRealWageGrowthYoY: 3.2,
    informalSharePct: 58.5,
    regionNotes: {},
  };
}

export function cloneProvinceRisk(r: ProvinceRiskResponse): ProvinceRiskResponse {
  return JSON.parse(JSON.stringify(r)) as ProvinceRiskResponse;
}

export function cloneInterventionResponse(r: InterventionResponse): InterventionResponse {
  return JSON.parse(JSON.stringify(r)) as InterventionResponse;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Apply approved proposals in stable id order. Baseline must be cloned before call if you need to preserve originals. */
export function buildDisplayRisk(
  baseline: ProvinceRiskResponse,
  proposals: ProposedUpdate[],
  approvedIds: ReadonlySet<string>
): ProvinceRiskResponse {
  const out = cloneProvinceRisk(baseline);
  const sorted = [...proposals].filter((p) => approvedIds.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sorted) {
    const a = p.apply;
    if (a.type !== "riskByYear") continue;
    const prov = out.provinces.find((x) => x.id === a.provinceId);
    if (!prov) continue;
    for (const [y, delta] of Object.entries(a.adjustments)) {
      const cur = prov.riskByYear[y];
      if (typeof cur === "number") prov.riskByYear[y] = clamp01(cur + delta);
    }
  }
  return out;
}

export function buildDisplayInterventions(
  baseline: InterventionResponse,
  proposals: ProposedUpdate[],
  approvedIds: ReadonlySet<string>
): InterventionResponse {
  const out = cloneInterventionResponse(baseline);
  const sorted = [...proposals].filter((p) => approvedIds.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sorted) {
    const a = p.apply;
    if (a.type !== "intervention") continue;
    const bucket = out.byProvince[a.provinceId];
    if (!bucket?.interventions) continue;
    const idx = bucket.interventions.findIndex((i) => i.id === a.interventionId);
    if (idx < 0) continue;
    bucket.interventions[idx] = { ...bucket.interventions[idx], ...a.patch };
  }
  return out;
}

export function buildLaborSignals(
  baseline: LaborSignals,
  proposals: ProposedUpdate[],
  approvedIds: ReadonlySet<string>
): LaborSignals {
  const out: LaborSignals = {
    medianRealWageGrowthYoY: baseline.medianRealWageGrowthYoY,
    informalSharePct: baseline.informalSharePct,
    regionNotes: { ...baseline.regionNotes },
  };
  const sorted = [...proposals].filter((p) => approvedIds.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sorted) {
    const a = p.apply;
    if (a.type !== "laborMarket") continue;
    if (typeof a.medianRealWageGrowthYoY === "number") {
      out.medianRealWageGrowthYoY = a.medianRealWageGrowthYoY;
    }
    if (typeof a.informalSharePct === "number") {
      out.informalSharePct = a.informalSharePct;
    }
    if (a.regionNoteByProvinceId) {
      for (const [k, v] of Object.entries(a.regionNoteByProvinceId)) {
        out.regionNotes[k] = v;
      }
    }
  }
  return out;
}
