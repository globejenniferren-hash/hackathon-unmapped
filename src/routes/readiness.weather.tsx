import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { fetchResource } from "@/lib/api";
import { RiskBadge, type Risk } from "@/components/RiskBadge";
import { readinessSearchSchema, getCity, cityRiskShift } from "@/lib/readiness";

type ReadinessSearch = z.infer<typeof readinessSearchSchema>;

type Skill = {
  id: string;
  name: string;
  translation: string;
  icon: string;
  automationExposure: number;
  wage: string;
  sectorGrowth: number;
  risk: Risk;
};
type WeatherData = { skills: Skill[] };

export const Route = createFileRoute("/readiness/weather")({
  component: WeatherPage,
});

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031];

function WeatherPage() {
  const search = Route.useSearch() as ReadinessSearch;
  const city = getCity(search.city);
  const [data, setData] = useState<WeatherData | null>(null);
  const [year, setYear] = useState(2026);

  useEffect(() => {
    fetchResource<WeatherData>("passport").then(setData).catch(() => setData(null));
  }, []);

  const cityShift = cityRiskShift(city.connectivity);
  const yearOffset = (year - 2026) * 0.05;

  const driftedSkills = useMemo(() => {
    if (!data) return [];
    return data.skills.map((s) => {
      const exposure = Math.min(0.99, Math.max(0, s.automationExposure + yearOffset + cityShift));
      let drifted: Risk = "durable";
      if (exposure > 0.75) drifted = "declining";
      else if (exposure > 0.5) drifted = "at-risk";
      return { ...s, drifted, projectedExposure: exposure };
    });
  }, [data, yearOffset, cityShift]);

  const overall = driftedSkills.length
    ? Math.round(
        (driftedSkills.reduce((sum, s) => sum + s.projectedExposure, 0) / driftedSkills.length) *
          100,
      )
    : 0;

  const durableCount = driftedSkills.filter((s) => s.drifted === "durable").length;
  const atRiskCount = driftedSkills.filter((s) => s.drifted === "at-risk").length;
  const decliningCount = driftedSkills.filter((s) => s.drifted === "declining").length;

  if (!data) return <div className="text-center py-12 text-graphite-light text-sm">Loading…</div>;

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
                  </div>
                </div>
                <RiskBadge risk={s.drifted} />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-dashed border-ink-bleed">
                <Stat label="Wage" value={s.wage} />
                <Stat
                  label="Growth"
                  value={`${s.sectorGrowth > 0 ? "+" : ""}${s.sectorGrowth}%`}
                  color={s.sectorGrowth >= 0 ? "text-moss" : "text-terracotta"}
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
