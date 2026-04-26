import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  escoOccupations,
  socIscoCrosswalk,
  freyOsborne,
  findClosestFreyOccupation,
  normalizeIsco,
} from "./ai-context.js";
import { callClaude } from "./claude-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const SLIM_PATH = path.join(ROOT, "data", "taxonomy", "esco-occupations-slim.json");
const PROMPT_CHAR_BUDGET = 220_000;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function overlapScore(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.sqrt(A.size * B.size);
}

function getEscoList() {
  return Array.isArray(escoOccupations?.occupations) ? escoOccupations.occupations : [];
}

function getCrosswalkList() {
  return Array.isArray(socIscoCrosswalk?.mappings) ? socIscoCrosswalk.mappings : [];
}

function getFreyList() {
  return Array.isArray(freyOsborne?.occupations) ? freyOsborne.occupations : [];
}

function buildFreyBySoc() {
  const out = new Map();
  for (const row of getFreyList()) {
    if (!row?.soc_code) continue;
    out.set(String(row.soc_code), row);
  }
  return out;
}

function buildCrosswalkByIsco() {
  const out = new Map();
  for (const row of getCrosswalkList()) {
    const isco = normalizeIsco(row?.isco08_code);
    if (!isco) continue;
    if (!out.has(isco)) out.set(isco, []);
    out.get(isco).push(row);
  }
  return out;
}

function ensureEscoSlimFile() {
  const slim = {
    source: "ESCO API v1 (slim for skill extraction prompt)",
    generated_at: new Date().toISOString(),
    occupations: getEscoList().map((o) => ({
      title: o?.title || "",
      isco_code: normalizeIsco(o?.isco_code),
      skills: Array.isArray(o?.skills)
        ? o.skills
            .map((s) => s?.title)
            .filter(Boolean)
            .slice(0, 5)
        : [],
    })),
  };
  try {
    fs.writeFileSync(SLIM_PATH, JSON.stringify(slim, null, 2), "utf8");
  } catch {
    // best effort only
  }
  return slim;
}
ensureEscoSlimFile();

function buildSkillExtractionSystemPrompt() {
  const fullEscoJson = JSON.stringify(escoOccupations ?? {}, null, 0);
  const freyJson = JSON.stringify(freyOsborne ?? {}, null, 0);
  const crosswalkJson = JSON.stringify(socIscoCrosswalk ?? {}, null, 0);

  const escoPayload =
    fullEscoJson.length > PROMPT_CHAR_BUDGET
      ? JSON.stringify(ensureEscoSlimFile(), null, 0)
      : fullEscoJson;

  return `You are a skills extraction engine for UNMAPPED.

You will receive a transcript of someone describing their informal work experience in English.

Your job is to extract skills and map them ONLY to occupations that exist in the ESCO reference data provided below. Do not invent occupation codes. Only use codes from this list.

Here are the available ESCO occupations you can map to:
${escoPayload}

Here are the Frey-Osborne automation scores by SOC code:
${freyJson}

Here is the SOC to ISCO crosswalk:
${crosswalkJson}

For each skill you identify in the transcript:
1. Find the closest matching occupation from the ESCO list above
2. Use that occupation's exact ISCO code from the ESCO data
3. Look up the corresponding Frey-Osborne automation probability using the crosswalk
4. Quote the exact words from the transcript that evidence this skill
5. List the related ESCO skills from the matched occupation

Rules:
- ONLY use ISCO codes that appear in the ESCO data provided
- ONLY use automation probabilities that appear in the Frey-Osborne data provided
- If no exact match exists, use the closest occupation and note it
- All output must be in English
- Return confidence: "high" if the match is clear, "medium" if inferred, "low" if uncertain
- IMPORTANT: Extract ALL distinct skills mentioned in the transcript as SEPARATE entries. A single transcript often contains multiple skills. Do not combine them into one. If someone mentions 3 different activities, return 3 separate skill objects.

Return ONLY valid JSON, no preamble, no markdown backticks:
{
  "skills": [
    {
      "name": "Video Production",
      "isco_code": "2166",
      "isco_title": "Graphic and multimedia designers",
      "automation_probability": 0.18,
      "soc_code": "27-1024",
      "evidence": "edit videos for small businesses",
      "confidence": "high",
      "related_esco_skills": ["video editing", "digital content creation"],
      "verification_questions": [
        "What editing software do you use most often?",
        "How often do clients pay you for video work?"
      ],
      "assessment_notes": "User shows practical editing experience but needs confirmation of consistency and depth."
    }
  ],
  "follow_up_questions": [
    "What software do you use for editing?"
  ],
  "detected_language": "en"
}`;
}

function confidenceToNumber(c) {
  if (c === "high") return 0.9;
  if (c === "medium") return 0.65;
  if (c === "low") return 0.4;
  if (typeof c === "number" && !Number.isNaN(c)) return c;
  return 0.55;
}

