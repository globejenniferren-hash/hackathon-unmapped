import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { callClaude } from "./server/claude-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCommittedJson(...segments) {
  const filePath = path.join(__dirname, ...segments);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Committed WDI extract (Indonesia) — numeric mocks must come from this file. */
const idnWb = readCommittedJson("data", "worldbank", "IDN.json");
/** Frey & Osborne automation extract — numeric mocks must come from this file. */
const freyOsborne = readCommittedJson("data", "automation", "frey-osborne.json");

function wbIndicators() {
  return idnWb?.indicators && typeof idnWb.indicators === "object" ? idnWb.indicators : {};
}

function wbCode(key) {
  return idnWb?.indicator_codes?.[key] || key;
}

/**
 * Last two calendar years present for a series (sorted ascending).
 * @returns {{ yearCurrent: number, yearProposed: number, currentValue: number, proposedValue: number } | null}
 */
function wdiAdjacentYearsPair(series) {
  if (!series || typeof series !== "object") return null;
  const years = Object.keys(series)
    .filter((k) => /^\d{4}$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length < 2) return null;
  const y0 = years[years.length - 2];
  const y1 = years[years.length - 1];
  const a = series[String(y0)];
  const b = series[String(y1)];
  if (typeof a !== "number" || typeof b !== "number" || Number.isNaN(a) || Number.isNaN(b)) return null;
  return { yearCurrent: y0, yearProposed: y1, currentValue: a, proposedValue: b };
}

function findOccupation(socCode) {
  const list = freyOsborne?.occupations;
  if (!Array.isArray(list)) return null;
  return list.find((o) => o.soc_code === socCode) || null;
}

const ALLOWED_DATASETS = new Set([
  "laborMarket",
  "digitalReadiness",
  "interventionCatalog",
  "countryConfig"
]);

/** @type {Map<string, { fileName: string, proposedUpdates: object[], appliedIds: Set<string> }>} */
const analyses = new Map();

/** @type {Array<{ updateId: string, dataset: string, field: string, regionName: string, analysisId: string, appliedAt: string }>} */
let appliedDemoLog = [];

function useMockApiFlag() {
  return (process.env.USE_MOCK_API || "true").toLowerCase() !== "false";
}

function anthropicKey() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k || k === "your_key_here") return null;
  return k;
}

function normalizeFileName(fileName) {
  if (!fileName || typeof fileName !== "string") return "";
  const base = path.basename(fileName.trim());
  return base.toLowerCase();
}

function coerceNumericConfidence(c) {
  if (typeof c === "number" && !Number.isNaN(c)) {
    return Math.min(1, Math.max(0, c));
  }
  const s = String(c || "").toLowerCase();
  if (s === "high") return 0.9;
  if (s === "medium") return 0.65;
  if (s === "low") return 0.4;
  return NaN;
}

/**
 * Normalizes Claude intake rows (e.g. confidence "high", operation "update") for apply().
 * @returns {object | null}
 */
function normalizeProposedUpdate(u) {
  if (!u || typeof u !== "object") return null;
  const keys = [
    "updateId",
    "dataset",
    "operation",
    "regionName",
    "field",
    "currentValue",
    "proposedValue",
    "unit",
    "year",
    "confidence",
    "evidence"
  ];
  for (const k of keys) {
    if (!(k in u)) return null;
  }
  if (typeof u.updateId !== "string" || !u.updateId) return null;
  if (!ALLOWED_DATASETS.has(u.dataset)) return null;
  let op = String(u.operation || "");
  if (op === "update") op = "replace";
  if (!["replace", "merge", "append", "patch"].includes(op)) return null;
  if (typeof u.regionName !== "string") return null;
  if (typeof u.field !== "string") return null;
  if (typeof u.evidence !== "string") return null;
  const conf = coerceNumericConfidence(u.confidence);
  if (Number.isNaN(conf)) return null;
  if (u.unit !== null && typeof u.unit !== "string") return null;
  if (u.year !== null && (typeof u.year !== "number" || Number.isNaN(u.year))) return null;
  return {
    ...u,
    operation: op,
    confidence: conf
  };
}

function sanitizeProposedUpdates(list) {
  if (!Array.isArray(list)) return [];
  return list.map((u) => normalizeProposedUpdate(u)).filter(Boolean);
}

const FILE_SCENARIO = {
  "telecom_regulator_connectivity_2026.pdf": "digitalReadiness",
  "ministry_training_catalog_2026.pdf": "interventionCatalog",
  "provincial_labor_report_2026.pdf": "laborMarket"
};

/**
 * Mock-only routing from pasted unstructured text (Indonesian + English cues).
 * Tie-break order: digitalReadiness > laborMarket > interventionCatalog.
 */
