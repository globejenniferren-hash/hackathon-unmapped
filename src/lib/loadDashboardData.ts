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

export async function loadProvinceRisk(
  year: number
): Promise<{ data: ProvinceRiskResponse; source: "mock" | "api" }> {
  const mock = useMockByDefault();
  if (mock) {
    const raw = await readJsonOrThrow<ProvinceRiskResponse>(publicUrl("mock/provinceRiskResponse.json"));
    return {
      data: normalizeProvinceRiskResponse(raw),
      source: "mock",
    };
  }
  const qs = new URLSearchParams({ country: "indonesia", year: String(year) });
  try {
    const raw = await readJsonOrThrow<ProvinceRiskResponse>(
      publicUrl(`api/dashboard/province-risk?${qs}`)
    );
    return { data: normalizeProvinceRiskResponse(raw), source: "api" };
  } catch {
    const raw = await readJsonOrThrow<ProvinceRiskResponse>(publicUrl("mock/provinceRiskResponse.json"));
    return {
      data: normalizeProvinceRiskResponse(raw),
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
