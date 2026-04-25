const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { callClaude } = require("./server/claude-client");

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

function getMockProposedUpdates(fileName, rawText) {
  const { scenario } = resolveMockScenario(fileName, rawText);
  if (!scenario) return [];
  return mockProposalsForScenario(scenario);
}

function getMockRoutingMeta(fileName, rawText) {
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

const DATA_INTAKE_OFFICER_SYSTEM = `You are a data extraction engine for UNMAPPED.

A government officer has pasted raw text from a national report. Your job is to:
1. Detect what type of data this contains (labor market, digital readiness, training programs, or country configuration)
2. Extract structured data from the messy text
3. Return proposed updates that a human can review before applying

Allowed update targets: laborMarket, digitalReadiness, interventionCatalog, countryConfig

The text may be in any language (Bahasa Indonesia, English, French, etc.). Extract regardless of language.

Return ONLY valid JSON:
{
  "detectedType": "laborMarket",
  "detectedCountry": "Indonesia",
  "detectedLanguage": "id",
  "confidence": "high",
  "proposedUpdates": [
    {
      "updateId": "upd_001",
      "dataset": "laborMarket",
      "operation": "update",
      "regionName": "Sulawesi Selatan",
      "field": "employment_agriculture",
      "currentValue": null,
      "proposedValue": 1608000,
      "unit": "persons",
      "year": 2024,
      "confidence": "high",
      "evidence": "Sektor pertanian menyerap 1,61 juta (38,2%)"
    }
  ],
  "summary": "Extracted 5 labor market indicators for Sulawesi Selatan from what appears to be a BPS Sakernas August 2024 report."
}

Per-item rules:
- Each proposedUpdates[].dataset must be one of: laborMarket, digitalReadiness, interventionCatalog, countryConfig.
- Each proposedUpdates[].confidence may be "high"|"medium"|"low" OR a number 0–1.
- operation may be replace|merge|append|patch|update (update means replace a scalar field).
- unit and year may be null if unknown.`;

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

async function callClaudeIntakeOfficerRawText(rawText, fileName, apiKey) {
  const rt = typeof rawText === "string" ? rawText : "";
  return callClaude({
    apiKey,
    system: DATA_INTAKE_OFFICER_SYSTEM,
    user: {
      rawText: rt.slice(0, 24000),
      fileName: String(fileName || "")
    },
    max_tokens: 8192
  });
}

function registerDataIntakeRoutes(app) {
  app.post("/api/data-intake/analyze", async (req, res) => {
    res.type("application/json");

    const fileName = req.body?.fileName ?? req.body?.filename ?? "";
    const rawText = typeof req.body?.rawText === "string" ? req.body.rawText : "";
    const textPreview = req.body?.textPreview ?? req.body?.text ?? "";

    const mockRouting = getMockRoutingMeta(fileName, rawText);
    const mockUpdates = getMockProposedUpdates(fileName, rawText);
    let proposedUpdates = mockUpdates;
    let model = "mock";
    let intakeMeta = {};

    const key = anthropicKey();
    if (!useMockApiFlag() && key) {
      const hasRaw = rawText.trim().length > 0;
      if (hasRaw) {
        try {
          const officer = await callClaudeIntakeOfficerRawText(rawText, String(fileName), key);
          const cleaned = sanitizeProposedUpdates(officer?.proposedUpdates || []);
          if (cleaned.length > 0) {
            proposedUpdates = cleaned;
            model = "claude";
            intakeMeta = {
              detectedType: officer.detectedType,
              detectedCountry: officer.detectedCountry,
              detectedLanguage: officer.detectedLanguage,
              intakeConfidence: officer.confidence,
              intakeSummary: officer.summary
            };
          } else {
            proposedUpdates = mockUpdates;
            model = "mock_fallback";
          }
        } catch (e) {
          console.error("[data-intake/analyze] officer Claude failed:", e.message || e);
          proposedUpdates = mockUpdates;
          model = "mock_fallback";
        }
      } else {
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
            proposedUpdates = mockUpdates;
            model = "mock_fallback";
          }
        } catch (e) {
          console.error("[data-intake/analyze] compact Claude failed:", e.message || e);
          proposedUpdates = mockUpdates;
          model = "mock_fallback";
        }
      }
    }

    const analysisId = crypto.randomUUID();
    analyses.set(analysisId, {
      fileName: String(fileName || ""),
      proposedUpdates,
      appliedIds: new Set()
    });

    res.json({
      analysisId,
      fileName: String(fileName || ""),
      rawTextReceived: Boolean(rawText && rawText.length > 0),
      mockRouting,
      model,
      ...intakeMeta,
      proposedUpdates,
      proposedCount: proposedUpdates.length,
      message:
        proposedUpdates.length === 0
          ? "No mock proposals: use a demo PDF file name, or paste rawText with keywords (e.g. internet, tenaga kerja, pelatihan, Sulawesi). With USE_MOCK_API=false and ANTHROPIC_API_KEY, send rawText/textPreview for live extraction (falls back to file/keyword mocks if parsing fails)."
          : "Proposed updates require human approval before apply; dashboard is not mutated by analyze."
    });
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

module.exports = {
  registerDataIntakeRoutes,
  ALLOWED_DATASETS,
  getMockProposedUpdates,
  getMockRoutingMeta,
  detectScenarioFromRawText,
  normalizeFileName
};
