import type { CountryConfig, InterventionResponse, ProvinceRiskResponse } from "../types/dashboard";

/** Prefer mock when unset or "true" (Vercel: VITE_USE_MOCK_API=true). */
export function useMockByDefault(): boolean {
  return import.meta.env.VITE_USE_MOCK_API !== "false";
}

function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${path.replace(/^\//, "")}`;
}

async function readJsonOrThrow<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  return (await res.json()) as T;
}

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" ? (v as AnyRecord) : null;
}

function normalizeProvinceId(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^ID-[A-Z0-9]+$/.test(s)) return s.toLowerCase();
  return s.toLowerCase();
}

function toProvinceId(p: AnyRecord, idx: number): string {
  const maybeId = p.id ?? p.provinceCode ?? p.code ?? p.name ?? p.provinceName;
  if (typeof maybeId === "string" && maybeId.trim()) return normalizeProvinceId(maybeId);
  return `province-${idx + 1}`;
}

function toProvinceName(p: AnyRecord, id: string): string {
  const maybeName = p.name ?? p.provinceName ?? p.nameLocal ?? p.id ?? p.provinceCode;
  if (typeof maybeName === "string" && maybeName.trim()) return maybeName;
  return id;
}

function toRiskByYear(
  p: AnyRecord,
  years: number[],
  baseline: number
): Record<string, number> {
  const out: Record<string, number> = {};
  const existing = asRecord(p.riskByYear);
  if (existing) {
    for (const [k, v] of Object.entries(existing)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  const displacement = asRecord(p.displacement_by_year);
  if (displacement) {
    for (const [k, v] of Object.entries(displacement)) {
      if (!(k in out) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  if (!Object.keys(out).length) {
    for (const y of years) out[String(y)] = baseline;
  }
  const seedSource =
    (typeof p.id === "string" && p.id) ||
    (typeof p.provinceCode === "string" && p.provinceCode) ||
    (typeof p.name === "string" && p.name) ||
    (typeof p.provinceName === "string" && p.provinceName) ||
    "province";
  let seed = 0;
  for (let i = 0; i < seedSource.length; i += 1) seed = (seed * 33 + seedSource.charCodeAt(i)) % 2147483647;
  const yearlyDrift = ((seed % 25) - 10) / 1000; // -0.010 .. +0.014 per year
  const cyclicalAmp = ((seed >> 3) % 9) / 1000; // 0 .. 0.008

  const available = years
    .map((y) => out[String(y)])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const minYear = years.length ? Math.min(...years) : 2026;
  const anchor = available.length ? available[0] : baseline;
  for (const y of years) {
    const k = String(y);
    if (typeof out[k] === "number" && Number.isFinite(out[k])) continue;
    const yearOffset = y - minYear;
    const projected = anchor + yearlyDrift * yearOffset + Math.sin((seed % 360) + y) * cyclicalAmp;
    out[k] = Math.max(0.08, Math.min(0.95, Number(projected.toFixed(4))));
  }

  // If all years are identical, inject a gentle deterministic projection so slider changes are visible.
  const values = years
    .map((y) => out[String(y)])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const uniqueCount = new Set(values.map((v) => v.toFixed(4))).size;
  if (values.length > 1 && uniqueCount <= 1) {
    for (const y of years) {
      const yearOffset = y - minYear;
      const projected = anchor + yearlyDrift * yearOffset + Math.sin((seed % 360) + y) * Math.max(cyclicalAmp, 0.0015);
      out[String(y)] = Math.max(0.08, Math.min(0.95, Number(projected.toFixed(4))));
    }
  }
  return out;
}

function normalizeProvinceRiskResponse(raw: ProvinceRiskResponse): ProvinceRiskResponse {
  const rec = asRecord(raw) ?? {};
  const inputYears = Array.isArray(rec.years)
    ? rec.years.filter((y): y is number => typeof y === "number" && Number.isFinite(y))
    : [];
  const years = inputYears.length ? inputYears : [2026, 2027, 2028, 2029, 2030, 2031];
  const nationalBaseline = asRecord(rec.nationalBaseline);
  const nationalRiskIndex = asRecord(nationalBaseline?.nationalRiskIndex);

  const fallbackRisk =
    typeof rec.riskScore === "number"
      ? rec.riskScore
      : typeof nationalRiskIndex?.value === "number"
        ? (nationalRiskIndex.value as number)
        : 0.34;

  const provincesArray = Array.isArray(rec.provinces) ? rec.provinces : [];
  const normalizedProvinces = provincesArray.map((entry, idx) => {
    const p = asRecord(entry) ?? {};
    const id = toProvinceId(p, idx);
    const name = toProvinceName(p, id);
    const riskScore = typeof p.riskScore === "number" ? p.riskScore : fallbackRisk;
    return {
      ...p,
      id,
      name,
      nameLocal: typeof p.nameLocal === "string" ? p.nameLocal : name,
      region: typeof p.region === "string" ? p.region : "Unknown",
      populationHint: typeof p.populationHint === "number" ? p.populationHint : 0,
      riskByYear: toRiskByYear(p, years, riskScore),
    };
  });

  const rawByProvince = asRecord(rec.byProvince);
  const byProvince: Record<string, unknown> = {};
  if (rawByProvince) {
    for (const [k, v] of Object.entries(rawByProvince)) {
      const bucket = asRecord(v) ?? {};
      const key = normalizeProvinceId(k);
      byProvince[key] = {
        ...bucket,
        riskByYear: asRecord(bucket.riskByYear) ?? {},
      };
      if (key !== k) byProvince[k] = byProvince[key];
    }
  } else {
    for (const p of normalizedProvinces) {
      const key = typeof p.id === "string" ? p.id : String(p.name);
      byProvince[key] = { ...p, riskByYear: asRecord(p.riskByYear) ?? {} };
      const provinceCode = (p as AnyRecord).provinceCode;
      if (typeof provinceCode === "string" && provinceCode.trim()) {
        byProvince[provinceCode] = byProvince[key];
      }
    }
  }

  const legend =
    asRecord(rec.legend) ??
    ({
      lowMax: 0.25,
      mediumMax: 0.5,
      highMax: 0.75,
      labels: { low: "Low", medium: "Medium", high: "High", critical: "Critical" },
    } as const);

  const meta =
    asRecord(rec.meta) ??
    ({
      title: "National Automation Risk Dashboard",
      country:
        typeof rec.countryCode === "string"
          ? rec.countryCode
          : typeof rec.countryIso3 === "string"
            ? rec.countryIso3
            : "ID",
      countryName: "Indonesia",
      dataSource:
        typeof rec.provinceDataSource === "string" ? rec.provinceDataSource : "mock_normalized_payload",
      unit: "risk_index_0_to_1",
      disclaimer: "Normalized from backend payload for dashboard compatibility.",
    } as const);

  return {
    ...(raw as object),
    meta: meta as ProvinceRiskResponse["meta"],
    years,
    legend: legend as ProvinceRiskResponse["legend"],
    provinces: normalizedProvinces as ProvinceRiskResponse["provinces"],
    byProvince: byProvince as Record<string, ProvinceRiskResponse["provinces"][0]>,
  } as ProvinceRiskResponse;
}

function normalizeInterventionItem(entry: AnyRecord, idx: number): AnyRecord {
  return {
    ...entry,
    id: typeof entry.id === "string" ? entry.id : `intv_${idx + 1}`,
    rank: typeof entry.rank === "number" ? entry.rank : idx + 1,
    title: typeof entry.title === "string" ? entry.title : `Intervention ${idx + 1}`,
    titleLocal:
      typeof entry.titleLocal === "string"
        ? entry.titleLocal
        : typeof entry.title === "string"
          ? entry.title
          : `Intervention ${idx + 1}`,
    description:
      typeof entry.description === "string"
        ? entry.description
        : typeof entry.deliveryPartner === "string"
          ? `Delivery partner: ${entry.deliveryPartner}`
          : "Recommended intervention.",
    baseJobsCreated: typeof entry.baseJobsCreated === "number" ? entry.baseJobsCreated : 0,
    baseJobsProtected: typeof entry.baseJobsProtected === "number" ? entry.baseJobsProtected : 0,
    estimatedCostUsd: typeof entry.estimatedCostUsd === "number" ? entry.estimatedCostUsd : 0,
  };
}

function normalizeInterventionResponse(raw: InterventionResponse): InterventionResponse {
  const rec = asRecord(raw) ?? {};
  const byProvinceRaw = asRecord(rec.byProvince);
  const byProvince: Record<string, { interventions: unknown[] }> = {};

  if (byProvinceRaw) {
    for (const [k, v] of Object.entries(byProvinceRaw)) {
      const bucket = asRecord(v) ?? {};
      const list =
        Array.isArray(bucket.interventions) && bucket.interventions.length
          ? bucket.interventions
          : Array.isArray(bucket.recommendedInterventions)
            ? bucket.recommendedInterventions
            : [];
      const key = normalizeProvinceId(k);
      byProvince[key] = {
        interventions: list.map((i, idx) => normalizeInterventionItem(asRecord(i) ?? {}, idx)),
      };
      if (key !== k) byProvince[k] = byProvince[key];
    }
  } else if (Array.isArray(rec.provinces)) {
    for (const [idx, entry] of rec.provinces.entries()) {
      const p = asRecord(entry) ?? {};
      const id = toProvinceId(p, idx);
      const list =
        Array.isArray(p.interventions) && p.interventions.length
          ? p.interventions
          : Array.isArray(p.recommendedInterventions)
            ? p.recommendedInterventions
            : [];
      byProvince[id] = {
        interventions: list.map((i, iIdx) => normalizeInterventionItem(asRecord(i) ?? {}, iIdx)),
      };
    }
  } else {
    const rawId =
      (typeof rec.provinceCode === "string" && rec.provinceCode) ||
      (typeof rec.provinceName === "string" && rec.provinceName) ||
      "ID-JB";
    const id = normalizeProvinceId(rawId);
    const list =
      Array.isArray(rec.interventions) && rec.interventions.length
        ? rec.interventions
        : Array.isArray(rec.recommendedInterventions)
          ? rec.recommendedInterventions
          : [];
    byProvince[id] = {
      interventions: list.map((i, idx) => normalizeInterventionItem(asRecord(i) ?? {}, idx)),
    };
    if (id !== rawId) byProvince[rawId] = byProvince[id];
  }

  const meta =
    asRecord(rec.meta) ??
    ({
      dataSource: "normalized_intervention_payload",
      disclaimer: "Normalized from backend payload for dashboard compatibility.",
    } as const);

  return {
    ...(raw as object),
    country:
      typeof rec.country === "string"
        ? rec.country
        : typeof rec.countryCode === "string"
          ? rec.countryCode
          : "ID",
    meta: meta as InterventionResponse["meta"],
    byProvince: byProvince as InterventionResponse["byProvince"],
  } as InterventionResponse;
}

export type SkillDemandSignal = {
  skill: string;
  demandScore: number; // normalized 0..1
};

function normalizeSkillLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

type EscoSkill = { title?: string; skill_type?: string };
type EscoOccupation = { title?: string; skills?: EscoSkill[] };
type EscoTaxonomy = { occupations?: EscoOccupation[] };
type WicProjectionBucket = {
  no_education_pct?: number;
  primary_pct?: number;
  secondary_pct?: number;
  post_secondary_pct?: number;
  population_thousands?: number;
};
type WicProjectionFile = {
  countries?: Record<string, { projections?: Record<string, WicProjectionBucket> }>;
};
type BpsProvincialRow = {
  provinceCode?: string;
  provinceName?: string;
  avg_working_hours_weekly?: number;
  avg_monthly_net_income_idr?: number;
};
type BpsProvincialFile = {
  provinces?: BpsProvincialRow[];
};

type SectorWeights = { agriculture: number; industry: number; services: number };

function normalizeSectorWeights(input: Partial<SectorWeights>): SectorWeights {
  const a = typeof input.agriculture === "number" && Number.isFinite(input.agriculture) ? Math.max(0, input.agriculture) : 0;
  const i = typeof input.industry === "number" && Number.isFinite(input.industry) ? Math.max(0, input.industry) : 0;
  const s = typeof input.services === "number" && Number.isFinite(input.services) ? Math.max(0, input.services) : 0;
  const sum = a + i + s;
  if (sum <= 0) return { agriculture: 0.25, industry: 0.25, services: 0.5 };
  return { agriculture: a / sum, industry: i / sum, services: s / sum };
}

function classifyOccupationSector(title: string): keyof SectorWeights {
  const t = title.toLowerCase();
  const agricultureHints = [
    "farm",
    "agric",
    "fish",
    "forestry",
    "crop",
    "livestock",
    "animal husbandry",
    "harvest",
    "plantation",
    "ranch",
  ];
  const industryHints = [
    "factory",
    "manufactur",
    "production",
    "mechanic",
    "technician",
    "engineer",
    "construction",
    "mining",
    "welding",
    "operator",
    "assembler",
    "electrician",
    "repair",
  ];
  for (const h of agricultureHints) {
    if (t.includes(h)) return "agriculture";
  }
  for (const h of industryHints) {
    if (t.includes(h)) return "industry";
  }
  return "services";
}

function latestSeriesValue(series: unknown): number | null {
  const rec = asRecord(series);
  if (!rec) return null;
  const entries = Object.entries(rec)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .sort(([a], [b]) => Number(b) - Number(a));
  if (!entries.length) return null;
  return entries[0][1] as number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateYearValue(points: Array<{ year: number; value: number }>, targetYear: number): number | null {
  const clean = points
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.value))
    .sort((a, b) => a.year - b.year);
  if (!clean.length) return null;
  if (targetYear <= clean[0].year) return clean[0].value;
  if (targetYear >= clean[clean.length - 1].year) return clean[clean.length - 1].value;
  for (let i = 0; i < clean.length - 1; i += 1) {
    const left = clean[i];
    const right = clean[i + 1];
    if (targetYear >= left.year && targetYear <= right.year) {
      const span = right.year - left.year;
      const t = span <= 0 ? 0 : (targetYear - left.year) / span;
      return lerp(left.value, right.value, t);
    }
  }
  return clean[clean.length - 1].value;
}

function riskLevel(v: number): "low" | "medium" | "high" | "critical" {
  if (v <= 0.25) return "low";
  if (v <= 0.5) return "medium";
  if (v <= 0.75) return "high";
  return "critical";
}

function scoreFromBpsRow(
  row: BpsProvincialRow,
  wageBounds: { min: number; max: number },
  hoursBounds: { min: number; max: number }
): number {
  const wage = typeof row.avg_monthly_net_income_idr === "number" ? row.avg_monthly_net_income_idr : wageBounds.min;
  const hours = typeof row.avg_working_hours_weekly === "number" ? row.avg_working_hours_weekly : hoursBounds.min;
  const wageNorm =
    wageBounds.max > wageBounds.min ? (wage - wageBounds.min) / (wageBounds.max - wageBounds.min) : 0.5;
  const hoursNorm =
    hoursBounds.max > hoursBounds.min ? (hours - hoursBounds.min) / (hoursBounds.max - hoursBounds.min) : 0.5;
  // Higher wage and longer hours imply lower vulnerability in this demo proxy.
  const score = 0.72 - wageNorm * 0.42 - hoursNorm * 0.12;
  return Math.max(0.1, Math.min(0.92, Number(score.toFixed(4))));
}

async function loadWittgensteinYearMultiplier(countryIso3: string, years: number[]): Promise<Record<string, number>> {
  const multipliers: Record<string, number> = {};
  try {
    const raw = await readJsonOrThrow<WicProjectionFile>(publicUrl("data/projections/wittgenstein.json"));
    const country = asRecord(raw.countries?.[countryIso3]);
    const projections = asRecord(country?.projections);
    if (!projections) {
      for (const y of years) multipliers[String(y)] = 1;
      return multipliers;
    }
    const postSecondaryPoints: Array<{ year: number; value: number }> = [];
    for (const [y, bucket] of Object.entries(projections)) {
      const yr = Number(y);
      const rec = asRecord(bucket);
      const pct = rec?.post_secondary_pct;
      if (Number.isFinite(yr) && typeof pct === "number" && Number.isFinite(pct)) {
        postSecondaryPoints.push({ year: yr, value: pct });
      }
    }
    const baseline2025 = interpolateYearValue(postSecondaryPoints, 2025) ?? 0;
    for (const y of years) {
      const postSec = interpolateYearValue(postSecondaryPoints, y);
      if (postSec == null) {
        multipliers[String(y)] = 1;
        continue;
      }
      const uplift = Math.max(0, postSec - baseline2025);
      // More post-secondary attainment over time reduces response-gap pressure.
      multipliers[String(y)] = Math.max(0.84, Math.min(1.06, 1 - uplift * 0.012));
    }
    return multipliers;
  } catch {
    for (const y of years) multipliers[String(y)] = 1;
    return multipliers;
  }
}

async function applyBpsProvincialOverlay(
  base: ProvinceRiskResponse,
  countryIso3: string
): Promise<ProvinceRiskResponse> {
  try {
    const bps = await readJsonOrThrow<BpsProvincialFile>(publicUrl("data/provincial/idn-labor-feb2025-bps.json"));
    const rows = Array.isArray(bps.provinces) ? bps.provinces : [];
    if (!rows.length) return base;

    const wages = rows
      .map((r) => r.avg_monthly_net_income_idr)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const hours = rows
      .map((r) => r.avg_working_hours_weekly)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!wages.length || !hours.length) return base;

    const wageBounds = { min: Math.min(...wages), max: Math.max(...wages) };
    const hoursBounds = { min: Math.min(...hours), max: Math.max(...hours) };
    const yearMultiplier = await loadWittgensteinYearMultiplier(countryIso3, base.years);

    const provinceById = new Map(base.provinces.map((p) => [normalizeProvinceId(p.id), p]));
    const provinceByName = new Map(base.provinces.map((p) => [normalizeSkillLabel(p.name), p]));

    const merged = [...base.provinces];
    for (const row of rows) {
      const codeRaw = typeof row.provinceCode === "string" ? row.provinceCode : "";
      const code = normalizeProvinceId(codeRaw);
      const name = typeof row.provinceName === "string" ? row.provinceName : codeRaw || "Unknown";
      const existing =
        provinceById.get(code) ??
        provinceByName.get(normalizeSkillLabel(name));
      const baseScore = scoreFromBpsRow(row, wageBounds, hoursBounds);
      const riskByYear: Record<string, number> = {};
      const seedSource = code || name;
      let seed = 0;
      for (let i = 0; i < seedSource.length; i += 1) seed = (seed * 33 + seedSource.charCodeAt(i)) % 2147483647;
      const yearlyDelta = ((seed % 33) - 16) / 900; // about -0.018 .. +0.019 per year
      const yearWaveAmp = ((seed >> 4) % 8) / 1000; // 0 .. 0.007
      const minYear = base.years.length ? Math.min(...base.years) : 2026;
      for (const y of base.years) {
        const m = yearMultiplier[String(y)] ?? 1;
        const yearOffset = y - minYear;
        const wave = Math.sin((seed % 120) + yearOffset * 1.2) * yearWaveAmp;
        const projected = baseScore * m + yearlyDelta * yearOffset + wave;
        riskByYear[String(y)] = Math.max(0.08, Math.min(0.95, Number(projected.toFixed(4))));
      }

      if (existing) {
        existing.riskByYear = riskByYear;
        (existing as AnyRecord).riskScore = riskByYear[String(base.years[0])] ?? baseScore;
        (existing as AnyRecord).riskLevel = riskLevel((existing as AnyRecord).riskScore as number);
        (existing as AnyRecord).dataScope = "bps_feb_2025_provincial_extract";
        continue;
      }

      merged.push({
        id: code || name.toLowerCase(),
        name,
        nameLocal: name,
        region: "Unknown",
        populationHint: 0,
        riskByYear,
      });
    }

    const byProvince: Record<string, ProvinceRiskResponse["provinces"][0]> = {};
    for (const p of merged) {
      const k = normalizeProvinceId(p.id);
      byProvince[k] = p;
    }

    return {
      ...base,
      provinceDataSource: "bps_feb_2025_provincial_extract",
      provinces: merged,
      byProvince,
    } as ProvinceRiskResponse;
  } catch {
    return base;
  }
}

function sectorWeightsFromWorldBank(raw: unknown): SectorWeights | null {
  const rec = asRecord(raw);
  const indicators = asRecord(rec?.indicators);
  if (!indicators) return null;
  const services = latestSeriesValue(indicators.employment_services_pct);
  const agriculture = latestSeriesValue(indicators.employment_agriculture_pct);
  const industry = latestSeriesValue(indicators.employment_industry_pct);
  if (services == null && agriculture == null && industry == null) return null;
  return normalizeSectorWeights({
    services: services ?? 0,
    agriculture: agriculture ?? 0,
    industry: industry ?? 0,
  });
}

async function loadSectorEmploymentWeights(countryIso3: string): Promise<SectorWeights | null> {
  const iso3 = countryIso3.trim().toUpperCase();
  if (!iso3 || iso3.length !== 3) return null;
  try {
    const raw = await readJsonOrThrow<unknown>(publicUrl(`data/worldbank/${iso3}.json`));
    return sectorWeightsFromWorldBank(raw);
  } catch {
    return null;
  }
}

function deriveDemandFromEsco(raw: EscoTaxonomy, sectorWeights: SectorWeights): SkillDemandSignal[] {
  const occs = Array.isArray(raw.occupations) ? raw.occupations : [];
  const counts = new Map<string, number>();
  for (const occ of occs) {
    if (!Array.isArray(occ.skills)) continue;
    const sector = classifyOccupationSector(typeof occ.title === "string" ? occ.title : "");
    const occWeight = sectorWeights[sector];
    for (const s of occ.skills) {
      if (!s?.title || typeof s.title !== "string") continue;
      const k = normalizeSkillLabel(s.title);
      const wt = (s.skill_type === "competence" ? 1.25 : 1) * occWeight;
      counts.set(k, (counts.get(k) ?? 0) + wt);
    }
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  const max = entries.length ? entries[0][1] : 1;
  return entries.map(([skill, v]) => ({
    skill,
    demandScore: Math.max(0.05, Math.min(1, v / max)),
  }));
}

export function buildDummySupplyForCountry(
  countryCode: string,
  demand: SkillDemandSignal[]
): Record<string, number> {
  const seedBase = countryCode.split("").reduce((a, c) => a + c.charCodeAt(0), 97);
  const out: Record<string, number> = {};
  for (const d of demand) {
    let h = seedBase;
    for (let i = 0; i < d.skill.length; i += 1) h = (h * 33 + d.skill.charCodeAt(i)) % 2147483647;
    // deterministic pseudo-random 0.22..0.88, with slight pressure where demand is high
    const rnd = 0.22 + ((h % 6600) / 10000);
    const adjusted = Math.min(0.95, Math.max(0.12, rnd - d.demandScore * 0.18));
    out[d.skill] = Number(adjusted.toFixed(3));
  }
  return out;
}

export async function loadDemandSignals(): Promise<{
  data: SkillDemandSignal[];
  source: "mock" | "api";
}> {
  return loadDemandSignalsForCountry("IDN");
}

export async function loadDemandSignalsForCountry(countryIso3: string): Promise<{
  data: SkillDemandSignal[];
  source: "mock" | "api";
}> {
  const mock = useMockByDefault();
  const sectorWeights = (await loadSectorEmploymentWeights(countryIso3)) ?? normalizeSectorWeights({});
  if (mock) {
    const raw = await readJsonOrThrow<EscoTaxonomy>(publicUrl("data/taxonomy/esco-occupations.json"));
    return { data: deriveDemandFromEsco(raw, sectorWeights), source: "mock" };
  }
  try {
    const raw = await readJsonOrThrow<EscoTaxonomy>(publicUrl("api/data/taxonomy/esco-occupations"));
    return { data: deriveDemandFromEsco(raw, sectorWeights), source: "api" };
  } catch {
    const raw = await readJsonOrThrow<EscoTaxonomy>(publicUrl("data/taxonomy/esco-occupations.json"));
    return { data: deriveDemandFromEsco(raw, sectorWeights), source: "mock" };
  }
}

export async function loadProvinceRisk(
  year: number
): Promise<{ data: ProvinceRiskResponse; source: "mock" | "api" }> {
  const mock = useMockByDefault();
  const countryIso3 = "IDN";
  if (mock) {
    const raw = await readJsonOrThrow<ProvinceRiskResponse>(publicUrl("mock/provinceRiskResponse.json"));
    const normalized = normalizeProvinceRiskResponse(raw);
    return {
      data: await applyBpsProvincialOverlay(normalized, countryIso3),
      source: "mock",
    };
  }
  const qs = new URLSearchParams({ country: "indonesia", year: String(year) });
  try {
    const raw = await readJsonOrThrow<ProvinceRiskResponse>(
      publicUrl(`api/dashboard/province-risk?${qs}`)
    );
    const normalized = normalizeProvinceRiskResponse(raw);
    return { data: await applyBpsProvincialOverlay(normalized, countryIso3), source: "api" };
  } catch {
    const raw = await readJsonOrThrow<ProvinceRiskResponse>(publicUrl("mock/provinceRiskResponse.json"));
    const normalized = normalizeProvinceRiskResponse(raw);
    return {
      data: await applyBpsProvincialOverlay(normalized, countryIso3),
      source: "mock",
    };
  }
}

export async function loadInterventions(): Promise<{
  data: InterventionResponse;
  source: "mock" | "api";
}> {
  const mock = useMockByDefault();
  if (mock) {
    const raw = await readJsonOrThrow<InterventionResponse>(publicUrl("mock/interventionResponse.json"));
    return {
      data: normalizeInterventionResponse(raw),
      source: "mock",
    };
  }
  try {
    const res = await fetch(publicUrl("api/dashboard/interventions"), { method: "GET" });
    if (!res.ok) throw new Error(String(res.status));
    const raw = (await res.json()) as InterventionResponse;
    return { data: normalizeInterventionResponse(raw), source: "api" };
  } catch {
    const raw = await readJsonOrThrow<InterventionResponse>(publicUrl("mock/interventionResponse.json"));
    return {
      data: normalizeInterventionResponse(raw),
      source: "mock",
    };
  }
}

export async function loadCountryConfig(
  code: "indonesia" | "ghana"
): Promise<{ data: CountryConfig | null; error: string | null }> {
  try {
    const data = await readJsonOrThrow<CountryConfig>(
      publicUrl(`data/country-configs/${code}.json`)
    );
    return { data, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Could not load country config",
    };
  }
}

export function getRisk(
  p: ProvinceRiskResponse["provinces"][0],
  year: number
): number | null {
  const v = p.riskByYear?.[String(year)];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

export function riskBand(
  value: number,
  legend: ProvinceRiskResponse["legend"]
): "low" | "medium" | "high" | "critical" {
  if (value <= legend.lowMax) return "low";
  if (value <= legend.mediumMax) return "medium";
  if (value <= legend.highMax) return "high";
  return "critical";
}
