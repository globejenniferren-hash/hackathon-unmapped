import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { fetchResource } from "@/lib/api";
import { readinessSearchSchema, getCity, cityRiskShift } from "@/lib/readiness";

type ReadinessSearch = z.infer<typeof readinessSearchSchema>;

type GapData = {
  missedIncome: {
    currentMonthly: string;
    potentialMonthly: string;
    gapMonthly: string;
    annualGap: string;
    reasoning: string[];
    missedOpenings: { title: string; monthly: string; distance: string; openSince: string }[];
  };
};

export const Route = createFileRoute("/readiness/gap")({
  component: GapPage,
});

function GapPage() {
  const search = Route.useSearch() as ReadinessSearch;
  const city = getCity(search.city);
  const [data, setData] = useState<GapData | null>(null);

  useEffect(() => {
    fetchResource<GapData>("passport").then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <div className="text-center py-12 text-graphite-light text-sm">Loading…</div>;
  const m = data.missedIncome;

  // Lower connectivity = fewer realized openings nearby
  const shift = cityRiskShift(city.connectivity);
  const realizedFactor = Math.max(0.4, 1 - shift * 1.6);
  const adjustedOpenings = data.missedIncome.missedOpenings.slice(
    0,
    Math.max(1, Math.round(data.missedIncome.missedOpenings.length * realizedFactor)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl text-graphite leading-tight">Missed Income</h1>
        <p className="text-sm text-graphite-light italic mt-1">
          what you could already be earning, today
        </p>
      </div>

      {/* Hero gap */}
      <div className="bg-terracotta/10 border-2 border-terracotta/40 rounded-2xl p-6 text-center sticker-tape">
        <p className="font-hand text-base text-terracotta">monthly gap</p>
        <p className="font-serif text-5xl text-terracotta tabular-nums leading-none mt-1">
          {m.gapMonthly}
        </p>
        <p className="font-mono-label text-[10px] tracking-wider text-graphite-light mt-3">
          {m.annualGap} per year, left on the table in {city.label}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-dashed border-terracotta/30 text-left">
          <div>
            <p className="font-mono-label text-[9px] tracking-wider text-graphite-light uppercase">
              You earn now
            </p>
            <p className="font-serif text-lg text-graphite tabular-nums">{m.currentMonthly}</p>
          </div>
          <div>
            <p className="font-mono-label text-[9px] tracking-wider text-graphite-light uppercase">
              You could earn
            </p>
            <p className="font-serif text-lg text-moss tabular-nums">{m.potentialMonthly}</p>
          </div>
        </div>
      </div>

      {/* Why */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl text-graphite">Why this gap exists</h2>
        <ul className="space-y-2">
          {m.reasoning.map((r, i) => (
            <li key={i} className="flex gap-3 bg-card sticker p-3">
              <span className="font-serif italic text-terracotta text-lg leading-none">
                {i + 1}.
              </span>
              <p className="text-xs text-graphite leading-relaxed">{r}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Openings */}
      <section className="space-y-3">
        <div>
          <p className="font-hand text-base text-terracotta">open right now near you 📍</p>
          <h2 className="font-serif text-xl text-graphite">Jobs that fit your skills today</h2>
        </div>
        <div className="space-y-2">
          {adjustedOpenings.map((o, i) => (
            <div key={i} className="bg-card sticker p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-serif text-base text-graphite leading-tight">{o.title}</p>
                <p className="text-[11px] text-graphite-light">
                  {o.distance} away · open {o.openSince}
                </p>
              </div>
              <p className="font-serif text-base text-moss tabular-nums whitespace-nowrap">
                {o.monthly}
              </p>
            </div>
          ))}
          {adjustedOpenings.length < data.missedIncome.missedOpenings.length && (
            <p className="text-[11px] text-graphite-light italic px-1">
              Fewer openings show up in {city.label} due to{" "}
              {Math.round(city.connectivity * 100)}% connectivity. Same skills, thinner local market.
            </p>
          )}
        </div>
      </section>

      <NextLink to="/readiness/forward" label="Next: small steps to bigger work →" />
    </div>
  );
}

function NextLink({ to, label }: { to: "/readiness/forward"; label: string }) {
  return (
    <Link
      to={to}
      search={(prev: ReadinessSearch) => prev}
      className="block w-full text-center py-3 rounded-full bg-terracotta text-paper font-semibold text-sm hover:bg-terracotta/90 transition-colors"
    >
      {label}
    </Link>
  );
}