function detectScenarioFromRawText(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const t = rawText.toLowerCase();
  const scores = {
    digitalReadiness: 0,
    laborMarket: 0,
    interventionCatalog: 0
  };
  const digitalKws = [
    "internet",
    "broadband",
    "digital",
    "connectivity",
    "cellular",
    "telekom",
    "telecom",
    "ict",
    "jaringan",
    "kecepatan",
    "fixed broadband",
    "mobile subscription",
    "pengguna internet",
    "infrastruktur digital"
  ];
  const laborKws = [
    "tenaga kerja",
    "pengangguran",
    "unemployment",
    "ketenagakerjaan",
    "labor market",
    "employment",
    "pekerjaan",
    "labor force",
    "neet",
    "bps",
    "upah",
    "wage",
    "informal employment",
    "pengangguran terbuka",
    "angkatan kerja"
  ];
  const intvKws = [
    "pelatihan",
    "training",
    "program",
    "katalog",
    "catalogue",
    "catalog",
    "ministry",
    "kementerian",
    "intervensi",
    "intervention",
    "sertifikasi",
    "placement",
    "cadet",
    "kursus",
    "kapasitas",
    "skills program"
  ];
  for (const w of digitalKws) {
    if (t.includes(w)) scores.digitalReadiness += 1;
  }
  for (const w of laborKws) {
    if (t.includes(w)) scores.laborMarket += 1;
  }
  for (const w of intvKws) {
    if (t.includes(w)) scores.interventionCatalog += 1;
  }
  if (/sulawesi/i.test(rawText)) {
    scores.interventionCatalog += 2;
    scores.laborMarket += 1;
  }
  const max = Math.max(scores.digitalReadiness, scores.laborMarket, scores.interventionCatalog);
  if (max === 0) return null;
  if (scores.digitalReadiness === max) return "digitalReadiness";
  if (scores.laborMarket === max) return "laborMarket";
  return "interventionCatalog";
}

function resolveMockScenario(fileName, rawText) {
  const key = normalizeFileName(fileName);
  if (key && FILE_SCENARIO[key]) {
    return { scenario: FILE_SCENARIO[key], routing: "filename", detail: key };
  }
  const fromText = detectScenarioFromRawText(rawText);
  if (fromText) {
    return { scenario: fromText, routing: "rawText", detail: fromText };
  }
  return { scenario: null, routing: "none", detail: null };
}

function buildDigitalReadinessMocks() {
  const ind = wbIndicators();
  const internet = wdiAdjacentYearsPair(ind.internet_users_pct);
  const mobile = wdiAdjacentYearsPair(ind.mobile_cellular_subscriptions_per_100);
  const lfp = wdiAdjacentYearsPair(ind.labor_force_participation_rate);
  if (!internet || !mobile || !lfp) return [];

  return [
    {
      updateId: "mock-dr-conn-001",
      dataset: "digitalReadiness",
      operation: "replace",
      regionName: "National",
      field: "internet_users_pct",
      currentValue: internet.currentValue,
      proposedValue: internet.proposedValue,
      unit: "percent",
      year: internet.yearProposed,
      confidence: 0.88,
      evidence: `Committed WDI ${wbCode("internet_users_pct")}: Indonesia ${internet.yearCurrent} ${internet.currentValue} → ${internet.yearProposed} ${internet.proposedValue} (data/worldbank/IDN.json).`
    },
    {
      updateId: "mock-dr-conn-002",
      dataset: "digitalReadiness",
      operation: "replace",
      regionName: "National",
      field: "mobile_cellular_subscriptions_per_100",
      currentValue: mobile.currentValue,
      proposedValue: mobile.proposedValue,
      unit: "per_100_people",
      year: mobile.yearProposed,
      confidence: 0.82,
      evidence: `Committed WDI ${wbCode("mobile_cellular_subscriptions_per_100")}: ${mobile.yearCurrent} ${mobile.currentValue} → ${mobile.yearProposed} ${mobile.proposedValue} (data/worldbank/IDN.json).`
    },
    {
      updateId: "mock-dr-conn-003",
      dataset: "digitalReadiness",
      operation: "replace",
      regionName: "National",
      field: "labor_force_participation_rate_pct",
      currentValue: lfp.currentValue,
      proposedValue: lfp.proposedValue,
      unit: "percent",
      year: lfp.yearProposed,
      confidence: 0.76,
      evidence: `Committed WDI ${wbCode("labor_force_participation_rate")}: ${lfp.yearCurrent} ${lfp.currentValue} → ${lfp.yearProposed} ${lfp.proposedValue} (data/worldbank/IDN.json); contextual link for workforce digital readiness.`
    }
  ];
}

