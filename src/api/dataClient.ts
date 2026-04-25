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

/** Server-backed mock or Claude-assisted intake; always uses `/api` (mock logic lives on the server). */
export async function analyzeDataIntake(
  fileName: string,
  options?: { rawText?: string; textPreview?: string } | string
) {
  const o = typeof options === "string" ? { textPreview: options } : options ?? {};
  const res = await fetch("/api/data-intake/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName,
      ...(o.rawText !== undefined ? { rawText: o.rawText } : {}),
      ...(o.textPreview !== undefined ? { textPreview: o.textPreview } : {})
    })
  });
  return res.json();
}

export async function applyDataIntake(analysisId: string, approvedUpdateIds: string[]) {
  const res = await fetch("/api/data-intake/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId, approvedUpdateIds })
  });
  return res.json();
}

export async function resetDataIntake() {
  const res = await fetch("/api/data-intake/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return res.json();
}
