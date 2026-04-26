import {
  matchedFreyScoresForSkills,
  internetPenetrationIndonesia,
  worldBankIndonesiaBundle,
  employmentShareChange,
  idnWorldBank
} from "./ai-context.js";
import { callClaude } from "./claude-client.js";

function buildRiskScoringSystemPrompt(matchedBlock, wbBlock, internetLine) {
  return `You are an automation risk analyst for UNMAPPED.

Given a set of skills with their ISCO codes, real Frey-Osborne automation probabilities, and local economic context, produce a risk assessment.

Rules:
- DO NOT invent automation probabilities. Use only the Frey–Osborne scores in each matched row (frey_osborne.automation_probability). If frey_osborne is null, set frey_osborne_raw to null and explain in reason.
- When frey_match_meta.approximation_note is present (including "approximate_*" or "unresolved_*" methods), weave it into the one-sentence reason. For approximate_* rows, frey_osborne_raw MUST equal frey_osborne.automation_probability from that closest occupation; say explicitly that this is a lexical proxy, not the exact crosswalk SOC row.
- Recalibrate based on local context: a high automation probability means less in a region with 18% internet penetration than one with 72%.
- For each skill, provide:
  - risk level: "durable", "at_risk", or "declining" (use field name "level" in output JSON)
  - the raw Frey-Osborne score as frey_osborne_raw (number, or null if unmatched)
  - your calibrated_score (0–1) adjusted for local context
  - a 1-sentence human-readable reason
  - displacement probability for years 2027, 2029, 2031 as displacement_by_year object with numeric values 0–1
  - 1-2 adjacent_skills strings that would increase resilience
- avg_earnings_trend and sector_growth must be short human-readable strings grounded ONLY in the World Bank numbers provided (e.g. employment share point changes, GDP per capita direction). If insufficient data, say "insufficient WDI coverage in bundle".
- local_comparison: use occupation "Retail Seller" / ISCO 5223 persona from context, with Makassar at ${internetLine.makassar_internet_pct}% internet and Sumba at ${internetLine.sumba_internet_pct}% internet (hypothetical subnational split for demo; national baseline is ${internetLine.national_internet_pct}% from WDI).
- data_sources must include "Frey & Osborne (2017)", "World Bank WDI", and "ITU" as strings.

Here is the real data:

Frey-Osborne scores for relevant occupations (matched server-side):
${matchedBlock}

World Bank Indonesia indicators (committed extract):
${wbBlock}

Internet penetration (national, WDI IT.NET.USER.ZS):
${JSON.stringify(internetLine, null, 2)}

Return ONLY valid JSON in this exact format:
{
  "country": "Indonesia",
  "risks": [
    {
      "skill": "Grab Driving",
      "isco_code": "8322",
      "level": "at_risk",
      "frey_osborne_raw": 0.89,
      "calibrated_score": 0.60,
      "reason": "High base automation probability, compounded by 72% internet penetration enabling platform-based displacement.",
      "avg_earnings_trend": "Rp 3.2M/month, -4% YoY",
      "sector_growth": "Transportation: -2.1% employment share change 2020-2024",
      "displacement_by_year": { "2027": 0.25, "2029": 0.42, "2031": 0.60 },
      "adjacent_skills": ["Logistics coordination", "Last-mile delivery management"]
    }
  ],
  "local_comparison": {
    "occupation": "Retail Seller",
    "location_a": { "city": "Makassar", "risk": "high", "internet_pct": 72, "calibrated_score": 0.71 },
    "location_b": { "city": "Sumba", "risk": "low", "internet_pct": 18, "calibrated_score": 0.22 }
  },
  "data_sources": ["Frey & Osborne (2017)", "World Bank WDI", "ITU"]
}`;
}