function buildLaborMarketMocks() {
  const ind = wbIndicators();
  const unemp = wdiAdjacentYearsPair(ind.unemployment_rate);
  const youthU = wdiAdjacentYearsPair(ind.youth_unemployment_rate);
  const services = wdiAdjacentYearsPair(ind.employment_services_pct);
  const occA = findOccupation("41-4012");
  const occB = findOccupation("41-4011");
  if (!unemp || !youthU || !services || !occA || !occB) return [];

  return [
    {
      updateId: "mock-lm-lab-001",
      dataset: "laborMarket",
      operation: "replace",
      regionName: "National",
      field: "unemployment_rate_pct",
      currentValue: unemp.currentValue,
      proposedValue: unemp.proposedValue,
      unit: "percent",
      year: unemp.yearProposed,
      confidence: 0.87,
      evidence: `Committed WDI ${wbCode("unemployment_rate")}: ${unemp.yearCurrent} ${unemp.currentValue} → ${unemp.yearProposed} ${unemp.proposedValue} (data/worldbank/IDN.json).`
    },
    {
      updateId: "mock-lm-lab-002",
      dataset: "laborMarket",
      operation: "replace",
      regionName: "National",
      field: "youth_unemployment_rate_pct",
      currentValue: youthU.currentValue,
      proposedValue: youthU.proposedValue,
      unit: "percent",
      year: youthU.yearProposed,
      confidence: 0.79,
      evidence: `Committed WDI ${wbCode("youth_unemployment_rate")}: ${youthU.yearCurrent} ${youthU.currentValue} → ${youthU.yearProposed} ${youthU.proposedValue} (data/worldbank/IDN.json).`
    },
    {
      updateId: "mock-lm-lab-003",
      dataset: "laborMarket",
      operation: "replace",
      regionName: "National",
      field: "employment_services_pct",
      currentValue: services.currentValue,
      proposedValue: services.proposedValue,
      unit: "percent",
      year: services.yearProposed,
      confidence: 0.72,
      evidence: `Committed WDI ${wbCode("employment_services_pct")}: ${services.yearCurrent} ${services.currentValue} → ${services.yearProposed} ${services.proposedValue} (data/worldbank/IDN.json); automation context SOC ${occA.soc_code} P(automation)=${occA.automation_probability}, SOC ${occB.soc_code} P(automation)=${occB.automation_probability} (data/automation/frey-osborne.json).`
    }
  ];
}

function buildInterventionCatalogMocks() {
  const ind = wbIndicators();
  const gdp = wdiAdjacentYearsPair(ind.gdp_per_capita_usd);
  const occDrill = findOccupation("51-4032");
  const occLathe = findOccupation("51-4034");
  const occSuper = findOccupation("53-1031");
  if (!gdp || !occDrill || !occLathe || !occSuper) return [];

  return [
    {
      updateId: "mock-ic-train-001",
      dataset: "interventionCatalog",
      operation: "append",
      regionName: "National",
      field: "programs",
      currentValue: [],
      proposedValue: {
        id: `prog-scale-${occDrill.soc_code.replace(/-/g, "")}`,
        title: occDrill.occupation.slice(0, 72),
        type: "training",
        socCode: occDrill.soc_code,
        seatsPlanned: occDrill.employed,
        avgAnnualWageUsd: occDrill.avg_annual_wage,
        automationProbability: occDrill.automation_probability
      },
      unit: null,
      year: gdp.yearProposed,
      confidence: 0.9,
      evidence: `data/automation/frey-osborne.json occupation ${occDrill.soc_code}: employed=${occDrill.employed}, avg_annual_wage=${occDrill.avg_annual_wage}, automation_probability=${occDrill.automation_probability}.`
    },
    {
      updateId: "mock-ic-train-002",
      dataset: "interventionCatalog",
      operation: "append",
      regionName: "South Sulawesi",
      field: "programs",
      currentValue: [],
      proposedValue: {
        id: `prog-scale-${occLathe.soc_code.replace(/-/g, "")}`,
        title: occLathe.occupation.slice(0, 72),
        type: "placement",
        socCode: occLathe.soc_code,
        seatsPlanned: occLathe.employed,
        avgAnnualWageUsd: occLathe.avg_annual_wage,
        automationProbability: occLathe.automation_probability
      },
      unit: null,
      year: gdp.yearProposed,
      confidence: 0.84,
      evidence: `Sulawesi-linked pilot mock: scales from data/automation/frey-osborne.json ${occLathe.soc_code} employed=${occLathe.employed}, wage=${occLathe.avg_annual_wage}.`
    },
    {
      updateId: "mock-ic-train-003",
      dataset: "interventionCatalog",
      operation: "replace",
      regionName: "National",
      field: "supervisor_cohort_reference_employed",
      currentValue: occSuper.employed,
      proposedValue: occLathe.employed,
      unit: "workers",
      year: gdp.yearProposed,
      confidence: 0.81,
      evidence: `Compared employed counts from data/automation/frey-osborne.json: ${occSuper.soc_code} employed ${occSuper.employed} vs ${occLathe.soc_code} employed ${occLathe.employed}; GDP per capita ${gdp.yearCurrent} ${gdp.currentValue} → ${gdp.yearProposed} ${gdp.proposedValue} USD (data/worldbank/IDN.json ${wbCode("gdp_per_capita_usd")}).`
    }
  ];
}

