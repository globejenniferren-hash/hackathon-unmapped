import { readConversationSkills } from "@/lib/conversationSkills";

const CACHE_KEY = "unmapped.pathways.simulate.v1";

export type PathwaysSimulateResponse = {
  current_estimated_earnings: { display: string; usd_equivalent?: number };
  potential_earnings: { display: string; usd_equivalent?: number };
  monthly_gap: { display: string; usd_equivalent?: number };
  annual_gap: { display: string; usd_equivalent?: number };
  why_gap_exists: Array<{
    reason: string;
    skill?: string;
    potential_role?: string;
    potential_wage_display?: string;
  }>;
  jobs_matching_skills: Array<{
    title: string;
    wage_display: string;
    match_reason?: string;
  }>;
  pathways: Array<{
    skill_to_add: string;
    training_program: string;
    duration: string;
    difficulty: "easy" | "moderate" | "hard";
    unlocks: Array<{ role: string; wage_display: string }>;
    income_lift_display: string;
    automation_resilience_years?: number;
    sources?: string[];
  }>;
  sources?: string[];
};

type CachedEntry = {
  city: string;
  data: PathwaysSimulateResponse;
  updated_at: number;
};

function readCache(city: string): PathwaysSimulateResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (!parsed || parsed.city !== city || !parsed.data) return null;
    // Keep one city snapshot stable for 15 minutes to align tabs.
    if (Date.now() - Number(parsed.updated_at || 0) > 15 * 60 * 1000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(city: string, data: PathwaysSimulateResponse) {
  if (typeof window === "undefined") return;
  try {
    const entry: CachedEntry = { city, data, updated_at: Date.now() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // best effort
  }
}

export async function fetchPathwaysSimulate(cityLabel: string): Promise<PathwaysSimulateResponse> {
  const cached = readCache(cityLabel);
  if (cached) return cached;
  const skills = readConversationSkills();
  const payload = {
    skills: skills.map((s) => ({
      name: s.name,
      ...(s.isco_code ? { isco_code: s.isco_code } : {}),
    })),
    city: cityLabel,
    country: "Indonesia",
  };
  try {
    const res = await fetch("/api/pathways/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`pathways_${res.status}`);
    const data = (await res.json()) as PathwaysSimulateResponse;
    writeCache(cityLabel, data);
    return data;
  } catch {
    const fallback = await fetch("/mock/pathwaysSimulateResponse.json");
    const data = (await fallback.json()) as PathwaysSimulateResponse;
    writeCache(cityLabel, data);
    return data;
  }
}
