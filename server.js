import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";
import multer from "multer";
import { registerDataIntakeRoutes } from "./data-intake.js";
import { callClaude, CLAUDE_MODEL } from "./server/claude-client.js";
import { runSkillExtraction } from "./server/skill-extraction.js";
import { runRiskScoring } from "./server/risk-scoring.js";
import { transcribeAudio } from "./server/transcription.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

dotenv.config({ path: ".env.local" });
console.log("ANTHROPIC_API_KEY loaded:", process.env.ANTHROPIC_API_KEY ? "YES" : "NO");

const userProfile = require("./public/mock/userProfile.json");
const skillExtractionResponse = require("./public/mock/skillExtractionResponse.json");
const riskPathwayResponse = require("./public/mock/riskPathwayResponse.json");
const provinceRiskResponse = require("./public/mock/provinceRiskResponse.json");
const interventionResponse = require("./public/mock/interventionResponse.json");
const passportResponse = require("./src/mock/passportResponse.json");
const lovableProvinceRiskResponse = require("./src/mock/provinceRiskResponse.json");
const lovableInterventionResponse = require("./src/mock/interventionResponse.json");
const indonesiaConfig = require("./data/country-configs/indonesia.json");

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

function listWorldbankIso3() {
  const dir = path.join(__dirname, "data", "worldbank");
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/i, "").toUpperCase());
}

function readDataJson(...segments) {
  const filePath = path.join(__dirname, ...segments);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
const USE_MOCK_API = false;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(express.json());

registerDataIntakeRoutes(app);

app.post("/api/voice/transcribe", upload.single("audio"), async (req, res) => {
  res.type("application/json");
  const file = req.file;
  if (!file?.buffer?.length) {
    return res.status(400).json({ error: "audio_required" });
  }
  try {
    const transcript = await transcribeAudio({
      apiKey: OPENAI_API_KEY,
      audioBuffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname || "recording.webm",
      language: "en",
    });
    return res.json({ transcript });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "openai_key_missing") {
      return res.json({
        transcript:
          "I help customers in a shop, manage inventory, and deliver orders by motorbike.",
        warning: "openai_key_missing_using_demo_transcript",
      });
    }
    return res.status(502).json({ error: "transcription_failed", detail: msg });
  }
});

async function callClaudeJSON(systemPrompt, payload, fallbackResponse) {
  if (USE_MOCK_API || !ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "your_key_here") {
    return fallbackResponse;
  }
  try {
    return await callClaude({
      apiKey: ANTHROPIC_API_KEY,
      system: systemPrompt,
      user: payload,
      max_tokens: 2048
    });
  } catch (e) {
    console.error("[callClaudeJSON]", e.message || e);
    throw e;
  }
}

function buildPathwaysSimulateFallback(payload) {
  const city = String(payload?.city || "Makassar");
  const missed = passportResponse?.missedIncome || {};
  const forward = Array.isArray(passportResponse?.forwardPaths) ? passportResponse.forwardPaths : [];
  const jobs = Array.isArray(missed?.missedOpenings) ? missed.missedOpenings : [];
  const why = Array.isArray(missed?.reasoning) ? missed.reasoning : [];
  return {
    current_estimated_earnings: {
      display: "Rp 4.1M/mo",
      usd_equivalent: 275
    },
    potential_earnings: {
      display: "Rp 7.6M/mo",
      usd_equivalent: 510
    },
    monthly_gap: {
      display: "Rp 3.5M/mo",
      usd_equivalent: 235
    },
    annual_gap: {
      display: "Rp 42M/yr",
      usd_equivalent: 2820
    },
    why_gap_exists: why.slice(0, 3).map((reason, idx) => ({
      reason: String(reason),
      skill: idx === 0 ? "Customer Service" : idx === 1 ? "Driving + Delivery" : "Operations",
      potential_role: idx === 0 ? "Retail floor lead" : idx === 1 ? "Fleet coordinator" : "Operations assistant",
      potential_wage_display: idx === 0 ? "Rp 5.4M/mo" : idx === 1 ? "Rp 6.1M/mo" : "Rp 5.0M/mo"
    })),
    jobs_matching_skills: jobs.slice(0, 3).map((j, idx) => ({
      title: String(j?.title || (idx === 0 ? "Retail floor lead" : "Fleet coordinator")),
      wage_display: String(j?.monthly || "Rp 5.4M/mo"),
      match_reason:
        idx === 0
          ? "Your customer service + inventory skills"
          : idx === 1
          ? "Your driving + route knowledge"
          : "Your practical work history matches this role"
    })),
    pathways: forward.slice(0, 3).map((p, idx) => ({
      skill_to_add: String(p?.addSkill || "Spreadsheets & basic SQL"),
      training_program: String(p?.viaProgram || "Pre-Employment: Data for Small Business"),
      duration: String(p?.timeToReady || "2 months"),
      difficulty: String(p?.difficulty || "moderate"),
      unlocks: Array.isArray(p?.unlocks)
        ? p.unlocks.slice(0, 3).map((u, j) => ({
            role: String(u),
            wage_display: j === 0 ? "Rp 7.3M/mo" : j === 1 ? "Rp 7.9M/mo" : "Rp 6.8M/mo"
          }))
        : [{ role: "Inventory Analyst", wage_display: "Rp 7.3M/mo" }],
      income_lift_display: String(p?.incomeLift || "+Rp 3.2M/mo"),
      automation_resilience_years: idx === 0 ? 10 : 8,
      sources: ["ESCO taxonomy", "Frey & Osborne (2017)"]
    })),
    sources: ["World Bank WDI NY.GDP.PCAP.CD", "ILOSTAT wage estimates", "Frey & Osborne (2017)"],
    city,
    country: "Indonesia"
  };
}