function mockProposalsForScenario(scenario) {
  if (scenario === "digitalReadiness") return buildDigitalReadinessMocks();
  if (scenario === "laborMarket") return buildLaborMarketMocks();
  if (scenario === "interventionCatalog") return buildInterventionCatalogMocks();
  return [];
}

function rawTextTriggersMapLaborMock(rawText) {
  if (!rawText || typeof rawText !== "string") return false;
  const t = rawText.toLowerCase();
  return (
    /\bsulawesi\b/.test(t) ||
    /\bjakarta\b/.test(t) ||
    /\bdki\b/.test(t) ||
    /\bnusa\s*tenggara\b/.test(t) ||
    /\bntt\b/.test(t) ||
    /nusa\s*tenggara\s*timur/.test(t)
  );
}

let _mapIngestionMockCache;

/** Deep clone of public/mock/dataIngestionMapResponse.json (province map ingest). */
function getDataIngestionMapMockClone() {
  if (_mapIngestionMockCache === undefined) {
    try {
      const p = path.join(__dirname, "public", "mock", "dataIngestionMapResponse.json");
      _mapIngestionMockCache = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      _mapIngestionMockCache = null;
    }
  }
  if (!_mapIngestionMockCache) return null;
  return JSON.parse(JSON.stringify(_mapIngestionMockCache));
}

function latestNationalInternetPct() {
  const series = wbIndicators().internet_users_pct;
  if (!series || typeof series !== "object") return 72.78;
  const years = Object.keys(series)
    .filter((k) => /^\d{4}$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);
  if (!years.length) return 72.78;
  const v = series[String(years[years.length - 1])];
  if (typeof v !== "number" || Number.isNaN(v)) return 72.78;
  return Math.round(v * 100) / 100;
}

function getMockProposedUpdates(fileName, rawText) {
  if (rawTextTriggersMapLaborMock(rawText)) return [];
  const { scenario } = resolveMockScenario(fileName, rawText);
  if (!scenario) return [];
  return mockProposalsForScenario(scenario);
}

function getMockRoutingMeta(fileName, rawText) {
  if (rawTextTriggersMapLaborMock(rawText)) {
    return {
      scenario: "labor_market_map",
      routing: "rawText_map_keywords",
      detail: "public/mock/dataIngestionMapResponse.json"
    };
  }
  return resolveMockScenario(fileName, rawText);
}

function buildDashboardImpact(appliedRows) {
  const datasetsTouched = [...new Set(appliedRows.map((r) => r.dataset))].sort();
  const regionsAffected = [...new Set(appliedRows.map((r) => r.regionName))].sort();
  const metricsChanged = appliedRows.length;
  return {
    datasetsTouched,
    regionsAffected,
    metricsChanged,
    appliedUpdates: appliedRows.map((r) => ({
      updateId: r.updateId,
      dataset: r.dataset,
      field: r.field,
      regionName: r.regionName
    })),
    summary:
      appliedRows.length === 0
        ? "No approved updates applied in this request."
        : `Applied ${appliedRows.length} approved update(s) across: ${datasetsTouched.join(", ")}. Dashboard widgets for those datasets should refresh from approved operator intake (demo session).`,
    demoNote:
      "Hackathon demo: impact is simulated in-memory. POST /api/data-intake/reset clears demo intake state; the live dashboard bundle must merge these summaries client-side if wired."
  };
}

