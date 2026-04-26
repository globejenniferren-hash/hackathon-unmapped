import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { fetchResource } from "@/lib/api";
import { readinessSearchSchema, getCity } from "@/lib/readiness";

type ReadinessSearch = z.infer<typeof readinessSearchSchema>;

type ForwardPath = {
  id: string;
  addSkill: string;
  viaProgram: string;
  unlocks: string[];
  incomeLift: string;
  timeToReady: string;
  difficulty: "easy" | "moderate" | "hard";
};
type ForwardData = { forwardPaths: ForwardPath[] };

export const Route = createFileRoute("/readiness/forward")({
  component: ForwardPage,
});

const difficultyMap = {
  easy: { label: "Easy lift", color: "bg-moss/15 text-moss" },
  moderate: { label: "Moderate", color: "bg-ochre/20 text-ochre-foreground" },
  hard: { label: "Stretch", color: "bg-terracotta/15 text-terracotta" },
} as const;

function ForwardPage() {
  const search = Route.useSearch() as ReadinessSearch;
  const city = getCity(search.city);
  const [data, setData] = useState<ForwardData | null>(null);

  useEffect(() => {
    fetchResource<ForwardData>("passport").then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <div className="text-center py-12 text-graphite-light text-sm">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl text-graphite leading-tight">Looking Forward</h1>
        <p className="text-sm text-graphite-light italic mt-1">
          add one skill, unlock new work in {city.label}
        </p>
      </div>

      <div className="space-y-4">
        {data.forwardPaths.map((p, i) => {
          const d = difficultyMap[p.difficulty];
          return (
            <div
              key={p.id}
              className={`sticker p-5 space-y-3 ${
                i === 0 ? "bg-moss/10 border-2 border-moss/40 sticker-tape" : "bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-hand text-sm text-terracotta">if you add ↓</p>
                  <h2 className="font-serif text-xl text-graphite leading-tight">{p.addSkill}</h2>
                  <p className="text-[11px] text-graphite-light italic mt-1">via {p.viaProgram}</p>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${d.color}`}
                >
                  {d.label}
                </span>
              </div>

              <div className="border-t border-dashed border-ink-bleed pt-3">
                <p className="font-mono-label text-[9px] tracking-wider text-graphite-light uppercase mb-2">
                  unlocks
                </p>
                <ul className="space-y-1.5">
                  {p.unlocks.map((u, j) => (
                    <li key={j} className="text-sm text-graphite flex gap-2">
                      <span className="text-moss">→</span>
                      <span>{u}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-dashed border-ink-bleed">
                <Stat label="Income lift" value={p.incomeLift} color="text-moss" />
                <Stat label="Time" value={p.timeToReady} />
              </div>
            </div>
          );
        })}
      </div>

      <NextLink to="/readiness/weather" label="Next: resilience check →" />
    </div>
  );
}

function Stat({ label, value, color = "text-graphite" }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="font-mono-label text-[9px] tracking-wider text-graphite-light uppercase">
        {label}
      </p>
      <p className={`font-serif text-base ${color} tabular-nums`}>{value}</p>
    </div>
  );
}

function NextLink({ to, label }: { to: "/readiness/weather"; label: string }) {
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
