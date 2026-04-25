/**
 * Fetches World Bank WDI series for selected countries and writes
 * data/worldbank/{ISO3}.json — run manually; demo reads committed files only.
 *
 * Usage: node scripts/fetch-worldbank-data.js
 */

const fs = require("fs");
const path = require("path");

const DATE_RANGE = "2015:2024";
const PER_PAGE = 100;

/** WDI code -> stable key in output `indicators` */
const INDICATOR_MAP = {
  SL_SRV_EMPL_ZS: { wdi: "SL.SRV.EMPL.ZS", key: "employment_services_pct" },
  SL_AGR_EMPL_ZS: { wdi: "SL.AGR.EMPL.ZS", key: "employment_agriculture_pct" },
  SL_IND_EMPL_ZS: { wdi: "SL.IND.EMPL.ZS", key: "employment_industry_pct" },
  SL_UEM_TOTL_ZS: { wdi: "SL.UEM.TOTL.ZS", key: "unemployment_rate" },
  SL_UEM_1524_ZS: { wdi: "SL.UEM.1524.ZS", key: "youth_unemployment_rate" },
  SL_UEM_NEET_ZS: { wdi: "SL.UEM.NEET.ZS", key: "youth_neet_rate" },
  NY_GDP_PCAP_CD: { wdi: "NY.GDP.PCAP.CD", key: "gdp_per_capita_usd" },
  IT_NET_USER_ZS: { wdi: "IT.NET.USER.ZS", key: "internet_users_pct" },
  IT_CEL_SETS_P2: { wdi: "IT.CEL.SETS.P2", key: "mobile_cellular_subscriptions_per_100" },
  HD_HCI_OVRL: { wdi: "HD.HCI.OVRL", key: "human_capital_index" },
  SL_TLF_CACT_ZS: { wdi: "SL.TLF.CACT.ZS", key: "labor_force_participation_rate" },
  SL_ISV_IFRM_ZS: { wdi: "SL.ISV.IFRM.ZS", key: "informal_employment_pct" }
};

const COUNTRIES = [
  { country_code: "IDN", country: "Indonesia" },
  { country_code: "GHA", country: "Ghana" },
  { country_code: "IND", country: "India" }
];

function wbUrl(countryIso3, indicatorCode) {
  return (
    "https://api.worldbank.org/v2/country/" +
    countryIso3 +
    "/indicator/" +
    indicatorCode +
    "?format=json&date=" +
    DATE_RANGE +
    "&per_page=" +
    PER_PAGE
  );
}

async function fetchJson(url) {
  const timeoutMs = 30000;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

/**
 * World Bank returns [meta, rows]. Each row: { value, date, indicator: { id }, ... }
 */
function rowsToYearMap(rows) {
  const byYear = {};
  if (!Array.isArray(rows)) {
    return byYear;
  }
  for (const row of rows) {
    if (row.value === null || row.value === undefined || row.value === "") {
      continue;
    }
    const y = String(row.date);
    const n = Number(row.value);
    if (!Number.isFinite(n)) {
      continue;
    }
    byYear[y] = n;
  }
  return byYear;
}

function latestNonNull(yearMap) {
  const years = Object.keys(yearMap).sort((a, b) => Number(b) - Number(a));
  for (const y of years) {
    const v = yearMap[y];
    if (v !== undefined && v !== null && Number.isFinite(v)) {
      return { year: y, value: v };
    }
  }
  return null;
}

async function fetchCountry(countryIso3) {
  const indicators = {};
  const wdiSeries = {};

  for (const { wdi, key } of Object.values(INDICATOR_MAP)) {
    const url = wbUrl(countryIso3, wdi);
    const body = await fetchJson(url);
    const rows = body[1];
    const yearMap = rowsToYearMap(rows);
    indicators[key] = yearMap;
    wdiSeries[wdi] = yearMap;
    await new Promise((r) => setTimeout(r, 80));
  }

  return { indicators, wdiSeries };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const outDir = path.join(__dirname, "..", "data", "worldbank");
  ensureDir(outDir);
  const fetchedAt = new Date().toISOString();

  for (const { country_code, country } of COUNTRIES) {
    process.stderr.write(`Fetching ${country} (${country_code})...\n`);
    const { indicators } = await fetchCountry(country_code);
    const payload = {
      country,
      country_code,
      indicators,
      fetched_at: fetchedAt,
      source: "World Bank WDI API",
      indicator_codes: Object.fromEntries(
        Object.values(INDICATOR_MAP).map(({ wdi, key }) => [key, wdi])
      )
    };
    const file = path.join(outDir, `${country_code}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
    process.stderr.write(`Wrote ${file}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