const LABOR_MAP_PARSER_SYSTEM = `You are a government report parser for UNMAPPED, a workforce intelligence platform.

A government officer has pasted raw text from a national labor force report. The text may be in Bahasa Indonesia, English, or any other language. It contains employment statistics for one or more provinces/regions.

Your job:
1. Identify every province or region mentioned in the text
2. For each province, extract:
   - Province name (standardized to official name)
   - Total employed population
   - Employment by sector (agriculture, manufacturing/industry, retail/trade, services, etc.) as both absolute numbers and percentages
   - Unemployment rate if mentioned
   - Average wages if mentioned
   - Internet penetration if mentioned
   - Any other labor market indicators mentioned
3. For each province, calculate a preliminary automation displacement risk score using this formula:
   - Take the employment share per sector (use decimal shares, e.g. 38.2% -> 0.382)
   - Weight it by Frey-Osborne automation probability for that sector's dominant occupations:
     - Agriculture: 0.07 (low automation)
     - Manufacturing/Industry: 0.64 (medium-high)
     - Retail/Trade: 0.92 (high)
     - Services: 0.42 (medium)
     - Transportation: 0.89 (high)
   - Assign any residual employment share not covered by explicit sectors to "services" unless the text clearly indicates transportation.
   - internet_factor = (internet penetration as decimal 0-1 if given for that province, else use the nationalInternetBaselinePct from the user JSON as a decimal, e.g. 72.78 -> 0.7278)
   - weighted_risk = internet_factor * (share_agri*0.07 + share_mfg*0.64 + share_retail*0.92 + share_services*0.42 + share_transport*0.89) where missing sector shares are 0.
4. Classify each province: "lower_risk" (<0.25), "medium" (0.25-0.40), "high" (0.40-0.55), "severe" (>0.55)

Return ONLY valid JSON in this exact format:
{
  "reportType": "laborMarket",
  "detectedCountry": "Indonesia",
  "detectedLanguage": "id",
  "reportTitle": "Keadaan Angkatan Kerja di Indonesia Agustus 2024",
  "provincesFound": 3,
  "provinces": [
    {
      "name": "Sulawesi Selatan",
      "nameStandardized": "Sulawesi Selatan",
      "totalEmployed": 4210000,
      "sectors": {
        "agriculture": { "count": 1608000, "pct": 38.2 },
        "manufacturing": { "count": 375000, "pct": 8.9 },
        "retail": { "count": 787000, "pct": 18.7 },
        "services": { "count": null, "pct": null },
        "transportation": { "count": null, "pct": null }
      },
      "unemploymentRate": 5.31,
      "avgWageMonthly": 3200000,
      "internetPenetration": null,
      "riskScore": 0.31,
      "riskLevel": "medium",
      "riskCalculation": "agriculture(38.2%*0.07) + manufacturing(8.9%*0.64) + retail(18.7%*0.92) + remaining(34.2%*0.42) * internet(0.73 national avg)",
      "evidence": [
        "Sulawesi Selatan mencatat jumlah penduduk yang bekerja sebanyak 4,21 juta orang",
        "pertanian sebesar 38,2 persen",
        "perdagangan 18,7 persen",
        "industri pengolahan 8,9 persen",
        "TPT 5,31 persen",
        "rata-rata upah buruh Rp 3,2 juta per bulan"
      ],
      "geoMatch": { "property": "NAME_1", "value": "Sulawesi Selatan" },
      "displacement_by_year": { "2026": 0.09, "2027": 0.11, "2028": 0.13, "2029": 0.15, "2030": 0.18, "2031": 0.21 }
    }
  ],
  "nationalBaseline": {
    "source": "World Bank WDI",
    "avgRiskScore": 0.34,
    "internetPenetration": 72.78,
    "note": "Provinces without internet data use this national baseline"
  },
  "mapReady": true,
  "previewMode": true,
  "approvalRequired": true,
  "summary": "Short narrative summary of provinces and risk patterns."
}

Every province MUST include "geoMatch": { "property": "NAME_1", "value": "<official Indonesian province name>" } for GeoJSON join, and "displacement_by_year" with string keys "2026" through "2031" and numeric values (non-decreasing).`;

function coerceLaborMapNumbers(obj) {
  if (!obj || typeof obj !== "object") return;
  const nb = obj.nationalBaseline;
  if (nb && typeof nb === "object") {
    if (typeof nb.internetPenetration === "string") {
      nb.internetPenetration = parseFloat(nb.internetPenetration);
    }
    if (typeof nb.avgRiskScore === "string") {
      nb.avgRiskScore = parseFloat(nb.avgRiskScore);
    }
  }
  for (const p of obj.provinces || []) {
    if (!p || typeof p !== "object") continue;
    if (typeof p.riskScore === "string") p.riskScore = parseFloat(p.riskScore);
    if (typeof p.unemploymentRate === "string") p.unemploymentRate = parseFloat(p.unemploymentRate);
    if (p.displacement_by_year && typeof p.displacement_by_year === "object") {
      for (const k of Object.keys(p.displacement_by_year)) {
        const v = p.displacement_by_year[k];
        if (typeof v === "string") p.displacement_by_year[k] = parseFloat(v);
      }
    }
  }
}

