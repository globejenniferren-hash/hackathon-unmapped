const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

const userProfile = require("./public/mock/userProfile.json");
const skillExtractionResponse = require("./public/mock/skillExtractionResponse.json");
const riskPathwayResponse = require("./public/mock/riskPathwayResponse.json");
const interventionResponse = require("./public/mock/interventionResponse.json");
const indonesiaConfig = require("./data/country-configs/indonesia.json");
const { registerDataIntakeRoutes } = require("./data-intake");
const { callClaude, CLAUDE_MODEL } = require("./server/claude-client");
const { runSkillExtraction } = require("./server/skill-extraction");
const { runRiskScoring } = require("./server/risk-scoring");

const app = express();
const port = process.env.PORT || 3000;

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
const USE_MOCK_API = (process.env.USE_MOCK_API || "true").toLowerCase() !== "false";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json());

registerDataIntakeRoutes(app);

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

app.get("/api/demo/user", (req, res) => {
  res.json(userProfile);
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

  if (USE_MOCK_API) {
    return res.json(skillExtractionResponse);
  }

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "your_key_here") {
    return res.status(503).json({
      error: "anthropic_key_missing",
      message: "Set ANTHROPIC_API_KEY in .env.local and USE_MOCK_API=false for live skill extraction."
    });
  }

  try {
    const result = await runSkillExtraction(trimmed, {
      apiKey: ANTHROPIC_API_KEY,
      skillExtractionFallback: skillExtractionResponse
    });
    if (result.error === "transcript_required") {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error("[/api/skills/extract]", error);
    res.json(skillExtractionResponse);
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
  const fallback = {
    userId: riskPathwayResponse.userId,
    recommendedPathways: riskPathwayResponse.recommendedPathways
  };

  try {
    const result = await callClaudeJSON(
      "Given risk and skills, return { userId, recommendedPathways: [{ pathwayId, title, priority }] }.",
      req.body || {},
      fallback
    );
    res.json(result);
  } catch (error) {
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
