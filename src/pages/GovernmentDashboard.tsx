import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardTopBar } from "../components/dashboard/DashboardTopBar";
import { MapCanvas, type ProvincialMetricKey } from "../components/dashboard/MapCanvas";
import { WorldMetricMap, type WorldMetricKey } from "../components/dashboard/WorldMetricMap";
import {
  computeAverageNationalRisk,
  computeHighestRiskProvince,
} from "../lib/dashboardMetrics";
import {
  buildDummySupplyForCountry,
  loadCountryConfig,
  loadDemandSignalsForCountry,
  loadInterventions,
  loadProvinceRisk,
  type SkillDemandSignal,
} from "../lib/loadDashboardData";
import type { BoundaryMockMatchDiagnostics } from "../lib/provinceNameMatch";
import type { InterventionResponse, ProvinceRiskResponse } from "../types/dashboard";
import "./GovernmentDashboard.css";

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" ? (v as AnyRecord) : null;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toDisplayNumber(v: number | null, digits = 1): string {
  return v == null ? "—" : v.toFixed(digits);
}

const NATIONAL_GAP_LEGEND = ["#fef3c7", "#fde68a", "#f59e0b", "#ea580c", "#b91c1c"] as const;
const NATIONAL_AI_LEGEND = ["#e6f2ef", "#bfded7", "#7fb4aa", "#3f8f82", "#1f6b62"] as const;

function estimatePolicyBudgetUsd(id: string, title: string): number {
  const seedText = `${id}:${title}`;
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const min = 2_500_000;
  const max = 24_000_000;
  const pct = (h >>> 0) / 4294967295;
  return Math.round(min + pct * (max - min));
}

function resolveDemandCountryIso3(config: unknown, risk: unknown): string {
  const cfg = asRecord(config);
  const wb = asRecord(cfg?.worldbank_indicators);
  const wbIso3 = wb?.worldbank_country_iso3;
  if (typeof wbIso3 === "string" && wbIso3.trim().length === 3) return wbIso3.trim().toUpperCase();
  const riskRec = asRecord(risk);
  const riskIso3 = riskRec?.countryIso3;
  if (typeof riskIso3 === "string" && riskIso3.trim().length === 3) return riskIso3.trim().toUpperCase();
  return "IDN";
}

