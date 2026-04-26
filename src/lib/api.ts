// ============================================================
// Centralized API client for UNMAPPED.
// Toggle USE_MOCK_API to switch between bundled mock JSON and live endpoints.
// ============================================================

import userProfileMock from "@/mock/userProfile.json";
import skillExtractionMock from "@/mock/skillExtractionResponse.json";
import riskPathwayMock from "@/mock/riskPathwayResponse.json";
import provinceRiskMock from "@/mock/provinceRiskResponse.json";
import interventionMock from "@/mock/interventionResponse.json";
import passportMock from "@/mock/passportResponse.json";

export const USE_MOCK_API = String(import.meta.env.VITE_USE_MOCK_API ?? "").toLowerCase() === "true";

const MOCKS = {
  userProfile: userProfileMock,
  skillExtraction: skillExtractionMock,
  riskPathway: riskPathwayMock,
  provinceRisk: provinceRiskMock,
  intervention: interventionMock,
  passport: passportMock,
} as const;

const LIVE_ENDPOINTS: Record<keyof typeof MOCKS, string> = {
  userProfile: "/api/profile",
  skillExtraction: "/api/skills/extract",
  riskPathway: "/api/risk/score",
  provinceRisk: "/api/dashboard/provinces",
  intervention: "/api/dashboard/interventions-legacy",
  passport: "/api/passport",
};

export type ResourceKey = keyof typeof MOCKS;

export async function fetchResource<T>(key: ResourceKey): Promise<T> {
  if (USE_MOCK_API) {
    // Tiny delay so loading states are visible in the demo.
    await new Promise((r) => setTimeout(r, 50));
    return MOCKS[key] as unknown as T;
  }
  try {
    const res = await fetch(LIVE_ENDPOINTS[key]);
    if (!res.ok) throw new Error(`Failed to load ${key}: ${res.status}`);
    return (await res.json()) as T;
  } catch {
    // Keep UI usable if API is temporarily unavailable.
    return MOCKS[key] as unknown as T;
  }
}
