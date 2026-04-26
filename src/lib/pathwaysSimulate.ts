import { readConversationSkills } from "@/lib/conversationSkills";

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

export async function fetchPathwaysSimulate(cityLabel: string): Promise<PathwaysSimulateResponse> {
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
    return (await res.json()) as PathwaysSimulateResponse;
  } catch {
    const fallback = await fetch("/mock/pathwaysSimulateResponse.json");
    return (await fallback.json()) as PathwaysSimulateResponse;
  }
}
