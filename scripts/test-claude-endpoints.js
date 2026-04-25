#!/usr/bin/env node
/**
 * Integration tests for /api/skills/extract, /api/risk/score, /api/data-intake/analyze.
 * Starts server.js on TEST_PORT (default 9876), runs requests, prints JSON snippets, stops server.
 *
 * Usage:
 *   USE_MOCK_API=true node scripts/test-claude-endpoints.js
 *   USE_MOCK_API=false node scripts/test-claude-endpoints.js   # requires ANTHROPIC_API_KEY in .env.local
 */

const { spawn } = require("child_process");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const ROOT = path.join(__dirname, "..");
const PORT = process.env.TEST_PORT || "9876";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/demo/user`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error(`Server did not become ready on port ${PORT}`);
}

async function main() {
  const useMock = (process.env.USE_MOCK_API || "true").toLowerCase() !== "false";
  const proc = spawn("node", [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT,
      USE_MOCK_API: useMock ? "true" : "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  proc.stderr.on("data", (d) => process.stderr.write(d));
  proc.stdout.on("data", (d) => process.stdout.write(d));

  try {
    await waitForServer();
  } catch (e) {
    proc.kill("SIGKILL");
    throw e;
  }

  const base = `http://127.0.0.1:${PORT}`;

  async function post(p, body) {
    const r = await fetch(base + p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _parse_error: true, raw: text.slice(0, 500) };
    }
    return { status: r.status, json };
  }

  console.log("\n========== SKILL /api/skills/extract ==========\n");
  const skillCases = [
    { label: "Bahasa Indonesia mixed informal", transcript: "Saya driver Grab, edit video buat UMKM, kadang service HP" },
    { label: "English fish + sew", transcript: "I sell fish at the morning market and sew clothes for neighbors" },
    { label: "minimal", transcript: "Grab driver" },
    { label: "empty", transcript: "" }
  ];

  for (const c of skillCases) {
    const { status, json } = await post("/api/skills/extract", { transcript: c.transcript });
    console.log(`\n--- ${c.label} (HTTP ${status}) ---\n`);
    console.log(JSON.stringify(json, null, 2));
  }

  console.log("\n\n========== RISK /api/risk/score ==========\n");
  const skillsPayload = [
    { name: "Grab-style driving", isco_code: "8322" },
    { name: "Retail sales floor", isco_code: "5223" }
  ];
  const riskRes = await post("/api/risk/score", { skills: skillsPayload });
  console.log(`HTTP ${riskRes.status}\n`);
  console.log(JSON.stringify(riskRes.json, null, 2).slice(0, 12000));

  console.log("\n\n========== DATA INTAKE /api/data-intake/analyze ==========\n");
  const rawText =
    "Pada Agustus 2024, penduduk yang bekerja di Sulawesi Selatan sebanyak 4,21 juta orang. Sektor pertanian menyerap 1,61 juta (38,2 persen), perdagangan 787 ribu (18,7 persen), industri pengolahan 375 ribu (8,9 persen). Tingkat pengangguran terbuka 5,31 persen. Rata-rata upah buruh Rp 3,2 juta per bulan. Penetrasi internet di provinsi ini mencapai 72 persen.";
  const intakeRes = await post("/api/data-intake/analyze", { fileName: "", rawText });
  console.log(`HTTP ${intakeRes.status}\n`);
  console.log(JSON.stringify(intakeRes.json, null, 2).slice(0, 12000));

  proc.kill("SIGTERM");
  await sleep(400);
  try {
    proc.kill("SIGKILL");
  } catch {
    /* ignore */
  }

  console.log(
    `\nDone (USE_MOCK_API=${useMock ? "true" : "false"}, model=${process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"}).\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
