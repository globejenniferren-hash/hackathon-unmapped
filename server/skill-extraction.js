const { escoOccupations, socIscoCrosswalk } = require("./ai-context");
const { callClaude } = require("./claude-client");

function buildSkillExtractionSystemPrompt() {
  const escoJson = JSON.stringify(escoOccupations ?? {}, null, 0);
  const crosswalkJson = JSON.stringify(socIscoCrosswalk ?? {}, null, 0);

  return `You are a skills extraction engine for UNMAPPED, a workforce intelligence platform.

Your job: take a raw transcript of someone describing their informal work experience (possibly in Bahasa Indonesia, English, or mixed) and extract structured skills.

For each skill you identify:
- Map it to the nearest ISCO-08 occupation code
- Provide a professional English skill label
- Quote the exact phrase from the transcript that evidences this skill
- Rate confidence: high (specific and clear), medium (implied), low (vague)
- Suggest 1-2 follow-up questions to deepen the profile (these may be in the same language as the transcript, or English)

Here are the ISCO-08 occupation codes and ESCO skills you should map to:
${escoJson}

SOC → ISCO crosswalk (use to align SOC-based automation data later):
${crosswalkJson}

Return ONLY valid JSON in this exact format, no preamble, no markdown:
{
  "skills": [
    {
      "name": "Video Production",
      "isco_code": "2166",
      "isco_title": "Graphic and Multimedia Designers",
      "evidence": "edit video buat UMKM",
      "confidence": "high",
      "related_esco_skills": ["video editing", "digital content creation"]
    }
  ],
  "follow_up_questions": [
    "What software do you use for video editing?",
    "How many customers do you serve per week for phone repair?"
  ],
  "detected_language": "id"
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
      related_esco_skills: Array.isArray(s.related_esco_skills)
        ? s.related_esco_skills.map((x) => String(x)).filter(Boolean)
        : []
    });
  }
  if (!skills.length) return null;
  const follow = Array.isArray(obj.follow_up_questions)
    ? obj.follow_up_questions.map((x) => String(x)).filter(Boolean)
    : [];
  const lang =
    typeof obj.detected_language === "string" && obj.detected_language.trim()
      ? obj.detected_language.trim()
      : "id";
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

  try {
    const parsed = await callClaude({
      apiKey,
      system: buildSkillExtractionSystemPrompt(),
      user: { transcript: trimmed },
      max_tokens: 8192
    });
    const normalized = normalizeSkillExtraction(parsed);
    if (normalized) {
      return withLegacyFields(normalized);
    }
    console.error("[skills/extract] Claude JSON failed normalization; raw keys:", parsed && Object.keys(parsed));
  } catch (e) {
    console.error("[skills/extract] Claude or parse failed:", e.message || e);
  }

  return withLegacyFields(skillExtractionFallback);
}

module.exports = {
  buildSkillExtractionSystemPrompt,
  validateSkillExtraction,
  normalizeSkillExtraction,
  runSkillExtraction,
  withLegacyFields
};
