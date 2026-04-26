import { useCallback, useEffect, useMemo, useState } from "react";
import { AIReviewDrawer } from "../components/dashboard/AIReviewDrawer";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { DashboardTopBar } from "../components/dashboard/DashboardTopBar";
import { MapCanvas } from "../components/dashboard/MapCanvas";
import { RightInsightPanel } from "../components/dashboard/RightInsightPanel";
import { SidebarPanel, type SidebarTab } from "../components/dashboard/SidebarPanel";
import { analyzeDataIntake } from "../lib/analyzeDataIntake";
import {
  computeAverageNationalRisk,
  computeHighestRiskProvince,
  computeNationalJobTotals,
} from "../lib/dashboardMetrics";
import {
  loadCountryConfig,
  loadInterventions,
  loadProvinceRisk,
  useMockByDefault,
} from "../lib/loadDashboardData";
import type { BoundaryMockMatchDiagnostics } from "../lib/provinceNameMatch";
import type { Intervention, InterventionResponse, ProvinceRiskResponse } from "../types/dashboard";
import {
  buildDisplayInterventions,
  buildDisplayRisk,
  buildLaborSignals,
  defaultLaborSignals,
  type ProposedUpdate,
} from "../types/dataIntake";
import "./GovernmentDashboard.css";

const BASELINE_PACK_ID = "indonesia_public_v1";

