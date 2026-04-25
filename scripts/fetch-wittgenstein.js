/**
 * Downloads Wittgenstein Centre WIC batch RDS (SSP2 scenario = 2) and runs R to
 * produce data/projections/wittgenstein.json. No runtime API calls in demo.
 *
 * Requires: R + jsonlite
 *
 * Usage: node scripts/fetch-wittgenstein.js
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RDS_URL =
  "https://wicshiny2023.iiasa.ac.at/wcde-data/wcde-v3-batch/2/pop-age-edattain.rds";

async function main() {
  const root = path.join(__dirname, "..");
  const tmpRds = path.join(root, "data", "projections", ".pop-age-edattain.rds");
  const outJson = path.join(root, "data", "projections", "wittgenstein.json");
  const rScript = path.join(__dirname, "extract-wittgenstein.R");

  fs.mkdirSync(path.dirname(tmpRds), { recursive: true });

  process.stderr.write(`Downloading ${RDS_URL}\n`);
  const res = await fetch(RDS_URL, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) {
    throw new Error(`Download failed HTTP ${res.status}`);
  }
  fs.writeFileSync(tmpRds, Buffer.from(await res.arrayBuffer()));

  process.stderr.write(`Running Rscript ${rScript}\n`);
  execFileSync("Rscript", [rScript, tmpRds, outJson], { stdio: "inherit" });
  fs.unlinkSync(tmpRds);
  process.stderr.write(`Wrote ${outJson}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