function normalizeConfidenceWord(c) {
  if (c === "high" || c === "medium" || c === "low") return c;
  if (typeof c === "number" && !Number.isNaN(c)) {
    if (c >= 0.75) return "high";
    if (c >= 0.45) return "medium";
    return "low";
  }
  const t = String(c || "").toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  return null;
}

function normalizeIscoCode(code) {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 4) return digits.slice(0, 4);
  return digits.padStart(4, "0");
}

function defaultVerificationQuestions(name, evidence) {
  const n = String(name || "this skill");
  const e = String(evidence || "this work");
  return [
    `Can you share one specific recent example of ${n} based on "${e}"?`,
    `How often do you perform ${n} each week?`,
  ];
}

function nearestEscoForText(text) {
  let best = null;
  let bestScore = 0;
  for (const occ of getEscoList()) {
    const title = String(occ?.title || "");
    const skills = Array.isArray(occ?.skills) ? occ.skills.map((s) => s?.title).filter(Boolean).join(" ") : "";
    const score = Math.max(overlapScore(text, title), overlapScore(text, skills));
    if (score > bestScore) {
      bestScore = score;
      best = occ;
    }
  }
  return { occupation: best, score: bestScore };
}

const PERSONA_RULES = [
  {
    persona: "driver",
    isco: "8322",
    patterns: ["drive", "grab", "uber", "taxi", "chauffeur", "delivery", "courier", "motorbike"],
  },
  {
    persona: "video_editor",
    isco: "2166",
    patterns: ["edit video", "video editing", "videos", "graphic design", "design", "multimedia"],
  },
  {
    persona: "customer_service_agent",
    isco: "5223",
    patterns: ["customer call", "customer calls", "call center", "phone calls", "inbound calls", "support calls"],
  },
  {
    persona: "digital_marketer",
    isco: "2431",
    patterns: ["social media", "marketing", "promote", "campaign"],
  },
  {
    persona: "phone_repairer",
    isco: "7422",
    patterns: ["fix phone", "repair phone", "phone repair", "repair devices", "fix devices"],
  },
  {
    persona: "retail_seller",
    isco: "5223",
    patterns: ["sell", "market", "morning market", "shop", "stall", "fish", "store", "grocery", "retail", "cashier"],
  },
  {
    persona: "farmer",
    isco: "9211",
    patterns: ["grow", "farm", "corn", "crop", "harvest"],
  },
  {
    persona: "weaver",
    isco: "8153",
    patterns: ["weave", "textile", "sew", "sewing", "clothes"],
  },
];

function firstEscoByIsco(iscoCode) {
  const norm = normalizeIscoCode(iscoCode);
  return getEscoList().find((o) => normalizeIscoCode(o?.isco_code) === norm) || null;
}

function crosswalkRowForPersona(persona) {
  return getCrosswalkList().find((r) => String(r?.persona || "") === String(persona || "")) || null;
}

function findEscoByKeywordHints(hints) {
  const keys = hints.map((h) => h.toLowerCase());
  for (const occ of getEscoList()) {
    const title = String(occ?.title || "").toLowerCase();
    const skills = Array.isArray(occ?.skills)
      ? occ.skills.map((s) => String(s?.title || "").toLowerCase()).join(" ")
      : "";
    if (keys.some((k) => title.includes(k) || skills.includes(k))) return occ;
  }
  return null;
}

function attachSocAndAutomation(skill) {
  const isco = normalizeIscoCode(skill?.isco_code);
  const byIsco = buildCrosswalkByIsco().get(isco) || [];
  const freyBySoc = buildFreyBySoc();

  let soc = byIsco[0]?.soc_code ? String(byIsco[0].soc_code) : null;
  let auto = soc ? freyBySoc.get(soc)?.automation_probability ?? null : null;

  if ((soc === null || auto === null) && (skill?.name || skill?.evidence)) {
    const anchor = `${skill?.name || ""} ${skill?.evidence || ""}`.trim();
    const hit = findClosestFreyOccupation(anchor, { minSimilarity: 0.08 });
    if (hit?.occupation) {
      soc = String(hit.occupation.soc_code);
      auto = hit.occupation.automation_probability;
    }
  }

  return {
    ...skill,
    soc_code: soc,
    automation_probability: typeof auto === "number" ? auto : null,
  };
}

