import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { fetchResource } from "@/lib/api";
import { RiskBadge, type Risk } from "@/components/RiskBadge";
import { readinessSearchSchema, getCity } from "@/lib/readiness";
import { readConversationSkills } from "@/lib/conversationSkills";

type ReadinessSearch = z.infer<typeof readinessSearchSchema>;

type Skill = {
  id: string;
  name: string;
  translation?: string;
  icon: string;
  wage: string;
  growthLabel: string;
  growthDelta: number;
  baseScore: number;
  byYear: Record<number, number>;
};
type RiskResponse = {
  risks?: Array<{
    skill?: string;
    isco_code?: string;
    level?: "durable" | "at_risk" | "declining";
    calibrated_score?: number;
    avg_earnings_trend?: string;
    sector_growth?: string;
    displacement_by_year?: Record<string, number>;
  }>;
  data_sources?: string[];
};
type WeatherData = { skills: Array<{ id: string; name: string; icon?: string; automationExposure?: number; wage?: string; sectorGrowth?: number }> };

export const Route = createFileRoute("/readiness/weather")({
  component: WeatherPage,
});

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031];

function buildInterpolatedYearSeries(
  displacementByYear: Record<string, number> | undefined,
  calibratedScore: number
): Record<number, number> {
  const explicit: Array<{ year: number; value: number }> = Object.entries(displacementByYear || {})
    .map(([k, v]) => ({ year: Number(k), value: Number(v) }))
    .filter((x) => Number.isFinite(x.year) && Number.isFinite(x.value))
    .sort((a, b) => a.year - b.year);

  const points = explicit.length
    ? explicit
    : [{ year: 2026, value: calibratedScore }, { year: 2031, value: calibratedScore }];

  const first = points[0];
  const last = points[points.length - 1];
  const series: Record<number, number> = {};

  for (const y of YEARS) {
    if (y <= first.year) {
      series[y] = first.value;
      continue;
    }
    if (y >= last.year) {
      series[y] = last.value;
      continue;
    }
    const exact = points.find((p) => p.year === y);
    if (exact) {
      series[y] = exact.value;
      continue;
    }
    let left = first;
    let right = last;
    for (let i = 0; i < points.length - 1; i += 1) {
      if (points[i].year <= y && y <= points[i + 1].year) {
        left = points[i];
        right = points[i + 1];
        break;
      }
    }
    const span = right.year - left.year || 1;
    const t = (y - left.year) / span;
    series[y] = left.value + (right.value - left.value) * t;
  }

  return series;
}

function parseWageDisplay(raw: string): string {
  const text = String(raw || "");
  if (!text.trim()) return "Rp —/mo";
  const rpMonthly = text.match(/Rp\s*([\d.,]+)\s*([MK])?\/mo/i);
  if (rpMonthly) {
    const amount = rpMonthly[1];
    const unit = (rpMonthly[2] || "").toUpperCase();
    return `Rp ${amount}${unit}/mo`;
  }
  const usdAnnual = text.match(/USD\s*([\d,]+)\s*\/yr/i);
  if (usdAnnual) {
    const annual = Number(usdAnnual[1].replace(/,/g, ""));
    if (Number.isFinite(annual) && annual > 0) {
      // Convert annual USD reference to monthly IDR display for local readability.
      const usdToIdr = 16000;
      const pppFactor = 0.095;
      const monthlyIdr = (annual * pppFactor * usdToIdr) / 12;
      const inMillions = monthlyIdr / 1_000_000;
      return `Rp ${inMillions.toFixed(1)}M/mo`;
    }
  }
  const usdMonthly = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*\/mo/i);
  if (usdMonthly) {
    const monthlyUsd = Number(usdMonthly[1].replace(/,/g, ""));
    if (Number.isFinite(monthlyUsd) && monthlyUsd > 0) {
      const usdToIdr = 16000;
      const monthlyIdr = monthlyUsd * usdToIdr;
      const inMillions = monthlyIdr / 1_000_000;
      return `Rp ${inMillions.toFixed(1)}M/mo`;
    }
  }
  return "Rp —/mo";
}

