export const USE_MOCK_API = true;

export async function getUserProfile() {
  const url = USE_MOCK_API ? "/mock/userProfile.json" : "/api/demo/user";
  const res = await fetch(url);
  return res.json();
}

export async function extractSkills(transcript: string) {
  if (USE_MOCK_API) {
    const res = await fetch("/mock/skillExtractionResponse.json");
    return res.json();
  }

  const res = await fetch("/api/skills/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript })
  });

  return res.json();
}

export async function getRiskAndPathways(skills: any[]) {
  if (USE_MOCK_API) {
    const res = await fetch("/mock/riskPathwayResponse.json");
    return res.json();
  }

  const res = await fetch("/api/risk/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skills })
  });

  return res.json();
}
