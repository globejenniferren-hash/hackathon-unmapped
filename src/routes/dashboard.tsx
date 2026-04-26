import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { fetchResource } from "@/lib/api";

type Province = { id: string; name: string; risk2026: number; risk2031: number; population: number };
type Intervention = {
  id: string;
  name: string;
  jobsCreated: number;
  costPerPerson: string;
  resilience: number;
  duration: string;
};
type Country = { code: string; name: string; configured: boolean };
type ProvinceRiskResponse = {
  country: string;
  provinces: Province[];
  countries: Country[];
};
type InterventionResponse = {
  interventions: Intervention[];
};
type DashboardData = ProvinceRiskResponse & InterventionResponse;

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

type View = "world" | "country" | "province" | "config";

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [year, setYear] = useState(2026);
  const [view, setView] = useState<View>("country");
  const [selectedProvince, setSelectedProvince] = useState<Province | null>(null);
  const [budget, setBudget] = useState(50);

  useEffect(() => {
    Promise.all([
      fetchResource<ProvinceRiskResponse>("provinceRisk"),
      fetchResource<InterventionResponse>("intervention"),
    ])
      .then(([prov, inter]) => setData({ ...prov, ...inter }))
      .catch(() => setData(null));
  }, []);

  const t = (year - 2026) / 5;

  const provincesWithRisk = useMemo(() => {
    if (!data) return [];
    return data.provinces.map((p) => ({
      ...p,
      risk: p.risk2026 + (p.risk2031 - p.risk2026) * t,
    }));
  }, [data, t]);

  return (
    <MobileFrame>
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <p className="font-hand text-lg text-terracotta">the bigger picture 🗺️</p>
          <h1 className="font-serif text-3xl text-graphite leading-[1.1]">
            The terrain, <span className="italic squiggle">province by province</span>.
          </h1>
        </div>

        {/* View tabs */}
        <div className="flex gap-1.5 bg-card/60 rounded-full p-1 border border-ink-bleed">
          {([
            ["world", "🌏 World"],
            ["country", "🇮🇩 Indonesia"],
            ["config", "⚙️ Data"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => { setView(v); setSelectedProvince(null); }}
              className={`flex-1 px-2 py-2 rounded-full text-[11px] font-semibold transition-all ${
                view === v
                  ? "bg-terracotta text-paper shadow-sm"
                  : "text-graphite-light hover:text-graphite"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* WORLD */}
        {view === "world" && data && (
          <div className="space-y-3">
            <p className="text-sm text-graphite italic leading-relaxed">
              Tap a country to load its dataset. Operators upload their own.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {data.countries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => c.configured && setView("country")}
                  className={`p-4 rounded-2xl text-left transition-all ${
                    c.configured
                      ? "bg-card sticker hover:-translate-y-0.5"
                      : "border-2 border-dashed border-ink-bleed text-graphite-light"
                  }`}
                >
                  <p className="font-mono-label text-[9px] mb-1 text-graphite-light">{c.code}</p>
                  <p className="font-serif text-base text-graphite">{c.name}</p>
                  <p className={`text-[10px] mt-2 font-semibold ${c.configured ? "text-moss" : "text-graphite-light"}`}>
                    {c.configured ? "✓ ready" : "awaiting data"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CONFIG */}
        {view === "config" && (
          <div className="space-y-3">
            <p className="text-sm text-graphite italic leading-relaxed">
              Country operators upload national datasets to calibrate the model.
            </p>
            {[
              { label: "Labor Force Survey", file: "labor_force_survey_2024.csv", status: "✓ Loaded", emoji: "📊" },
              { label: "Sectoral Wage Data", file: "sectoral_wages_2024.json", status: "✓ Loaded", emoji: "💰" },
              { label: "Connectivity Index", file: "provincial_connectivity.csv", status: "✓ Loaded", emoji: "📡" },
              { label: "Training Programs Registry", file: "national_training_directory.json", status: "Pending", emoji: "🎓" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center bg-card sticker p-4">
                <div className="flex gap-3 items-center">
                  <span className="text-2xl">{row.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-graphite">{row.label}</p>
                    <p className="font-mono text-[10px] text-graphite-light">{row.file}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${row.status.startsWith("✓") ? "bg-moss/15 text-moss" : "bg-clay/15 text-clay"}`}>
                  {row.status}
                </span>
              </div>
            ))}
            <button className="w-full py-3 rounded-full border-2 border-dashed border-terracotta text-terracotta text-sm font-semibold hover:bg-terracotta hover:text-paper transition-colors">
              + Upload dataset
            </button>
          </div>
        )}

        {/* COUNTRY */}
        {view === "country" && data && (
          <>
            {/* Time slider */}
            <div className="bg-card sticker p-5 space-y-3">
              <div className="flex justify-between items-center">
                <p className="font-hand text-base text-graphite">drag through time →</p>
                <p className="font-serif text-3xl tabular-nums leading-none text-terracotta">{year}</p>
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
                <span>2026</span><span>2031</span>
              </div>
            </div>

            {/* Choropleth grid (province cells) */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-serif text-xl text-graphite">Provinces</h2>
                <Legend />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {provincesWithRisk.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProvince(p)}
                    className={`relative aspect-square p-2.5 text-left rounded-xl transition-all hover:scale-105 ${
                      selectedProvince?.id === p.id ? "ring-2 ring-terracotta ring-offset-2 ring-offset-paper" : ""
                    }`}
                    style={{ backgroundColor: riskColor(p.risk) }}
                  >
                    <p className="font-mono-label text-[8px] text-graphite/70">{p.id.slice(3)}</p>
                    <p className="font-serif text-[11px] leading-tight text-graphite line-clamp-2 mt-0.5 font-semibold">
                      {p.name}
                    </p>
                    <p className="absolute bottom-1.5 right-2 font-bold text-[11px] text-graphite tabular-nums">
                      {Math.round(p.risk * 100)}%
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Province detail */}
            {selectedProvince && (
              <div className="bg-card sticker p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-hand text-sm text-terracotta">{selectedProvince.id}</p>
                    <h3 className="font-serif text-2xl text-graphite">{selectedProvince.name}</h3>
                    <p className="text-xs text-graphite-light mt-1">
                      pop. {selectedProvince.population}M · risk{" "}
                      <span className="text-terracotta font-bold">
                        {Math.round((selectedProvince.risk2026 + (selectedProvince.risk2031 - selectedProvince.risk2026) * t) * 100)}%
                      </span>
                    </p>
                  </div>
                  <button onClick={() => setSelectedProvince(null)} className="size-8 rounded-full bg-muted text-graphite-light hover:bg-graphite hover:text-paper transition-colors">×</button>
                </div>

                {/* Budget */}
                <div className="space-y-2 pt-3 border-t border-dashed border-ink-bleed">
                  <div className="flex justify-between items-baseline">
                    <p className="font-hand text-base text-graphite">how much to invest?</p>
                    <p className="font-serif text-lg tabular-nums text-terracotta font-bold">${budget}M</p>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={5}
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="journal-slider w-full"
                  />
                </div>

                {/* Interventions ranked */}
                <div className="space-y-2 pt-3 border-t border-dashed border-ink-bleed">
                  <p className="font-hand text-base text-graphite">best options →</p>
                  {data.interventions
                    .map((i) => ({
                      ...i,
                      score: i.resilience * Math.log(i.jobsCreated * (budget / 50) + 1),
                      projectedJobs: Math.round(i.jobsCreated * (budget / 50)),
                    }))
                    .sort((a, b) => b.score - a.score)
                    .map((iv, idx) => (
                      <div key={iv.id} className={`flex gap-3 p-3 rounded-xl ${idx === 0 ? "bg-moss/10 border border-moss/30" : "bg-paper-warm/40"}`}>
                        <span className={`size-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${idx === 0 ? "bg-moss text-paper" : "bg-muted text-graphite-light"}`}>
                          {idx + 1}
                        </span>
                        <div className="flex-1">
                          <p className="font-serif text-sm leading-tight text-graphite font-semibold">{iv.name}</p>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[10px] text-graphite-light tabular-nums">
                            <span><b className="text-graphite">{iv.projectedJobs.toLocaleString()}</b> jobs</span>
                            <span>·</span>
                            <span>{iv.costPerPerson}/person</span>
                            <span>·</span>
                            <span className="text-moss font-bold">{Math.round(iv.resilience * 100)}% resilience</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MobileFrame>
  );
}

function riskColor(r: number) {
  // warm cream → ochre → terracotta → deep terracotta
  if (r < 0.4) return "oklch(0.92 0.05 85)";
  if (r < 0.55) return "oklch(0.84 0.1 75)";
  if (r < 0.7) return "oklch(0.76 0.13 55)";
  return "oklch(0.65 0.16 38)";
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5 text-[9px] font-semibold text-graphite-light">
      <span>low</span>
      <div className="flex rounded-full overflow-hidden">
        {[0.3, 0.5, 0.6, 0.75].map((r) => (
          <div key={r} className="w-3.5 h-3.5" style={{ backgroundColor: riskColor(r) }} />
        ))}
      </div>
      <span>high</span>
    </div>
  );
}