function parseGrowthDisplay(raw: string): { label: string; delta: number } {
  const text = String(raw || "");
  if (!text.trim()) return { label: "0.0%", delta: 0 };
  const pp = text.match(/([+-]?\d+(?:\.\d+)?)\s*pp/i);
  if (pp) {
    const delta = Number(pp[1]);
    if (Number.isFinite(delta)) {
      return { label: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`, delta };
    }
  }
  const pct = text.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    const delta = Number(pct[1]);
    if (Number.isFinite(delta)) {
      return { label: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`, delta };
    }
  }
  return { label: "0.0%", delta: 0 };
}

function WeatherPage() {
  const search = Route.useSearch() as ReadinessSearch;
  const city = getCity(search.city);
  const [data, setData] = useState<Skill[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [year, setYear] = useState(2026);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const extracted = readConversationSkills();
        const skillsPayload = extracted.map((s) => ({
          name: s.name,
          ...(s.isco_code ? { isco_code: s.isco_code } : {}),
        }));
        const response = await fetch("/api/risk/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skills: skillsPayload,
            city: city.label,
            country: "Indonesia",
          }),
        });
        if (!response.ok) throw new Error(`risk_score_${response.status}`);
        const riskData = (await response.json()) as RiskResponse;
        const rows = Array.isArray(riskData.risks) ? riskData.risks : [];
        if (!rows.length) throw new Error("risk_rows_missing");
        const mapped = rows.map((r, idx) => {
          const baseScore = Number(r.calibrated_score ?? 0);
          const byYear = buildInterpolatedYearSeries(r.displacement_by_year, baseScore);
          const growth = parseGrowthDisplay(String(r.sector_growth || ""));
          return {
            id: `${r.isco_code || "risk"}_${idx}`,
            name: String(r.skill || "Unnamed skill"),
            translation: String(r.isco_code || ""),
            icon: "🧠",
            wage: parseWageDisplay(String(r.avg_earnings_trend || "")),
            growthLabel: growth.label,
            growthDelta: growth.delta,
            baseScore: baseScore || byYear[2026] || 0,
            byYear,
          } satisfies Skill;
        });
        if (!active) return;
        setData(mapped);
        setSources(
          Array.isArray(riskData.data_sources) && riskData.data_sources.length
            ? riskData.data_sources.map((s) => String(s))
            : ["Frey & Osborne (2017)", "World Bank WDI", "ITU"]
        );
      } catch {
        const [fallbackRisk, passport] = await Promise.all([
          fetch("/mock/riskPathwayResponse.json").then((r) => r.json()) as Promise<any>,
          fetchResource<WeatherData>("passport"),
        ]);
        if (!active) return;
        const overallByYear = fallbackRisk?.riskByYear ?? {};
        const fallbackSkills = (passport?.skills ?? []).map((s, idx) => {
          const byYear: Record<number, number> = {};
          for (const y of YEARS) {
            const yearly = Number(overallByYear?.[String(y)]?.overall);
            byYear[y] = Number.isFinite(yearly)
              ? yearly
              : Number(s.automationExposure ?? 0.45);
          }
          return {
            id: s.id || `fallback_${idx}`,
            name: s.name,
            translation: "",
            icon: s.icon || "🧠",
            wage: s.wage || "Rp —",
            growthLabel: `${s.sectorGrowth && s.sectorGrowth > 0 ? "+" : ""}${s.sectorGrowth ?? 0}%`,
            growthDelta: Number(s.sectorGrowth ?? 0),
            baseScore: Number(s.automationExposure ?? byYear[2026] ?? 0),
            byYear,
          } satisfies Skill;
        });
        setData(fallbackSkills);
        setSources(["Frey & Osborne (2017)", "World Bank WDI", "ITU"]);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [city.id, city.label]);

  const driftedSkills = useMemo(() => {
    return data.map((s) => {
      const score = Number(s.byYear[year] ?? s.baseScore ?? 0);
      let drifted: Risk = "durable";
      if (score > 0.55) drifted = "declining";
      else if (score >= 0.3) drifted = "at-risk";
      return { ...s, drifted, projectedExposure: score };
    });
  }, [data, year]);

  const overall = driftedSkills.length
    ? Math.round(
        (driftedSkills.reduce((sum, s) => sum + s.projectedExposure, 0) / driftedSkills.length) *
          100,
      )
    : 0;

  const durableCount = driftedSkills.filter((s) => s.drifted === "durable").length;
  const atRiskCount = driftedSkills.filter((s) => s.drifted === "at-risk").length;
  const decliningCount = driftedSkills.filter((s) => s.drifted === "declining").length;

  if (!data.length) return <div className="text-center py-12 text-graphite-light text-sm">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl text-graphite leading-tight">Resilience Check</h1>
        <p className="text-sm text-graphite-light italic mt-1">
          honest read on what holds and what shifts
        </p>
      </div>

      {/* Headline */}
      <div className="bg-sky/10 border-2 border-sky/30 rounded-2xl p-5">
        <p className="font-hand text-base" style={{ color: "var(--sky)" }}>
          🛡️ resilience reading for {city.label}, {year}
        </p>
        <div className="flex items-baseline gap-3 mt-2">
          <p className="font-serif text-5xl text-terracotta tabular-nums leading-none">
            {overall}%
          </p>
          <p className="text-xs text-graphite-light">overall AI automation risk</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-dashed border-sky/30 text-center">
          <Pill emoji="🌱" label="durable" count={durableCount} color="text-moss" />
          <Pill emoji="⚠️" label="at risk" count={atRiskCount} color="text-terracotta" />
          <Pill emoji="🍂" label="declining" count={decliningCount} color="text-graphite-light" />
        </div>
      </div>

      {/* Year slider */}
      <div className="bg-card sticker p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-hand text-base text-graphite">drag through time →</p>
          <p className="font-serif text-3xl text-terracotta tabular-nums leading-none">{year}</p>
        </div>
        <input
          type="range"
          min={2026}
          max={2031}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="journal-slider w-full"
        />
        <div className="flex justify-between text-[10px] text-graphite-light font-semibold">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={year === y ? "text-terracotta font-bold" : ""}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Skills */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl text-graphite">Your skills in {year}</h2>
        <div className="space-y-3">
          {driftedSkills.map((s) => (
            <div key={s.id} className="bg-card sticker p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex gap-2 items-start">
                  <span className="text-xl">{s.icon}</span>
                  <div>
                    <h3 className="font-serif text-base leading-tight text-graphite">{s.name}</h3>
                    {s.translation ? (
                      <p className="text-[11px] text-graphite-light">ISCO: {s.translation}</p>
                    ) : null}
                  </div>
                </div>
                <RiskBadge risk={s.drifted} />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-dashed border-ink-bleed">
                <Stat label="Wage" value={s.wage} />
                <Stat
                  label="Growth"
                  value={s.growthLabel}
                  color={s.growthDelta >= 0 ? "text-moss" : "text-terracotta"}
                />
                <Stat label="AI risk" value={`${Math.round(s.projectedExposure * 100)}%`} />
              </div>
              <div className="mt-3 h-1.5 bg-muted rounded-full relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-ochre to-terracotta transition-all duration-500 rounded-full"
                  style={{ width: `${s.projectedExposure * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="text-[11px] text-graphite-light">
        <button className="underline" onClick={() => setShowSources((v) => !v)}>
          {showSources ? "Hide sources" : "Sources"}
        </button>
        {showSources ? <p className="mt-1">Frey-Osborne (2017), {sources.join(", ")}</p> : null}
      </div>

      <Link
        to="/readiness/forward"
        search={(prev: ReadinessSearch) => prev}
        className="block w-full text-center py-3 rounded-full border-2 border-terracotta text-terracotta font-semibold text-sm hover:bg-terracotta hover:text-paper transition-colors"
      >
        See how to add resilient skills →
      </Link>
    </div>
  );
}

function Pill({ emoji, label, count, color }: { emoji: string; label: string; count: number; color: string }) {
  return (
    <div>
      <p className="text-lg leading-none">{emoji}</p>
      <p className={`font-serif text-xl tabular-nums ${color}`}>{count}</p>
      <p className="text-[9px] uppercase tracking-wider text-graphite-light font-semibold">
        {label}
      </p>
    </div>
  );
}

function Stat({ label, value, color = "text-graphite" }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-graphite-light font-semibold">
        {label}
      </p>
      <p className={`text-sm font-bold ${color} tabular-nums`}>{value}</p>
    </div>
  );
}
