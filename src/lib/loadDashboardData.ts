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

export async function loadProvinceRisk(
  year: number
): Promise<{ data: ProvinceRiskResponse; source: "mock" | "api" }> {
  const mock = useMockByDefault();
  if (mock) {
    return {
      data: await readJsonOrThrow<ProvinceRiskResponse>(publicUrl("mock/provinceRiskResponse.json")),
      source: "mock",
    };
  }
  const qs = new URLSearchParams({ country: "indonesia", year: String(year) });
  try {
    const data = await readJsonOrThrow<ProvinceRiskResponse>(
      publicUrl(`api/dashboard/province-risk?${qs}`)
    );
    return { data, source: "api" };
  } catch {
    return {
      data: await readJsonOrThrow<ProvinceRiskResponse>(publicUrl("mock/provinceRiskResponse.json")),
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
    return {
      data: await readJsonOrThrow<InterventionResponse>(publicUrl("mock/interventionResponse.json")),
      source: "mock",
    };
  }
  try {
    const res = await fetch(publicUrl("api/dashboard/interventions"), { method: "GET" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as InterventionResponse;
    return { data, source: "api" };
  } catch {
    return {
      data: await readJsonOrThrow<InterventionResponse>(publicUrl("mock/interventionResponse.json")),
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
  const v = p.riskByYear[String(year)];
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