function validateLaborMapResponse(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.reportType !== "string") return false;
  if (!Array.isArray(obj.provinces) || obj.provinces.length < 1) return false;
  const levels = new Set(["lower_risk", "medium", "high", "severe"]);
  const years = ["2026", "2027", "2028", "2029", "2030", "2031"];
  for (const p of obj.provinces) {
    if (!p || typeof p !== "object") return false;
    if (typeof p.name !== "string" || typeof p.nameStandardized !== "string") return false;
    if (typeof p.riskScore !== "number" || Number.isNaN(p.riskScore)) return false;
    if (!levels.has(p.riskLevel)) return false;
    if (!p.sectors || typeof p.sectors !== "object") return false;
    if (!p.geoMatch || p.geoMatch.property !== "NAME_1" || typeof p.geoMatch.value !== "string") return false;
    if (!p.displacement_by_year || typeof p.displacement_by_year !== "object") return false;
    for (const y of years) {
      const v = p.displacement_by_year[y];
      if (typeof v !== "number" || Number.isNaN(v)) return false;
    }
  }
  if (!obj.nationalBaseline || typeof obj.nationalBaseline !== "object") return false;
  if (typeof obj.nationalBaseline.internetPenetration !== "number") return false;
  return true;
}

function ensureDisplacementSeriesOnProvinces(obj) {
  const years = ["2026", "2027", "2028", "2029", "2030", "2031"];
  const list = obj?.provinces;
  if (!Array.isArray(list)) return;
  for (const p of list) {
    if (!p.displacement_by_year || typeof p.displacement_by_year !== "object") {
      p.displacement_by_year = {};
    }
    const rs = typeof p.riskScore === "number" && !Number.isNaN(p.riskScore) ? p.riskScore : 0.25;
    let prev = rs * 0.25;
    for (let i = 0; i < years.length; i++) {
      const y = years[i];
      if (typeof p.displacement_by_year[y] !== "number" || Number.isNaN(p.displacement_by_year[y])) {
        const t = (i + 1) / years.length;
        const v = rs * (0.25 + 0.65 * t);
        p.displacement_by_year[y] = Math.round(Math.max(prev, v) * 1000) / 1000;
      }
      prev = Math.max(prev, p.displacement_by_year[y]);
    }
  }
}

function enrichLaborMapNationalBaseline(obj) {
  if (!obj || typeof obj !== "object") return;
  const pct = latestNationalInternetPct();
  if (!obj.nationalBaseline || typeof obj.nationalBaseline !== "object") {
    obj.nationalBaseline = { source: "World Bank WDI" };
  }
  obj.nationalBaseline.source = "World Bank WDI";
  obj.nationalBaseline.internetPenetration = pct;
  obj.nationalBaseline.note =
    obj.nationalBaseline.note ||
    "Provinces without internet data use this national baseline (IT.NET.USER.ZS, Indonesia, data/worldbank/IDN.json).";
}

async function callClaudeLaborMapParser(rawText, fileName, apiKey) {
  const rt = typeof rawText === "string" ? rawText : "";
  return callClaude({
    apiKey,
    system: LABOR_MAP_PARSER_SYSTEM,
    user: {
      rawText: rt.slice(0, 28000),
      fileName: String(fileName || ""),
      nationalInternetBaselinePct: latestNationalInternetPct()
    },
    max_tokens: 16384
  });
}

const DATA_INTAKE_CLAUDE_SYSTEM = `You analyze unstructured or semi-structured country documents for the UNMAPPED policy dashboard.
Return ONLY valid JSON (no markdown) with this shape:
{"proposedUpdates":[{"updateId":"string","dataset":"laborMarket|digitalReadiness|interventionCatalog|countryConfig","operation":"replace|merge|append|patch","regionName":"string","field":"string","currentValue":null,"proposedValue":null,"unit":null,"year":null,"confidence":0.0,"evidence":"string"}]}
Rules:
- dataset must be exactly one of: laborMarket, digitalReadiness, interventionCatalog, countryConfig.
- currentValue and proposedValue may be strings, numbers, booleans, arrays, or objects as appropriate.
- unit is a string or use null; year is a number or use null.
- confidence is a number from 0 to 1.
- evidence must quote or paraphrase supporting text from the user payload.
- Propose at least 1 and at most 6 updates unless the document truly has no usable signals.`;

