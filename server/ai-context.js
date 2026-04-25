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
 * Map request skills to crosswalk + Frey–Osborne rows (no invented probabilities).
 */
function matchedFreyScoresForSkills(skills) {
  const mappings = socIscoCrosswalk?.mappings;
  if (!Array.isArray(mappings) || !Array.isArray(skills)) return [];

  const out = [];
  for (const sk of skills) {
    const isco = normalizeIsco(sk.isco_code || sk.isco08_code);
    const label = String(sk.name || sk.skill || sk.title || "").trim();
    let m = null;
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
    const frey = m ? freyBySoc(m.soc_code) : null;
    out.push({
      input_skill: { name: sk.name || sk.skill, isco_code: sk.isco_code || isco || null },
      crosswalk: m,
      frey_osborne: frey
        ? {
            soc_code: frey.soc_code,
            occupation: frey.occupation,
            automation_probability: frey.automation_probability,
            avg_annual_wage: frey.avg_annual_wage,
            employed: frey.employed,
            education: frey.education
          }
        : null
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
  normalizeIsco,
  internetPenetrationIndonesia,
  employmentShareChange,
  matchedFreyScoresForSkills,
  worldBankIndonesiaBundle
};