app.get("/api/demo/user", (req, res) => {
  res.json(userProfile);
});

// Legacy compatibility for the Lovable routes.
// Canonical backend contracts remain under /api/demo/* and /api/dashboard/*.
app.get("/api/profile", (req, res) => {
  res.json({
    ...userProfile,
    name: userProfile.displayName ?? "User",
    city: "Makassar",
    country: "Indonesia",
    language: "Bahasa Indonesia",
    sector: "informal-services",
    sponsor: {
      exists: false,
      name: "",
      program: ""
    }
  });
});

app.get("/api/passport", (req, res) => {
  res.json(passportResponse);
});

app.post("/api/skills/extract", async (req, res) => {
  res.type("application/json");
  const transcript = req.body?.transcript || req.body?.text || "";
  const trimmed = String(transcript).trim();

  if (!trimmed) {
    const empty = await runSkillExtraction("", {
      apiKey: ANTHROPIC_API_KEY || "",
      skillExtractionFallback: skillExtractionResponse
    });
    return res.status(400).json(empty);
  }

  try {
    const result = await runSkillExtraction(trimmed, {
      apiKey:
        !USE_MOCK_API && ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== "your_key_here"
          ? ANTHROPIC_API_KEY
          : "",
      skillExtractionFallback: {}
    });
    if (result.error === "transcript_required") {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error("[/api/skills/extract] primary extraction failed:", error);
    try {
      const fallback = await runSkillExtraction(trimmed, {
        apiKey: "",
        skillExtractionFallback: {}
      });
      return res.json(fallback);
    } catch (fallbackError) {
      console.error("[/api/skills/extract] fallback extraction failed:", fallbackError);
      return res.status(502).json({
        error: "skill_extraction_failed",
        message: "Skill extraction failed for this transcript."
      });
    }
  }
});

app.post("/api/risk/score", async (req, res) => {
  res.type("application/json");
  const skills = req.body?.skills || [];

  if (USE_MOCK_API) {
    return res.json(riskPathwayResponse);
  }

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "your_key_here") {
    return res.status(503).json({
      error: "anthropic_key_missing",
      message: "Set ANTHROPIC_API_KEY in .env.local and USE_MOCK_API=false for live risk scoring."
    });
  }

  try {
    const result = await runRiskScoring(skills, {
      apiKey: ANTHROPIC_API_KEY,
      riskPathwayFallback: riskPathwayResponse
    });
    res.json(result);
  } catch (error) {
    console.error("[/api/risk/score]", error);
    res.json(riskPathwayResponse);
  }
});

app.post("/api/pathways/simulate", async (req, res) => {
  const payload = req.body || {};
  const fallback = buildPathwaysSimulateFallback(payload);
  const idnWb = readDataJson("data", "worldbank", "IDN.json");
  const escoSlim = readDataJson("data", "taxonomy", "esco-occupations-slim.json");
  const frey = readDataJson("data", "automation", "frey-osborne.json");

  try {
    const result = await callClaudeJSON(
      `You are a career pathway simulator for UNMAPPED.
Return ONLY valid JSON with this exact structure:
{
  "current_estimated_earnings": { "display": "Rp 4.1M/mo", "usd_equivalent": 275 },
  "potential_earnings": { "display": "Rp 7.6M/mo", "usd_equivalent": 510 },
  "monthly_gap": { "display": "Rp 3.5M/mo", "usd_equivalent": 235 },
  "annual_gap": { "display": "Rp 42M/yr", "usd_equivalent": 2820 },
  "why_gap_exists": [
    { "reason": "...", "skill": "...", "potential_role": "...", "potential_wage_display": "Rp .../mo" }
  ],
  "jobs_matching_skills": [
    { "title": "...", "wage_display": "Rp .../mo", "match_reason": "..." }
  ],
  "pathways": [
    {
      "skill_to_add": "...",
      "training_program": "...",
      "duration": "...",
      "difficulty": "easy|moderate|hard",
      "unlocks": [{ "role": "...", "wage_display": "Rp .../mo" }],
      "income_lift_display": "+Rp .../mo",
      "automation_resilience_years": 8,
      "sources": ["ESCO taxonomy", "Frey & Osborne (2017)"]
    }
  ],
  "sources": ["World Bank WDI NY.GDP.PCAP.CD", "ILOSTAT wage estimates", "Frey & Osborne (2017)"],
  "city": "${String(payload?.city || "Makassar")}",
  "country": "Indonesia"
}

Rules:
- Use Indonesian Rupiah (Rp) as primary wage display everywhere.
- Keep values realistic for Indonesia context using provided data.
- Use provided user skills, ESCO occupations/skills, Frey-Osborne risk context, and IDN World Bank bundle.
- Keep reasons concise and practical.

Data context:
skills_payload: ${JSON.stringify(payload?.skills || [], null, 0)}
worldbank_idn_bundle: ${JSON.stringify(idnWb || {}, null, 0).slice(0, 20000)}
esco_slim: ${JSON.stringify(escoSlim || {}, null, 0).slice(0, 16000)}
frey_osborne_sample: ${JSON.stringify((frey?.occupations || []).slice(0, 120), null, 0)}
`,
      payload,
      fallback
    );
    res.json(result);
  } catch (error) {
    console.error("[/api/pathways/simulate]", error);
    res.json(fallback);
  }
});

