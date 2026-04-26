/**
 * Fetches selected ESCO occupations + linked skills from the public ESCO API v1.
 * Writes data/taxonomy/esco-occupations.json (committed; no runtime fetch in demo).
 *
 * Usage: node scripts/fetch-esco-occupations.js
 */

const fs = require("fs");
const path = require("path");

const ESCO_BASE = "https://ec.europa.eu/esco/api";

/** Demo themes: search text -> hint to disambiguate first search hit */
const SEARCHES = [
  { theme: "Video production / multimedia design", text: "multimedia designer" },
  { theme: "Ride-hailing / taxi driver", text: "taxi driver" },
  { theme: "Mobile phone repair / electronics repair", text: "telecommunications equipment repairer" },
  { theme: "Retail sales", text: "shop salesperson" },
  { theme: "Agricultural worker", text: "crop farm labourer" },
  { theme: "Textile weaver", text: "weaver textile" },
  { theme: "Digital marketing", text: "digital marketing specialist" },
  { theme: "Solar panel installation", text: "solar photovoltaic installer" }
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const maxAttempts = 4;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} for ${url}\n${t.slice(0, 200)}`);
      }
      return res.json();
    } catch (e) {
      lastErr = e;
      const wait = 400 * 2 ** attempt;
      process.stderr.write(
        `Retry ${attempt}/${maxAttempts} after error (${e.message}), waiting ${wait}ms\n`
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}

function iscoFromOccupation(doc) {
  const code = doc.code;
  if (code && /^\d/.test(String(code))) {
    const m = String(code).match(/^(\d{4})/);
    if (m) {
      return m[1];
    }
  }
  const links = doc._links?.broaderIscoGroup;
  if (Array.isArray(links) && links[0]?.code) {
    return String(links[0].code).replace(/\D/g, "").slice(0, 4);
  }
  return null;
}

function descEn(doc) {
  const d = doc.description?.en;
  if (d && typeof d.literal === "string") {
    return d.literal;
  }
  return doc.description?.["en-us"]?.literal || "";
}

function skillTypeLabel(skillDoc) {
  const st = skillDoc._links?.hasSkillType;
  const id = Array.isArray(st) ? st[0]?.uri || st[0]?.href : st?.uri || st?.href;
  if (!id) {
    return "competence";
  }
  if (String(id).includes("skill-type/knowledge")) {
    return "knowledge";
  }
  return "competence";
}

async function fetchSkillSummaries(occupationDoc, limitEssential, limitOptional) {
  const ess = occupationDoc._links?.hasEssentialSkill;
  const opt = occupationDoc._links?.hasOptionalSkill;
  const essList = Array.isArray(ess) ? ess : ess ? [ess] : [];
  const optList = Array.isArray(opt) ? opt : opt ? [opt] : [];

  const out = [];
  let n = 0;
  for (const link of essList) {
    if (n >= limitEssential) {
      break;
    }
    const href = link.href;
    const sdoc = await fetchJson(href);
    await sleep(200);
    out.push({
      title: sdoc.title,
      skill_type: skillTypeLabel(sdoc)
    });
    n += 1;
  }
  n = 0;
  for (const link of optList) {
    if (n >= limitOptional) {
      break;
    }
    const href = link.href;
    const sdoc = await fetchJson(href);
    await sleep(200);
    out.push({
      title: sdoc.title,
      skill_type: skillTypeLabel(sdoc)
    });
    n += 1;
  }
  return out;
}

async function searchOccupationUri(text) {
  const u = new URL(`${ESCO_BASE}/search`);
  u.searchParams.set("text", text);
  u.searchParams.set("type", "occupation");
  u.searchParams.set("language", "en");
  u.searchParams.set("limit", "8");
  const j = await fetchJson(u.toString());
  const hit = j?._embedded?.results?.[0];
  if (!hit?.uri) {
    throw new Error(`No occupation search hit for: ${text}`);
  }
  return hit.uri;
}

async function fetchOccupation(uri) {
  const u = new URL(`${ESCO_BASE}/resource/occupation`);
  u.searchParams.set("uri", uri);
  u.searchParams.set("language", "en");
  return fetchJson(u.toString());
}

async function main() {
  const occupations = [];
  for (const row of SEARCHES) {
    process.stderr.write(`ESCO: ${row.theme} …\n`);
    const uri = await searchOccupationUri(row.text);
    await sleep(250);
    const doc = await fetchOccupation(uri);
    await sleep(250);
    const skills = await fetchSkillSummaries(doc, 12, 6);
    occupations.push({
      theme: row.theme,
      search_text_used: row.text,
      uri: doc.uri,
      title: doc.title,
      isco_code: iscoFromOccupation(doc),
      description: descEn(doc),
      skills
    });
    await sleep(400);
  }

  const outDir = path.join(__dirname, "..", "data", "taxonomy");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "esco-occupations.json");
  const payload = {
    source: "ESCO API v1",
    api_base: ESCO_BASE,
    fetched_at: new Date().toISOString(),
    occupations
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  process.stderr.write(`Wrote ${outPath}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