export function GovernmentDashboard() {
  const [year, setYear] = useState(2026);
  const [budgetPercent, setBudgetPercent] = useState(100);
  const [risk, setRisk] = useState<ProvinceRiskResponse | null>(null);
  const [interventions, setInterventions] = useState<InterventionResponse | null>(null);
  const [configId] = useState<"indonesia" | "ghana">("indonesia");
  const [config, setConfig] = useState<Awaited<ReturnType<typeof loadCountryConfig>>["data"]>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [riskSource, setRiskSource] = useState<"mock" | "api">("mock");
  const [interventionsSource, setInterventionsSource] = useState<"mock" | "api">("mock");

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [boundaryMatchDiag, setBoundaryMatchDiag] = useState<BoundaryMockMatchDiagnostics | null>(null);

  const [demoDocument, setDemoDocument] = useState<string>(
    "telecom_regulator_connectivity_2026.pdf"
  );
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [proposedUpdates, setProposedUpdates] = useState<ProposedUpdate[]>([]);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);

  const mockMode = useMockByDefault();

  const refetch = useCallback(async () => {
    setLoadState("loading");
    setErr(null);
    try {
      const [r, int, co] = await Promise.all([
        loadProvinceRisk(2026),
        loadInterventions(),
        loadCountryConfig(configId),
      ]);
      setRisk(r.data);
      setInterventions(int.data);
      setRiskSource(r.source);
      setInterventionsSource(int.source);
      setConfig(co.data);
      setProposedUpdates([]);
      setApprovedIds([]);
      setRejectedIds([]);
      setIntakeError(null);
      setDrawerOpen(false);
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

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const approvedSet = useMemo(() => new Set(approvedIds), [approvedIds]);

  const displayRisk = useMemo(() => {
    if (!risk) return null;
    return buildDisplayRisk(risk, proposedUpdates, approvedSet);
  }, [risk, proposedUpdates, approvedSet]);

  const displayInterventions = useMemo(() => {
    if (!interventions) return null;
    return buildDisplayInterventions(interventions, proposedUpdates, approvedSet);
  }, [interventions, proposedUpdates, approvedSet]);

  const displayLabor = useMemo(
    () => buildLaborSignals(defaultLaborSignals(), proposedUpdates, approvedSet),
    [proposedUpdates, approvedSet]
  );

  const selected = useMemo(
    () =>
      displayRisk && selectedId
        ? displayRisk.provinces.find((p) => p.id === selectedId)
        : undefined,
    [displayRisk, selectedId]
  );

  const forProvince = useMemo(() => {
    if (!displayInterventions || !selectedId) return { list: [] as Intervention[] };
    return {
      list: displayInterventions.byProvince[selectedId]?.interventions ?? [],
    };
  }, [displayInterventions, selectedId]);

  const interMeta = displayInterventions?.meta ?? interventions?.meta ?? null;

  const kpi = useMemo(() => {
    if (!displayRisk) {
      return {
        highest: null as ReturnType<typeof computeHighestRiskProvince>,
        average: null as number | null,
        jobsCreated: 0,
        jobsProtected: 0,
      };
    }
    const jobs = displayInterventions
      ? computeNationalJobTotals(displayInterventions, budgetPercent)
      : { created: 0, protected: 0 };
    return {
      highest: computeHighestRiskProvince(displayRisk.provinces, year),
      average: computeAverageNationalRisk(displayRisk.provinces, year),
      jobsCreated: jobs.created,
      jobsProtected: jobs.protected,
    };
  }, [displayRisk, displayInterventions, year, budgetPercent]);

  const dataStatusLine = useMemo(() => {
    if (loadState === "loading") return "Loading…";
    if (loadState === "err") return "Load error — see banner";
    return `Risk data: ${riskSource} · Interventions: ${interventionsSource}`;
  }, [loadState, riskSource, interventionsSource]);

  const avgConfidence = useMemo(() => {
    if (!proposedUpdates.length) return null;
    const s = proposedUpdates.reduce((a, u) => a + u.confidence, 0);
    return (s / proposedUpdates.length) * 100;
  }, [proposedUpdates]);

  const runAnalyze = useCallback(async () => {
    setIntakeLoading(true);
    setIntakeError(null);
    try {
      const res = await analyzeDataIntake(demoDocument);
      setProposedUpdates(res.proposedUpdates ?? []);
      setApprovedIds([]);
      setRejectedIds([]);
      if (!res.proposedUpdates?.length) {
        setIntakeError("No proposed updates returned for this document (demo).");
      }
    } catch (e) {
      setIntakeError(e instanceof Error ? e.message : "Analyze failed");
      setProposedUpdates([]);
      setApprovedIds([]);
      setRejectedIds([]);
    } finally {
      setIntakeLoading(false);
    }
  }, [demoDocument]);

  const approveUpdate = useCallback((id: string) => {
    setApprovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setToast("AI-extracted override applied. Dashboard recalculated.");
    setDrawerOpen(false);
  }, []);

  const approveMany = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setApprovedIds((prev) => {
      const s = new Set(prev);
      ids.forEach((id) => s.add(id));
      return [...s];
    });
    setToast("AI-extracted override applied. Dashboard recalculated.");
    setDrawerOpen(false);
  }, []);

  const rejectUpdate = useCallback((id: string) => {
    setRejectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const resetIntakeBaseline = useCallback(() => {
    setProposedUpdates([]);
    setApprovedIds([]);
    setRejectedIds([]);
    setIntakeError(null);
    setDrawerOpen(false);
  }, []);

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
        <>
          <DashboardShell
            sidebar={
              <SidebarPanel
                active={sidebarTab}
                onTab={setSidebarTab}
                year={year}
                baselinePackId={BASELINE_PACK_ID}
                countryLabel={countryLabel}
                highest={kpi.highest}
                averageRisk={kpi.average}
                dataStatusLine={dataStatusLine}
                jobsCreatedNational={kpi.jobsCreated}
                jobsProtectedNational={kpi.jobsProtected}
                config={config}
                demoDocument={demoDocument}
                onDemoDocumentChange={setDemoDocument}
                intakeLoading={intakeLoading}
                intakeError={intakeError}
                proposedCount={proposedUpdates.length}
                avgConfidence={avgConfidence}
                onAnalyze={() => void runAnalyze()}
                onResetBaseline={resetIntakeBaseline}
                onOpenReview={() => setDrawerOpen(true)}
                mockMode={mockMode}
                viteMockEnv={import.meta.env.VITE_USE_MOCK_API}
                riskSource={riskSource}
                interventionsSource={interventionsSource}
                boundaryMatch={boundaryMatchDiag}
              />
            }
            map={
              <MapCanvas
                displayRisk={displayRisk}
                year={year}
                onYearChange={setYear}
                selectedId={selectedId}
                onSelectProvince={setSelectedId}
                onBoundaryMatchDiagnostics={setBoundaryMatchDiag}
              />
            }
            rightPanel={
              <RightInsightPanel
                displayRisk={displayRisk}
                selected={selected}
                selectedId={selectedId}
                year={year}
                displayLabor={displayLabor}
                aiOverrideActive={approvedIds.length > 0}
                budgetPercent={budgetPercent}
                onBudgetChange={setBudgetPercent}
                interMeta={interMeta}
                interventions={forProvince.list}
                loadState={loadState}
              />
            }
          />

          <AIReviewDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            proposedUpdates={proposedUpdates}
            approvedIds={approvedIds}
            rejectedIds={rejectedIds}
            onApprove={approveUpdate}
            onReject={rejectUpdate}
            onApproveMany={approveMany}
          />
        </>
      )}

      {toast && (
        <div className="dash-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