app.post("/api/dashboard/interventions", async (req, res) => {
  try {
    const result = await callClaudeJSON(
      "Recommend interventions and return { countryCode, provinceCode, interventions: [{ id, title, type, targetRiskFactors, expectedImpactScore, estimatedCostUsd, deliveryPartner }] }.",
      req.body || {},
      interventionResponse
    );
    res.json(result);
  } catch (error) {
    res.json(interventionResponse);
  }
});

// Canonical dashboard GET route for person2 contracts.
app.get("/api/dashboard/province-risk", (req, res) => {
  res.json(provinceRiskResponse);
});

// Canonical dashboard GET route used by loadDashboardData.
app.get("/api/dashboard/interventions", (req, res) => {
  res.json(interventionResponse);
});

// Legacy compatibility route for the mobile/Lovable dashboard card.
app.get("/api/dashboard/provinces", (req, res) => {
  res.json(lovableProvinceRiskResponse);
});

// Legacy compatibility route for the mobile/Lovable intervention list.
app.get("/api/dashboard/interventions-legacy", (req, res) => {
  res.json(lovableInterventionResponse);
});

app.get("/api/config/indonesia", (req, res) => {
  res.json(indonesiaConfig);
});

app.get("/api/data/worldbank/:countryCode", (req, res) => {
  const iso3 = String(req.params.countryCode || "").trim().toUpperCase();
  const filePath = path.join(__dirname, "data", "worldbank", `${iso3}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: "World Bank extract not found for requested ISO3 code",
      country_code: iso3,
      available: listWorldbankIso3()
    });
  }
  res.type("application/json").send(fs.readFileSync(filePath, "utf8"));
});

app.get("/api/data/automation/all", (req, res) => {
  const filePath = path.join(__dirname, "data", "automation", "frey-osborne.json");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Automation dataset not found" });
  }
  res.type("application/json").send(fs.readFileSync(filePath, "utf8"));
});

app.get("/api/data/automation/crosswalk/soc-isco", (req, res) => {
  const filePath = path.join(__dirname, "data", "automation", "soc-isco-crosswalk.json");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "SOC–ISCO crosswalk not found" });
  }
  res.type("application/json").send(fs.readFileSync(filePath, "utf8"));
});

app.get("/api/data/automation/:socCode", (req, res) => {
  const raw = String(req.params.socCode || "").trim();
  const soc = decodeURIComponent(raw).replace(/–/g, "-");
  const data = readDataJson("data", "automation", "frey-osborne.json");
  if (!data) {
    return res.status(404).json({ error: "Automation dataset not found" });
  }
  const hit = data.occupations.find((o) => o.soc_code === soc);
  if (!hit) {
    return res.status(404).json({
      error: "SOC code not found in Frey–Osborne extract",
      soc_code: soc
    });
  }
  res.json({
    source: data.source,
    soc_code: hit.soc_code,
    occupation: hit.occupation,
    automation_probability: hit.automation_probability,
    avg_annual_wage: hit.avg_annual_wage,
    education: hit.education,
    employed: hit.employed
  });
});

app.get("/api/data/taxonomy/esco-occupations", (req, res) => {
  const filePath = path.join(__dirname, "data", "taxonomy", "esco-occupations.json");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "ESCO taxonomy file not found" });
  }
  res.type("application/json").send(fs.readFileSync(filePath, "utf8"));
});

app.get("/api/data/taxonomy/isco-08", (req, res) => {
  const filePath = path.join(__dirname, "data", "taxonomy", "isco-08-codes.json");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "ISCO-08 lookup not found" });
  }
  res.type("application/json").send(fs.readFileSync(filePath, "utf8"));
});

app.get("/api/data/projections/wittgenstein", (req, res) => {
  const filePath = path.join(__dirname, "data", "projections", "wittgenstein.json");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Wittgenstein projections not found" });
  }
  res.type("application/json").send(fs.readFileSync(filePath, "utf8"));
});

app.listen(port, () => {
  console.log(
    `API server running on http://localhost:${port} (USE_MOCK_API=${USE_MOCK_API}, CLAUDE_MODEL=${CLAUDE_MODEL})`
  );
});
