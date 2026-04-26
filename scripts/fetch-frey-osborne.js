/**
 * Downloads Plotly mirror of Frey & Osborne job automation probabilities (CSV)
 * and writes data/automation/frey-osborne.json (committed; no runtime fetch in demo).
 *
 * Usage: node scripts/fetch-frey-osborne.js
 */

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const CSV_URL =
  "https://raw.githubusercontent.com/plotly/datasets/master/job-automation-probability.csv";

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "" && row[k] !== null) {
      return row[k];
    }
  }
  return null;
}

function normalizeSoc(code) {
  if (code == null) {
    return null;
  }
  const s = String(code).trim();
  return s.replace(/–/g, "-");
}

async function main() {
  const res = await fetch(CSV_URL, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    throw new Error(`Failed to download CSV: HTTP ${res.status}`);
  }
  const text = await res.text();
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  });

  const occupations = [];
  for (const row of rows) {
    const socRaw =
      pick(row, ["_ - code", "code", "SOC", "soc_code"]) ||
      Object.entries(row).find(([k]) => /code/i.test(k) && !/occupation/i.test(k))?.[1];
    const soc = normalizeSoc(socRaw);
    if (!soc || !/^\d{2}-\d{4}$/.test(soc)) {
      continue;
    }

    const probRaw = pick(row, ["probability", "prob"]);
    const automation_probability =
      probRaw != null ? Number(probRaw) : Number.NaN;
    if (!Number.isFinite(automation_probability)) {
      continue;
    }

    const wageRaw = pick(row, [
      "average_ann_wage",
      "Average annual wage",
      "avg_annual_wage"
    ]);
    const employedRaw = pick(row, [
      "numbEmployed",
      "employed_may2016",
      "employed"
    ]);

    occupations.push({
      soc_code: soc,
      occupation: String(pick(row, ["occupation", "Occupation"]) || "").trim(),
      automation_probability,
      avg_annual_wage:
        wageRaw != null && wageRaw !== "" ? Math.round(Number(wageRaw)) : null,
      education: String(pick(row, ["education", "Education"]) || "").trim(),
      employed:
        employedRaw != null && employedRaw !== ""
          ? Math.round(Number(employedRaw))
          : null
    });
  }

  const outDir = path.join(__dirname, "..", "data", "automation");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "frey-osborne.json");
  const payload = {
    source: "Frey & Osborne (2017), via Plotly datasets",
    csv_url: CSV_URL,
    total_occupations: occupations.length,
    fetched_at: new Date().toISOString(),
    occupations
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  process.stderr.write(`Wrote ${outPath} (${occupations.length} occupations)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
