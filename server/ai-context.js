/**
 * Loads committed taxonomy, automation, and World Bank extracts at module init
 * for Claude prompts and server-side enrichment.
 */

const fs = require("fs");
const path = require("path");

function readJsonFromRoot(relPath) {
  const full = path.join(__dirname, "..", relPath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

let escoOccupations;
let socIscoCrosswalk;
let freyOsborne;
let idnWorldBank;

try {
  escoOccupations = readJsonFromRoot("data/taxonomy/esco-occupations.json");
} catch {
  escoOccupations = null;
}
try {
  socIscoCrosswalk = readJsonFromRoot("data/automation/soc-isco-crosswalk.json");
} catch {
  socIscoCrosswalk = null;
}
try {
  freyOsborne = readJsonFromRoot("data/automation/frey-osborne.json");
} catch {
  freyOsborne = null;
}
try {
  idnWorldBank = readJsonFromRoot("data/worldbank/IDN.json");
} catch {
  idnWorldBank = null;
}

function freyBySoc(socCode) {
  const list = freyOsborne?.occupations;
  if (!Array.isArray(list)) return null;
  return list.find((o) => o.soc_code === socCode) || null;
}

function tokenizeForOverlap(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/** Cosine-like token overlap in [0, 1] (rough lexical similarity). */
function overlapSimilarity(queryStr, targetStr) {
  const q = new Set(tokenizeForOverlap(queryStr));
  const t = new Set(tokenizeForOverlap(targetStr));
  if (!q.size || !t.size) return 0;
  let inter = 0;
  for (const w of q) {
    if (t.has(w)) inter += 1;
  }
  return inter / Math.sqrt(q.size * t.size);
}

const MIN_LEXICAL_SIMILARITY = 0.06;

/**
 * Picks the single best-matching Frey–Osborne occupation by lexical overlap (argmax).
 * Returns null if the best score is below MIN_LEXICAL_SIMILARITY (unrelated anchors).
 * @param {string} anchorText
 * @param {{ minSimilarity?: number }} [opts]
 * @returns {{ occupation: object, similarity: number } | null}
 */
function findClosestFreyOccupation(anchorText, opts) {
  const minSim = opts?.minSimilarity ?? MIN_LEXICAL_SIMILARITY;
  const list = freyOsborne?.occupations;
  if (!Array.isArray(list) || !list.length) return null;
  const anchor = String(anchorText || "").trim();
  if (!anchor) return null;

  let best = null;
  let bestScore = 0;
  for (const occ of list) {
    const s = overlapSimilarity(anchor, occ.occupation);
    if (s > bestScore) {
      bestScore = s;
      best = occ;
    }
  }
  if (!best || bestScore < minSim) return null;
  return { occupation: best, similarity: bestScore };
}

function escoContextForIsco(iscoNorm) {
  const occs = escoOccupations?.occupations;
  if (!Array.isArray(occs) || !iscoNorm) return "";
  const parts = [];
  for (const o of occs) {
    if (normalizeIsco(o.isco_code) !== iscoNorm) continue;
    parts.push(o.title || "");
    if (o.description) parts.push(String(o.description).slice(0, 400));
    if (Array.isArray(o.skills)) {
      for (const sk of o.skills.slice(0, 8)) {
        if (sk?.title) parts.push(sk.title);
      }
    }
  }
  return parts.join(" ").slice(0, 2500);
}

function buildFreyPayload(occ) {
  if (!occ) return null;
  return {
    soc_code: occ.soc_code,
    occupation: occ.occupation,
    automation_probability: occ.automation_probability,
    avg_annual_wage: occ.avg_annual_wage,
    employed: occ.employed,
    education: occ.education
  };
}

function normalizeIsco(code) {
  if (code === undefined || code === null) return "";
  const s = String(code).replace(/\D/g, "");
  return s.slice(0, 4);
}

/** Latest numeric year/value for a WDI series object. */
function latestWdiPoint(series) {
  if (!series || typeof series !== "object") return null;
  const years = Object.keys(series)
    .filter((k) => /^\d{4}$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);
  if (!years.length) return null;
  const y = years[years.length - 1];
  const v = series[String(y)];
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return { year: y, value: v };
}

function internetPenetrationIndonesia() {
  const ind = idnWorldBank?.indicators?.internet_users_pct;
  const pt = latestWdiPoint(ind);
  if (!pt) return null;
  return {
    wdi: idnWorldBank?.indicator_codes?.internet_users_pct || "IT.NET.USER.ZS",
    year: pt.year,
    value_pct: pt.value,
    source_file: "data/worldbank/IDN.json"
  };
}

function employmentShareChange(key, yFrom, yTo) {
  const series = idnWorldBank?.indicators?.[key];
  if (!series) return null;
  const a = series[String(yFrom)];
  const b = series[String(yTo)];
  if (typeof a !== "number" || typeof b !== "number") return null;
  return {
    indicator_key: key,
    wdi: idnWorldBank?.indicator_codes?.[key],
    yearFrom: yFrom,
    yearTo: yTo,
    valueFrom: a,
    valueTo: b,
    changePercentagePoints: Number((b - a).toFixed(4))
  };
}

/**
 * Map request skills to crosswalk + Frey–Osborne rows.
 * Uses exact SOC from the crosswalk when present in the Frey–Osborne extract; otherwise picks the
 * lexically closest occupation in that extract and records an approximation note (no invented probabilities).
 */
function matchedFreyScoresForSkills(skills) {
  const mappings = socIscoCrosswalk?.mappings;
  if (!Array.isArray(skills)) return [];

  const out = [];
  for (const sk of skills) {
    const isco = normalizeIsco(sk.isco_code || sk.isco08_code);
    const label = String(sk.name || sk.skill || sk.title || "").trim();
    let m = null;
    if (Array.isArray(mappings)) {
      if (isco) {
        m = mappings.find((row) => normalizeIsco(row.isco08_code) === isco) || null;
      }
      if (!m && label) {
        const low = label.toLowerCase();
        m =
          mappings.find((row) => low.includes(String(row.persona || "").replace(/_/g, " "))) ||
          mappings.find((row) => low.includes(String(row.soc_title || "").toLowerCase().slice(0, 12))) ||
          null;
      }
    }

    let freyOcc = m ? freyBySoc(m.soc_code) : null;
    let matchMeta = {
      method: "unresolved",
      requested_isco: isco || null,
      requested_soc: m?.soc_code ?? null,
      approximation_note: null,
      lexical_similarity: null
    };

    if (m && freyOcc) {
      matchMeta.method = "exact_crosswalk_soc";
    } else if (m && !freyOcc) {
      const anchor = [m.isco08_title, m.soc_title, label].filter(Boolean).join(" ");
      const hit = findClosestFreyOccupation(anchor, { minSimilarity: MIN_LEXICAL_SIMILARITY });
      if (hit) {
        freyOcc = hit.occupation;
        matchMeta.method = "approximate_missing_soc_in_frey_extract";
        matchMeta.lexical_similarity = Number(hit.similarity.toFixed(4));
        matchMeta.approximation_note = `ISCO ${isco || m.isco08_code} maps to crosswalk SOC ${m.soc_code} (${m.soc_title}), but that SOC is not in the committed Frey–Osborne file. Using closest occupation by title overlap: SOC ${freyOcc.soc_code} — "${freyOcc.occupation}" (lexical similarity ${matchMeta.lexical_similarity}).`;
      } else {
        matchMeta.method = "unresolved_crosswalk_soc_missing_from_frey";
        matchMeta.approximation_note = `Crosswalk SOC ${m.soc_code} (${m.soc_title}) has no row in data/automation/frey-osborne.json, and no alternate occupation met the lexical similarity threshold (${MIN_LEXICAL_SIMILARITY}).`;
      }
    } else if (!m && (isco || label)) {
      const escoBit = isco ? escoContextForIsco(isco) : "";
      const anchor = [escoBit, label, isco].filter(Boolean).join(" ");
      const hit = findClosestFreyOccupation(anchor, { minSimilarity: MIN_LEXICAL_SIMILARITY });
      if (hit) {
        freyOcc = hit.occupation;
        matchMeta.method = "approximate_no_crosswalk_row";
        matchMeta.requested_soc = null;
        matchMeta.lexical_similarity = Number(hit.similarity.toFixed(4));
        matchMeta.approximation_note = isco
          ? `No SOC–ISCO crosswalk row for ISCO ${isco}. Used ESCO/title context + skill label to pick the closest Frey–Osborne occupation: SOC ${freyOcc.soc_code} — "${freyOcc.occupation}" (lexical similarity ${matchMeta.lexical_similarity}).`
          : `No crosswalk match from skill text alone. Picked closest Frey–Osborne occupation to the skill label: SOC ${freyOcc.soc_code} — "${freyOcc.occupation}" (lexical similarity ${matchMeta.lexical_similarity}).`;
      } else {
        matchMeta.method = "unresolved_no_crosswalk_weak_lexical";
        matchMeta.requested_soc = null;
        matchMeta.approximation_note = isco
          ? `No SOC–ISCO crosswalk row for ISCO ${isco}, and anchor text did not align to any Frey–Osborne occupation above similarity ${MIN_LEXICAL_SIMILARITY}.`
          : `No crosswalk match; skill label did not align to any Frey–Osborne occupation above similarity ${MIN_LEXICAL_SIMILARITY}.`;
      }
    }

    out.push({
      input_skill: { name: sk.name || sk.skill, isco_code: sk.isco_code || isco || null },
      crosswalk: m,
      frey_match_meta: matchMeta,
      frey_osborne: freyOcc ? buildFreyPayload(freyOcc) : null
    });
  }
  return out;
}

function worldBankIndonesiaBundle() {
  if (!idnWorldBank) return null;
  const ind = idnWorldBank.indicators || {};
  const codes = idnWorldBank.indicator_codes || {};
  const compact = {};
  for (const key of Object.keys(codes)) {
    const series = ind[key];
    const pt = latestWdiPoint(series);
    if (pt) {
      compact[key] = {
        wdi: codes[key],
        latest_year: pt.year,
        latest_value: pt.value
      };
    }
  }
  return {
    country: idnWorldBank.country,
    country_code: idnWorldBank.country_code,
    indicators_latest: compact,
    fetched_at: idnWorldBank.fetched_at,
    source: idnWorldBank.source
  };
}

module.exports = {
  escoOccupations,
  socIscoCrosswalk,
  freyOsborne,
  idnWorldBank,
  freyBySoc,
  findClosestFreyOccupation,
  normalizeIsco,
  internetPenetrationIndonesia,
  employmentShareChange,
  matchedFreyScoresForSkills,
  worldBankIndonesiaBundle
};