async function callClaudeDataIntakeAnalyzeCompact(fileName, rawText, textPreview, apiKey) {
  const rt = typeof rawText === "string" ? rawText : "";
  const tp = typeof textPreview === "string" ? textPreview : "";
  return callClaude({
    apiKey,
    system: DATA_INTAKE_CLAUDE_SYSTEM,
    user: {
      fileName,
      rawText: rt.slice(0, 12000),
      textPreview: tp.slice(0, 12000)
    },
    max_tokens: 4096
  });
}

function registerDataIntakeRoutes(app) {
  app.post("/api/data-intake/analyze", async (req, res) => {
    res.type("application/json");

    const fileName = req.body?.fileName ?? req.body?.filename ?? "";
    const rawText = typeof req.body?.rawText === "string" ? req.body.rawText : "";
    const textPreview = req.body?.textPreview ?? req.body?.text ?? "";
    const rawTrim = rawText.trim();

    let mockRouting = getMockRoutingMeta(fileName, rawText);
    let proposedUpdates = getMockProposedUpdates(fileName, rawText);
    let model = "mock";
    let mapPayload = null;
    let message =
      "Proposed updates require human approval before apply; dashboard is not mutated by analyze.";

    const mapMockClone = getDataIngestionMapMockClone();
    const mapKeywords = rawTextTriggersMapLaborMock(rawText);
    const key = anthropicKey();
    const analysisId = crypto.randomUUID();

    try {
      if (useMockApiFlag() && rawTrim && mapKeywords && mapMockClone) {
        mapPayload = mapMockClone;
        enrichLaborMapNationalBaseline(mapPayload);
        proposedUpdates = [];
        model = "mock";
        message =
          "Map-ready province labor report (mock: public/mock/dataIngestionMapResponse.json). Safe for dashboard preview.";
      } else if (!useMockApiFlag() && key && rawTrim) {
        try {
          const parsed = await callClaudeLaborMapParser(rawText, String(fileName), key);
          coerceLaborMapNumbers(parsed);
          ensureDisplacementSeriesOnProvinces(parsed);
          enrichLaborMapNationalBaseline(parsed);
          if (validateLaborMapResponse(parsed)) {
            mapPayload = parsed;
            mapPayload.provincesFound =
              typeof mapPayload.provincesFound === "number"
                ? mapPayload.provincesFound
                : mapPayload.provinces.length;
            proposedUpdates = [];
            model = "claude";
            mockRouting = {
              scenario: "labor_market_map",
              routing: "claude_labor_map_parser",
              detail: "rawText"
            };
            message =
              "Map-ready labor report parsed by Claude. previewMode/approvalRequired apply until your product flow commits.";
          } else {
            throw new Error("labor_map_validation_failed");
          }
        } catch (e) {
          console.error("[data-intake/analyze] labor map Claude failed:", e.message || e);
          if (mapMockClone) {
            mapPayload = mapMockClone;
            enrichLaborMapNationalBaseline(mapPayload);
          }
          proposedUpdates = [];
          model = "mock_fallback";
          mockRouting = {
            scenario: "labor_market_map",
            routing: "mock_fallback_after_claude",
            detail: String(e.message || e).slice(0, 160)
          };
          message =
            "Claude map parse failed or invalid JSON; returned safe map mock so the dashboard does not break.";
        }
      }

      if (!mapPayload) {
        if (useMockApiFlag()) {
          proposedUpdates = getMockProposedUpdates(fileName, rawText);
          mockRouting = getMockRoutingMeta(fileName, rawText);
          model = "mock";
          if (!proposedUpdates.length && !rawTrim) {
            message =
              "No mock proposals: add rawText (map keywords: Sulawesi, Jakarta, Nusa Tenggara/NTT) or use demo PDF / keyword rawText for dataset mocks.";
          } else if (!proposedUpdates.length && rawTrim) {
            message =
              "No keyword match for map mock and no dataset keyword match; try internet / tenaga kerja / pelatihan or a demo PDF file name.";
          }
        } else if (key) {
          if (!rawTrim) {
            try {
              const parsed = await callClaudeDataIntakeAnalyzeCompact(
                String(fileName),
                rawText,
                String(textPreview),
                key
              );
              const cleaned = sanitizeProposedUpdates(parsed?.proposedUpdates || []);
              if (cleaned.length > 0) {
                proposedUpdates = cleaned;
                model = "claude";
              } else {
                proposedUpdates = getMockProposedUpdates(fileName, rawText);
                mockRouting = getMockRoutingMeta(fileName, rawText);
                model = "mock_fallback";
              }
            } catch (e) {
              console.error("[data-intake/analyze] compact Claude failed:", e.message || e);
              proposedUpdates = getMockProposedUpdates(fileName, rawText);
              mockRouting = getMockRoutingMeta(fileName, rawText);
              model = "mock_fallback";
            }
          } else if (!mapMockClone) {
            try {
              const parsed = await callClaudeDataIntakeAnalyzeCompact(
                String(fileName),
                rawText,
                String(textPreview || rawText),
                key
              );
              const cleaned = sanitizeProposedUpdates(parsed?.proposedUpdates || []);
              proposedUpdates = cleaned.length ? cleaned : [];
              model = cleaned.length ? "claude" : "mock_fallback";
              if (!cleaned.length) {
                proposedUpdates = getMockProposedUpdates(fileName, rawText);
                mockRouting = getMockRoutingMeta(fileName, rawText);
              }
            } catch (e) {
              console.error("[data-intake/analyze] compact fallback failed:", e.message || e);
              proposedUpdates = getMockProposedUpdates(fileName, rawText);
              mockRouting = getMockRoutingMeta(fileName, rawText);
              model = "mock_fallback";
            }
            message =
              proposedUpdates.length > 0
                ? message
                : "Live map mock missing on disk; no compact proposals returned.";
          }
        }
      }
    } catch (e) {
      console.error("[data-intake/analyze] unexpected:", e.message || e);
      if (mapMockClone) {
        mapPayload = mapMockClone;
        enrichLaborMapNationalBaseline(mapPayload);
      }
      proposedUpdates = [];
      model = "mock_emergency";
      mockRouting = {
        scenario: "labor_market_map",
        routing: "error_safe_fallback",
        detail: "exception"
      };
      message = "Unexpected error; returned safe map mock (if available) with empty proposedUpdates.";
    }

    const body = {
      analysisId,
      fileName: String(fileName || ""),
      rawTextReceived: Boolean(rawTrim),
      mockRouting,
      model,
      proposedUpdates,
      proposedCount: proposedUpdates.length,
      message
    };
    if (mapPayload) {
      Object.assign(body, mapPayload);
    }

    analyses.set(analysisId, {
      fileName: String(fileName || ""),
      proposedUpdates,
      mapLaborReport: mapPayload,
      appliedIds: new Set()
    });

    res.json(body);
  });

  app.post("/api/data-intake/apply", (req, res) => {
    res.type("application/json");

    const analysisId = req.body?.analysisId;
    const approvedUpdateIds = req.body?.approvedUpdateIds;

    if (!analysisId || typeof analysisId !== "string") {
      return res.status(400).json({
        error: "analysisId is required",
        dashboardImpact: buildDashboardImpact([])
      });
    }

    if (!Array.isArray(approvedUpdateIds)) {
      return res.status(400).json({
        error: "approvedUpdateIds must be an array of strings",
        dashboardImpact: buildDashboardImpact([])
      });
    }

    const session = analyses.get(analysisId);
    if (!session) {
      return res.status(404).json({
        error: "Unknown or expired analysisId",
        dashboardImpact: buildDashboardImpact([])
      });
    }

    const idSet = new Set(session.proposedUpdates.map((u) => u.updateId));
    const appliedRows = [];
    let skippedUnknown = 0;
    let skippedAlready = 0;

    for (const rawId of approvedUpdateIds) {
      const id = typeof rawId === "string" ? rawId : String(rawId);
      if (!idSet.has(id)) {
        skippedUnknown += 1;
        continue;
      }
      if (session.appliedIds.has(id)) {
        skippedAlready += 1;
        continue;
      }
      const row = session.proposedUpdates.find((u) => u.updateId === id);
      if (row) {
        session.appliedIds.add(id);
        const stamp = {
          updateId: row.updateId,
          dataset: row.dataset,
          field: row.field,
          regionName: row.regionName,
          analysisId,
          appliedAt: new Date().toISOString()
        };
        appliedDemoLog.push(stamp);
        appliedRows.push(row);
      }
    }

    const dashboardImpact = buildDashboardImpact(appliedRows);

    res.json({
      analysisId,
      appliedCount: appliedRows.length,
      skippedUnknown,
      skippedAlready,
      dashboardImpact
    });
  });

  app.post("/api/data-intake/reset", (req, res) => {
    res.type("application/json");
    analyses.clear();
    const clearedApplied = appliedDemoLog.length;
    appliedDemoLog = [];
    res.json({
      ok: true,
      clearedAnalyses: true,
      clearedAppliedLogCount: clearedApplied,
      message: "Demo data-intake session state cleared."
    });
  });
}

export {
  registerDataIntakeRoutes,
  ALLOWED_DATASETS,
  getMockProposedUpdates,
  getMockRoutingMeta,
  detectScenarioFromRawText,
  normalizeFileName
};