function validateRiskScore(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.country !== "string") return false;
  if (!Array.isArray(obj.risks)) return false;
  if (!obj.local_comparison || typeof obj.local_comparison !== "object") return false;
  if (!Array.isArray(obj.data_sources)) return false;
  for (const r of obj.risks) {
    if (!r || typeof r !== "object") return false;
    if (typeof r.skill !== "string") return false;
    if (typeof r.isco_code !== "string") return false;
    if (!["durable", "at_risk", "declining"].includes(r.level)) return false;
    if (typeof r.calibrated_score !== "number") return false;
    if (r.frey_osborne_raw !== null && typeof r.frey_osborne_raw !== "number") return false;
    if (typeof r.reason !== "string") return false;
    if (!r.displacement_by_year || typeof r.displacement_by_year !== "object") return false;
    if (!Array.isArray(r.adjacent_skills)) return false;
  }
  const lc = obj.local_comparison;
  if (typeof lc.occupation !== "string") return false;
  if (!lc.location_a || !lc.location_b) return false;
  return true;
}

/**
 * Merge Claude automation output with legacy dashboard fields from mock.
 */
function mergeRiskWithLegacy(claudeResult, legacyFallback) {
  const first = claudeResult.risks?.[0];
  const overall =
    first && typeof first.calibrated_score === "number"
      ? first.calibrated_score
      : legacyFallback.overallRiskScore;
  const riskLevel =
    overall >= 0.65 ? "high" : overall >= 0.4 ? "medium" : legacyFallback.riskLevel || "low";
  return {
    ...legacyFallback,
    overallRiskScore: overall,
    riskLevel,
    risks: claudeResult.risks,
    automationRisks: claudeResult.risks,
    local_comparison: claudeResult.local_comparison,
    data_sources: claudeResult.data_sources,
    riskModel: {
      id: "frey_osborne_wdi_calibration_v1",
      description: "Claude-assisted calibration using committed Frey–Osborne and Indonesia WDI extract.",
      internet_penetration_reference: internetPenetrationIndonesia()
    }
  };
}

/**
 * @param {any[]} skills
 * @param {{ apiKey: string, riskPathwayFallback: object }} opts
 */
async function runRiskScoring(skills, opts) {
  const { apiKey, riskPathwayFallback } = opts;
  const list = Array.isArray(skills) ? skills : [];
  if (!list.length) {
    return riskPathwayFallback;
  }

  const matched = matchedFreyScoresForSkills(list);
  const wb = worldBankIndonesiaBundle();
  const inet = internetPenetrationIndonesia();
  const nationalPct = inet ? Math.round(inet.value_pct * 10) / 10 : 72.8;
  const internetLine = {
    national_internet_pct: nationalPct,
    national_year: inet?.year,
    wdi: inet?.wdi,
    makassar_internet_pct: Math.min(95, Math.round(nationalPct)),
    sumba_internet_pct: 18,
    note: "Makassar/Sumba internet_pct are demo scenario anchors; national value is from data/worldbank/IDN.json."
  };

  const servicesCh = employmentShareChange("employment_services_pct", 2020, 2024);
  const agrCh = employmentShareChange("employment_agriculture_pct", 2020, 2024);

  const matchedBlock = JSON.stringify(matched, null, 2);
  const wbBlock = JSON.stringify(
    {
      world_bank_bundle: wb,
      precomputed_sector_hints: {
        employment_services_change_2020_2024_pp: servicesCh?.changePercentagePoints,
        employment_agriculture_change_2020_2024_pp: agrCh?.changePercentagePoints,
        gdp_per_capita_latest: latestPoint(idnWorldBank?.indicators?.gdp_per_capita_usd)
      }
    },
    null,
    2
  );

  try {
    const parsed = await callClaude({
      apiKey,
      system: buildRiskScoringSystemPrompt(matchedBlock, wbBlock, internetLine),
      user: {
        skills: list,
        server_matched_frey: matched,
        internet_context: internetLine
      },
      max_tokens: 8192
    });
    if (validateRiskScore(parsed)) {
      return mergeRiskWithLegacy(parsed, riskPathwayFallback);
    }
  } catch (e) {
    console.error("[risk/score] Claude or parse failed:", e.message || e);
  }

  return riskPathwayFallback;
}

function latestPoint(series) {
  if (!series) return null;
  const ys = Object.keys(series)
    .filter((k) => /^\d{4}$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);
  if (!ys.length) return null;
  const y = ys[ys.length - 1];
  return { year: y, value: series[String(y)] };
}

export {
  buildRiskScoringSystemPrompt,
  validateRiskScore,
  runRiskScoring,
  mergeRiskWithLegacy
};