function validateAndRepairAgainstEsco(result) {
  const validIsco = new Set(getEscoList().map((o) => normalizeIsco(o?.isco_code)).filter(Boolean));
  const repaired = [];
  for (const raw of result.skills || []) {
    let row = { ...raw };
    const currentIsco = normalizeIscoCode(row.isco_code);
    if (!validIsco.has(currentIsco)) {
      const near = nearestEscoForText(`${row.name || ""} ${row.evidence || ""}`);
      if (near.occupation) {
        row.isco_code = normalizeIscoCode(near.occupation.isco_code);
        row.isco_title = near.occupation.title;
        row.related_esco_skills = Array.isArray(near.occupation.skills)
          ? near.occupation.skills.map((s) => s?.title).filter(Boolean).slice(0, 5)
          : [];
        row.confidence = "low";
      }
    }
    repaired.push(attachSocAndAutomation(row));
  }
  return {
    ...result,
    skills: repaired,
  };
}

function heuristicSkillExtractionFromTranscript(transcript) {
  const parts = String(transcript || "")
    .split(/[,.]| and /gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const picked = [];
  const seenSkillKey = new Set();
  const fullLower = String(transcript || "").toLowerCase();

  // First pass: capture every distinct persona mentioned anywhere in transcript.
  for (const rule of PERSONA_RULES) {
    if (!rule.patterns.some((p) => fullLower.includes(p))) continue;
    let byRule = firstEscoByIsco(rule.isco);
    if (!byRule && rule.persona === "farmer") {
      byRule = findEscoByKeywordHints(["farmer", "agricultural", "crop", "farm"]);
    }
    if (!byRule && rule.persona === "weaver") {
      byRule = findEscoByKeywordHints(["weaver", "textile", "sewing"]);
    }
    if (!byRule && rule.persona === "customer_service_agent") {
      byRule = findEscoByKeywordHints(["customer service", "call centre", "call center", "contact centre", "contact center", "telephone"]);
    }
    if (!byRule) continue;
    const isco = normalizeIscoCode(byRule.isco_code);
    const skillKey = `${isco}:${rule.persona}`;
    if (!isco || seenSkillKey.has(skillKey)) continue;
    seenSkillKey.add(skillKey);
    const related = Array.isArray(byRule.skills)
      ? byRule.skills.map((s) => s?.title).filter(Boolean).slice(0, 5)
      : [];
    const cw = crosswalkRowForPersona(rule.persona);
    const displayTitle =
      typeof cw?.isco08_title === "string" && cw.isco08_title.trim()
        ? cw.isco08_title
        : byRule.title;
    const displayName =
      rule.persona === "customer_service_agent" ? "Customer service / call handling" : displayTitle;
    picked.push(
      attachSocAndAutomation({
        name: displayName,
        isco_code: isco,
        isco_title: displayTitle,
        evidence: transcript,
        confidence: "high",
        related_esco_skills: related,
        verification_questions: defaultVerificationQuestions(displayTitle, transcript),
        assessment_notes: `Initial match from transcript evidence: "${transcript}". Verify frequency and autonomy.`,
      })
    );
  }

  for (const part of parts) {
    const low = part.toLowerCase();
    const rule = PERSONA_RULES.find((r) => r.patterns.some((p) => low.includes(p)));
    let byRule = rule ? firstEscoByIsco(rule.isco) : null;
    if (!byRule && rule?.persona === "farmer") {
      byRule = findEscoByKeywordHints(["farmer", "agricultural", "crop", "farm"]);
    }
    if (!byRule && rule?.persona === "weaver") {
      byRule = findEscoByKeywordHints(["weaver", "textile", "sewing"]);
    }
    if (!byRule && rule?.persona === "customer_service_agent") {
      byRule = findEscoByKeywordHints(["customer service", "call centre", "call center", "contact centre", "contact center", "telephone"]);
    }
    const near = byRule ? { occupation: byRule, score: 0.9 } : nearestEscoForText(part);
    if (!near.occupation) continue;
    const isco = normalizeIscoCode(near.occupation.isco_code);
    const skillKey = `${isco}:${rule?.persona || near.occupation.title}`;
    if (!isco || seenSkillKey.has(skillKey)) continue;
    seenSkillKey.add(skillKey);
    const related = Array.isArray(near.occupation.skills)
      ? near.occupation.skills.map((s) => s?.title).filter(Boolean).slice(0, 5)
      : [];
    const cw = rule ? crosswalkRowForPersona(rule.persona) : null;
    const displayTitle =
      typeof cw?.isco08_title === "string" && cw.isco08_title.trim()
        ? cw.isco08_title
        : near.occupation.title;
    const displayName =
      rule?.persona === "customer_service_agent" ? "Customer service / call handling" : displayTitle;
    picked.push(
      attachSocAndAutomation({
        name: displayName,
        isco_code: isco,
        isco_title: displayTitle,
        evidence: part,
        confidence: near.score >= 0.25 ? "high" : near.score >= 0.12 ? "medium" : "low",
        related_esco_skills: related,
        verification_questions: defaultVerificationQuestions(displayTitle, part),
        assessment_notes: `Initial match from transcript evidence: "${part}". Verify frequency and autonomy.`,
      })
    );
  }

  const skills = picked.length
    ? picked.slice(0, 4)
    : [
        attachSocAndAutomation({
          name: "General service work",
          isco_code: "0000",
          isco_title: "Closest ESCO occupation not confidently matched",
          evidence: transcript.slice(0, 160),
          confidence: "low",
          related_esco_skills: [],
          verification_questions: defaultVerificationQuestions(
            "general service work",
            transcript.slice(0, 80)
          ),
          assessment_notes: "Low-confidence fallback; verification is required.",
        }),
      ];

  return {
    skills,
    follow_up_questions: skills.slice(0, 2).map((s) => `What tools do you use when doing ${s.name}?`),
    detected_language: "en",
  };
}

/** Coerces common Claude drift; returns a fresh object or null. */
function normalizeSkillExtraction(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (!Array.isArray(obj.skills)) return null;
  const skills = [];
  for (const s of obj.skills) {
    if (!s || typeof s !== "object") continue;
    const name = String(s.name || "").trim();
    const isco = normalizeIscoCode(s.isco_code);
    const conf = normalizeConfidenceWord(s.confidence);
    if (!name || !isco || !conf) continue;
    skills.push({
      name,
      isco_code: isco,
      isco_title: typeof s.isco_title === "string" ? s.isco_title : "",
      evidence: typeof s.evidence === "string" ? s.evidence : "",
      confidence: conf,
      automation_probability:
        typeof s.automation_probability === "number" ? s.automation_probability : null,
      soc_code: typeof s.soc_code === "string" ? s.soc_code : null,
      related_esco_skills: Array.isArray(s.related_esco_skills)
        ? s.related_esco_skills.map((x) => String(x)).filter(Boolean)
        : [],
      verification_questions: Array.isArray(s.verification_questions)
        ? s.verification_questions.map((x) => String(x)).filter(Boolean).slice(0, 3)
        : defaultVerificationQuestions(name, typeof s.evidence === "string" ? s.evidence : ""),
      assessment_notes:
        typeof s.assessment_notes === "string" && s.assessment_notes.trim()
          ? s.assessment_notes.trim()
          : "Preliminary assessment from transcript; verify with follow-up responses."
    });
  }
  if (!skills.length) return null;
  const follow = Array.isArray(obj.follow_up_questions)
    ? obj.follow_up_questions.map((x) => String(x)).filter(Boolean)
    : [];
  const lang =
    typeof obj.detected_language === "string" && obj.detected_language.trim()
      ? obj.detected_language.trim()
      : "en";
  return {
    skills,
    follow_up_questions: follow,
    detected_language: lang
  };
}

function validateSkillExtraction(obj) {
  return normalizeSkillExtraction(obj) !== null;
}

/** Adds legacy shape for older clients. */
function withLegacyFields(result) {
  const extractedSkills = (result.skills || []).map((s) => ({
    name: s.name,
    confidence: confidenceToNumber(s.confidence)
  }));
  const missingCriticalSkills = [];
  return {
    ...result,
    extractedSkills,
    missingCriticalSkills
  };
}

/**
 * @param {string} transcript
 * @param {{ apiKey: string, skillExtractionFallback: object }} opts
 */
async function runSkillExtraction(transcript, opts) {
  const { apiKey, skillExtractionFallback } = opts;
  const trimmed = String(transcript || "").trim();
  if (!trimmed) {
    return {
      error: "transcript_required",
      message: "Provide a non-empty transcript or text in the request body.",
      skills: [],
      follow_up_questions: [],
      detected_language: "unknown",
      extractedSkills: [],
      missingCriticalSkills: []
    };
  }

  if (!apiKey) {
    return withLegacyFields(validateAndRepairAgainstEsco(heuristicSkillExtractionFromTranscript(trimmed)));
  }

  try {
    const parsed = await callClaude({
      apiKey,
      system: buildSkillExtractionSystemPrompt(),
      user: { transcript: trimmed },
      max_tokens: 8192
    });
    const normalized = normalizeSkillExtraction(parsed);
    if (normalized) {
      return withLegacyFields(validateAndRepairAgainstEsco(normalized));
    }
    console.error("[skills/extract] Claude JSON failed normalization; raw keys:", parsed && Object.keys(parsed));
  } catch (e) {
    console.error("[skills/extract] Claude or parse failed:", e.message || e);
  }

  const fallback = heuristicSkillExtractionFromTranscript(trimmed) || normalizeSkillExtraction(skillExtractionFallback);
  return withLegacyFields(validateAndRepairAgainstEsco(fallback));
}

export {
  buildSkillExtractionSystemPrompt,
  validateSkillExtraction,
  normalizeSkillExtraction,
  runSkillExtraction,
  withLegacyFields
};
