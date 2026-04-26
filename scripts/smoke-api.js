#!/usr/bin/env node

const base = process.env.API_BASE_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, options);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function missingKeys(payload, keys) {
  if (!payload || typeof payload !== "object") return keys;
  return keys.filter((k) => !(k in payload));
}

const checks = [
  { method: "GET", path: "/api/demo/user", keys: ["userId", "countryCode", "displayName"] },
  {
    method: "GET",
    path: "/api/dashboard/province-risk",
    keys: ["nationalBaseline", "provinces"],
  },
  {
    method: "GET",
    path: "/api/dashboard/interventions",
    keys: ["countryCode", "provinceCode", "interventions"],
  },
  { method: "GET", path: "/api/profile", keys: ["name", "city", "country", "sponsor"] },
  { method: "GET", path: "/api/passport", keys: ["profile", "education", "skills"] },
  { method: "GET", path: "/api/dashboard/provinces", keys: ["country", "provinces", "countries"] },
  { method: "GET", path: "/api/dashboard/interventions-legacy", keys: ["interventions"] },
  {
    method: "POST",
    path: "/api/skills/extract",
    body: { transcript: "I drive and do phone repair" },
    keys: ["skills", "extractedSkills"],
  },
  {
    method: "POST",
    path: "/api/risk/score",
    body: { skills: [{ name: "driving", confidence: 0.8 }] },
    keys: ["overallRiskScore", "recommendedPathways"],
  },
  {
    method: "POST",
    path: "/api/data-intake/analyze",
    body: { fileName: "telecom_regulator_connectivity_2026.pdf" },
    keys: ["analysisId", "proposedUpdates", "proposedCount"],
  },
];

let failures = 0;

for (const check of checks) {
  const options =
    check.method === "POST"
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(check.body ?? {}),
        }
      : { method: "GET" };

  try {
    const { status, json } = await request(check.path, options);
    const missing = missingKeys(json, check.keys);
    const pass = status === 200 && missing.length === 0;
    if (!pass) failures += 1;
    const detail = pass ? "PASS" : `FAIL (status=${status}, missing=${missing.join(",") || "none"})`;
    console.log(`${check.method} ${check.path} -> ${detail}`);
  } catch (error) {
    failures += 1;
    console.log(`${check.method} ${check.path} -> FAIL (${error instanceof Error ? error.message : String(error)})`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
  console.log(`\nSmoke checks failed: ${failures}`);
} else {
  console.log("\nSmoke checks passed.");
}