export function GovernmentDashboard() {
  const [year, setYear] = useState(2026);
  const [risk, setRisk] = useState<ProvinceRiskResponse | null>(null);
  const [interventions, setInterventions] = useState<InterventionResponse | null>(null);
  const [configId] = useState<"indonesia" | "ghana">("indonesia");
  const [config, setConfig] = useState<Awaited<ReturnType<typeof loadCountryConfig>>["data"]>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [riskSource, setRiskSource] = useState<"mock" | "api">("mock");
  const [interventionsSource, setInterventionsSource] = useState<"mock" | "api">("mock");
  const [demandSource, setDemandSource] = useState<"mock" | "api">("mock");
  const [demandSignals, setDemandSignals] = useState<SkillDemandSignal[]>([]);
  const [boundaryMatchDiag, setBoundaryMatchDiag] = useState<BoundaryMockMatchDiagnostics | null>(null);
  const [worldMetric, setWorldMetric] = useState<WorldMetricKey>("gap");
  const [provincialMetric, setProvincialMetric] = useState<ProvincialMetricKey>("gap");

  const refetch = useCallback(async () => {
    setLoadState("loading");
    setErr(null);
    try {
      const [r, int, co] = await Promise.all([
        loadProvinceRisk(2026),
        loadInterventions(),
        loadCountryConfig(configId),
      ]);
      const demandIso3 = resolveDemandCountryIso3(co.data, r.data as unknown);
      const dem = await loadDemandSignalsForCountry(demandIso3);
      setRisk(r.data);
      setInterventions(int.data);
      setDemandSignals(dem.data);
      setRiskSource(r.source);
      setInterventionsSource(int.source);
      setDemandSource(dem.source);
      setConfig(co.data);
      if (co.error) setErr(co.error);
      setLoadState("ok");
      setSelectedId((cur) => {
        if (cur && r.data.provinces.some((p) => p.id === cur)) return cur;
        return r.data.provinces[0]?.id ?? null;
      });
    } catch (e) {
      setLoadState("err");
      setErr(e instanceof Error ? e.message : "Failed to load dashboard data");
    }
  }, [configId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const displayRisk = risk;
  const displayInterventions = interventions;

  const interMeta = displayInterventions?.meta ?? interventions?.meta ?? null;
  const recommendedActions = useMemo(() => {
    if (!displayInterventions) return [];
    const pool = Object.values(displayInterventions.byProvince).flatMap((p) => p.interventions ?? []);
    const uniq = new Map<string, { id: string; title: string; rank: number }>();
    for (const item of pool) {
      if (!uniq.has(item.id)) uniq.set(item.id, { id: item.id, title: item.title, rank: item.rank });
    }
    return [...uniq.values()].sort((a, b) => a.rank - b.rank).slice(0, 3);
  }, [displayInterventions]);

  const kpi = useMemo(() => {
    if (!displayRisk) {
      return {
        highest: null as ReturnType<typeof computeHighestRiskProvince>,
        average: null as number | null,
        jobsCreated: 0,
        jobsProtected: 0,
      };
    }
    return {
      highest: computeHighestRiskProvince(displayRisk.provinces, year),
      average: computeAverageNationalRisk(displayRisk.provinces, year),
      jobsCreated: 0,
      jobsProtected: 0,
    };
  }, [displayRisk, year]);

  const countryCode = useMemo(() => {
    const cfg = config?.countryCode;
    if (typeof cfg === "string" && cfg.trim()) return cfg.trim().toUpperCase();
    const rc = (displayRisk as unknown as AnyRecord)?.countryCode;
    if (typeof rc === "string" && rc.trim()) return rc.trim().toUpperCase();
    return "ID";
  }, [config, displayRisk]);

  const supplyBySkill = useMemo(
    () => buildDummySupplyForCountry(countryCode, demandSignals),
    [countryCode, demandSignals]
  );

  const skillGapSummary = useMemo(() => {
    const rows = demandSignals.map((d) => {
      const supply = supplyBySkill[d.skill] ?? 0;
      const unmet = Math.max(0, d.demandScore - supply);
      return { ...d, supply, unmet };
    });
    const demandTotal = rows.reduce((a, r) => a + r.demandScore, 0);
    const unmetTotal = rows.reduce((a, r) => a + r.unmet, 0);
    const coverage = demandTotal > 0 ? Math.max(0, 1 - unmetTotal / demandTotal) : 0;
    const gap = demandTotal > 0 ? unmetTotal / demandTotal : 0;
    return {
      rows,
      coveragePct: coverage * 100,
      gapPct: gap * 100,
      topMissing: [...rows].sort((a, b) => b.unmet - a.unmet).slice(0, 5),
    };
  }, [demandSignals, supplyBySkill]);
  const heroSkillRows = useMemo(() => skillGapSummary.topMissing.slice(0, 3), [skillGapSummary.topMissing]);
  const countryAiRiskPct = useMemo(() => {
    if (kpi.average == null) return 0;
    return Math.max(0, Math.min(100, kpi.average * 100));
  }, [kpi.average]);

  const hasSubnationalData = useMemo(() => {
    if (!displayRisk) return false;
    const source = String((displayRisk as unknown as AnyRecord).provinceDataSource ?? "").toLowerCase();
    if (source.includes("national_baseline_only")) return false;
    return displayRisk.provinces.length > 1;
  }, [displayRisk]);

  const nationalBaselineInfo = useMemo(() => {
    const baseline = asRecord((displayRisk as unknown as AnyRecord)?.nationalBaseline);
    const series = asRecord(baseline?.series);
    const internet = asRecord(series?.["IT.NET.USER.ZS"]);
    const youthUnemp = asRecord(series?.["SL.UEM.1524.ZS"]);
    const unemploy = asRecord(series?.["SL.UEM.TOTL.ZS"]);
    return {
      source: typeof baseline?.source === "string" ? baseline.source : "National baseline",
      scope: typeof baseline?.scope === "string" ? baseline.scope : "national",
      internetPct: asNum(internet?.latestValue),
      youthUnemploymentPct: asNum(youthUnemp?.latestValue),
      unemploymentPct: asNum(unemploy?.latestValue),
    };
  }, [displayRisk]);

  const dataStatusLine = useMemo(() => {
    if (loadState === "loading") return "Loading…";
    if (loadState === "err") return "Load error — see banner";
    return `Risk: ${riskSource} · Interventions: ${interventionsSource} · Demand taxonomy: ${demandSource}`;
  }, [loadState, riskSource, interventionsSource, demandSource]);

  const countryLabel = config?.displayName ?? "Indonesia";

  return (
    <div className="dash-app dash-app--workspace">
      <DashboardTopBar />

      {err && (
        <div className="dash-alert dash-alert--soft dash-alert--inline" role="status">
          {err}
        </div>
      )}

      {loadState === "loading" && !displayRisk && (
        <p className="dash-workspace-loading">Loading dashboard…</p>
      )}

      {loadState === "err" && !risk && (
        <div className="dash-alert dash-alert--inline" role="alert">
          <strong>Could not load province risk data.</strong>{" "}
          <button type="button" className="dash-btn dash-btn--ghost" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      {displayRisk && interMeta && (
        <div className="dash-shell">
          <section className="dash-hero">
            <div className="dash-hero__top">
              <div>
                <h2 className="dash-hero__title">National Outlook</h2>
                <p className="dash-hero__subtitle">{countryLabel} · Policy planning view · {year}</p>
              </div>
            </div>
            <div className="dash-gap-visual">
              <article className="dash-gap-panel dash-gap-panel--indicators">
                <div className="dash-gap-panel__head">
                  <h3 className="dash-gap-panel__title">National Skills Indicators</h3>
                </div>
                <div className="dash-indicator-grid">
                  <section className="dash-indicator-card">
                    <h4 className="dash-indicator-card__title">National response gap</h4>
                    <div
                      className="dash-gap-ring dash-gap-ring--gap"
                      style={{ ["--gap-angle" as string]: `${Math.max(0, Math.min(360, skillGapSummary.gapPct * 3.6))}deg` }}
                      role="img"
                      aria-label={`National skills gap ${toDisplayNumber(skillGapSummary.gapPct, 1)} percent`}
                    >
                      <div className="dash-gap-ring__inner">
                        <span className="dash-gap-ring__value">{toDisplayNumber(skillGapSummary.gapPct, 1)}%</span>
                      </div>
                    </div>
                    <p className="dash-indicator-card__text">Roughly one-third of weighted skill demand is currently unmet.</p>
                  </section>
                  <section className="dash-indicator-card">
                    <h4 className="dash-indicator-card__title">AI risk</h4>
                    <div
                      className="dash-gap-ring dash-gap-ring--ai"
                      style={{ ["--gap-angle" as string]: `${Math.max(0, Math.min(360, countryAiRiskPct * 3.6))}deg` }}
                      role="img"
                      aria-label={`Country AI risk ${toDisplayNumber(countryAiRiskPct, 1)} percent`}
                    >
                      <div className="dash-gap-ring__inner">
                        <span className="dash-gap-ring__value dash-gap-ring__value--ai">{toDisplayNumber(countryAiRiskPct, 1)}%</span>
                      </div>
                    </div>
                    <p className="dash-indicator-card__text">Roughly one-third of workforce is at risk of AI-driven displacement.</p>
                  </section>
                </div>
                <div className="dash-gap-panel__note">
                  <p>
                    <strong>National response gap:</strong> weighted share of skill demand that remains unmet after
                    accounting for current country supply estimates.
                  </p>
                  <p>
                    <strong>AI risk:</strong> aggregate displacement-risk index derived from country labor indicators
                    and mapped to a 0-100 scale for comparison.
                  </p>
                </div>
              </article>
              <div className="dash-gap-list">
                <div className="dash-gap-list__section">
                  <p className="dash-gap-list__title">Top missing skill clusters</p>
                  <div className="dash-gap-list__items" role="list" aria-label="Top three missing skill clusters">
                    {heroSkillRows.map((s, idx) => (
                      <div key={s.skill} className="dash-gap-list__item" role="listitem">
                        <span className="dash-gap-list__rank" aria-hidden="true">{idx + 1}</span>
                        <span className="dash-gap-list__name" style={{ textTransform: "capitalize" }}>{s.skill}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="dash-gap-list__section dash-gap-list__section--policy">
                  <p className="dash-gap-list__title">Recommended policy actions</p>
                  <div className="dash-gap-list__items" role="list" aria-label="Recommended policy actions">
                    {recommendedActions.map((a, idx) => (
                      <div key={a.id} className="dash-gap-list__item" role="listitem">
                        <span className="dash-gap-list__rank dash-gap-list__rank--policy" aria-hidden="true">{idx + 1}</span>
                        <span className="dash-gap-list__name">{a.title}</span>
                        <span className="dash-gap-list__budget">
                          Est. budget: ${estimatePolicyBudgetUsd(a.id, a.title).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="dash-card dash-card--lift dash-world-card">
            <div className="dash-world-head">
              <div>
                <h2 className="dash-h2">National-level overview</h2>
                <p className="dash-muted">
                  World comparison by country. Switch between skills gap and AI risk views.
                </p>
                <p className="dash-micro">
                  {hasSubnationalData
                    ? "Subnational data is available; this world map is shown for national benchmarking."
                    : "Subnational data is not uploaded yet; this world map is used as the default national overview."}
                </p>
              </div>
              <div className="dash-world-toggle" role="tablist" aria-label="World map metric">
                <button
                  type="button"
                  className={"dash-world-toggle__btn" + (worldMetric === "gap" ? " dash-world-toggle__btn--active" : "")}
                  onClick={() => setWorldMetric("gap")}
                >
                  Response gap
                </button>
                <button
                  type="button"
                  className={"dash-world-toggle__btn" + (worldMetric === "aiRisk" ? " dash-world-toggle__btn--active" : "")}
                  onClick={() => setWorldMetric("aiRisk")}
                >
                  AI risk
                </button>
              </div>
            </div>
            <WorldMetricMap
              metric={worldMetric}
              countryCode={countryCode}
              countryGapPct={skillGapSummary.gapPct}
              countryAiRiskPct={countryAiRiskPct}
              year={year}
            />
            <div className="dash-year-block dash-year-block--map" style={{ marginTop: "0.35rem" }}>
              <div className="dash-year-block__label">
                <span className="dash-eyebrow">Simulation year</span>
                <span className="dash-year-block__value">{year}</span>
              </div>
              <input
                className="dash-year-slider"
                type="range"
                min={Math.min(...(displayRisk.years?.length ? displayRisk.years : [2026, 2031]))}
                max={Math.max(...(displayRisk.years?.length ? displayRisk.years : [2026, 2031]))}
                step={1}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="National map simulation year"
              />
            </div>
            <div className="dash-legend dash-legend--map" role="list" aria-label="National map legend">
              {(worldMetric === "gap" ? NATIONAL_GAP_LEGEND : NATIONAL_AI_LEGEND).map((c, idx) => (
                <span key={`${worldMetric}-${idx}`} className="dash-legend__item" role="listitem">
                  <span className="dash-legend__sw" style={{ background: c }} />
                  {["Very low", "Low", "Moderate", "High", "Very high"][idx]}
                </span>
              ))}
            </div>
            <div className="dash-world-foot">
              <span>{worldMetric === "gap" ? "Response gap view" : "AI risk view"} · {dataStatusLine}</span>
              <span>
                {nationalBaselineInfo.source} ({nationalBaselineInfo.scope})
              </span>
            </div>
            <section className="dash-deep-dive">
              <div className="dash-world-head">
                <h3 className="dash-h3">Provincial deep dive</h3>
                <div className="dash-world-toggle" role="tablist" aria-label="Provincial map metric">
                  <button
                    type="button"
                    className={"dash-world-toggle__btn" + (provincialMetric === "gap" ? " dash-world-toggle__btn--active" : "")}
                    onClick={() => setProvincialMetric("gap")}
                  >
                    Response gap
                  </button>
                  <button
                    type="button"
                    className={"dash-world-toggle__btn" + (provincialMetric === "aiRisk" ? " dash-world-toggle__btn--active" : "")}
                    onClick={() => setProvincialMetric("aiRisk")}
                  >
                    AI risk
                  </button>
                </div>
              </div>
              <MapCanvas
                displayRisk={displayRisk}
                year={year}
                onYearChange={setYear}
                selectedId={selectedId}
                onSelectProvince={setSelectedId}
                metric={provincialMetric}
                onBoundaryMatchDiagnostics={setBoundaryMatchDiag}
              />
              {boundaryMatchDiag && (
                <p className="dash-micro" style={{ marginTop: "0.5rem" }}>
                  Boundary match: {boundaryMatchDiag.matchedFeatureCount}/{boundaryMatchDiag.geoFeatureCount} mapped.
                </p>
              )}
            </section>
            <p className="dash-micro" style={{ marginTop: "0.7rem" }}>{interMeta.disclaimer}</p>
          </section>
        </div>
      )}
    </div>
  );
}
