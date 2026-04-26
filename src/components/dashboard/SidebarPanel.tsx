import type { BoundaryMockMatchDiagnostics } from "../../lib/provinceNameMatch";
import type { CountryConfig } from "../../types/dashboard";
import type { HighestRisk } from "../../lib/dashboardMetrics";
import { formatPct01 } from "../../lib/dashboardFormat";
import { KpiCard } from "./KpiCard";
import { ConfigPanel } from "./ConfigPanel";
import { DemoDiagnostics } from "./DemoDiagnostics";

const DEMO_DOCUMENTS = [
  "telecom_regulator_connectivity_2026.pdf",
  "ministry_training_catalog_2026.pdf",
  "provincial_labor_report_2026.pdf",
] as const;

export type SidebarTab = "overview" | "intake" | "config" | "methodology" | "diagnostics";

export type SidebarPanelProps = {
  active: SidebarTab;
  onTab: (t: SidebarTab) => void;
  year: number;
  baselinePackId: string;
  countryLabel: string;
  highest: HighestRisk;
  averageRisk: number | null;
  dataStatusLine: string;
  jobsCreatedNational: number;
  jobsProtectedNational: number;
  config: CountryConfig | null;
  demoDocument: string;
  onDemoDocumentChange: (id: string) => void;
  intakeLoading: boolean;
  intakeError: string | null;
  proposedCount: number;
  avgConfidence: number | null;
  onAnalyze: () => void;
  onResetBaseline: () => void;
  onOpenReview: () => void;
  mockMode: boolean;
  viteMockEnv?: string;
  riskSource: "mock" | "api";
  interventionsSource: "mock" | "api";
  boundaryMatch: BoundaryMockMatchDiagnostics | null;
};

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "intake", label: "AI Data Intake" },
  { id: "config", label: "Country Config" },
  { id: "methodology", label: "Methodology" },
  { id: "diagnostics", label: "Demo Diagnostics" },
];

export function SidebarPanel({
  active,
  onTab,
  year,
  baselinePackId,
  countryLabel,
  highest,
  averageRisk,
  dataStatusLine,
  jobsCreatedNational,
  jobsProtectedNational,
  config,
  demoDocument,
  onDemoDocumentChange,
  intakeLoading,
  intakeError,
  proposedCount,
  avgConfidence,
  onAnalyze,
  onResetBaseline,
  onOpenReview,
  mockMode,
  viteMockEnv,
  riskSource,
  interventionsSource,
  boundaryMatch,
}: SidebarPanelProps) {
  return (
    <div className="dash-sidebar">
      <nav className="dash-sidebar__tabs" aria-label="Workspace sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"dash-sidebar__tab" + (active === t.id ? " dash-sidebar__tab--active" : "")}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="dash-sidebar__body">
        {active === "overview" && (
          <div className="dash-sidebar-pane">
            <p className="dash-sidebar__lead">Session snapshot</p>
            <dl className="dash-sidebar-dl">
              <div>
                <dt>Current country</dt>
                <dd>{countryLabel}</dd>
              </div>
              <div>
                <dt>Baseline pack</dt>
                <dd>{baselinePackId}</dd>
              </div>
              <div>
                <dt>Active year</dt>
                <dd>{year}</dd>
              </div>
              <div>
                <dt>Data status</dt>
                <dd>{dataStatusLine}</dd>
              </div>
            </dl>
            <div className="dash-sidebar-kpis">
              <KpiCard
                label="Highest-risk province"
                value={highest ? highest.name : "—"}
                hint={highest ? `${formatPct01(highest.risk)} · ${year}` : undefined}
                emphasize
              />
              <KpiCard label="Average risk" value={formatPct01(averageRisk)} hint={`All provinces · ${year}`} />
              <KpiCard
                label="Projected jobs created (national)"
                value={jobsCreatedNational.toLocaleString()}
                hint="Roll-up at current budget %"
              />
              <KpiCard
                label="Projected jobs protected (national)"
                value={jobsProtectedNational.toLocaleString()}
                hint="Roll-up at current budget %"
              />
            </div>
          </div>
        )}

        {active === "intake" && (
          <div className="dash-sidebar-pane">
            <p className="dash-intake-blurb">
              Upload or simulate a local report. UNMAPPED extracts proposed dashboard updates with evidence and
              confidence. Nothing changes until approved.
            </p>
            <label className="dash-select-label">
              <span className="dash-eyebrow">Demo document</span>
              <select
                className="dash-select dash-select--full"
                value={demoDocument}
                onChange={(e) => onDemoDocumentChange(e.target.value)}
                disabled={intakeLoading}
              >
                {DEMO_DOCUMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <div className="dash-intake__btns dash-intake__btns--col">
              <button type="button" className="dash-btn dash-btn--primary" disabled={intakeLoading} onClick={onAnalyze}>
                {intakeLoading ? "Analyzing…" : "Analyze with AI"}
              </button>
              <button type="button" className="dash-btn dash-btn--ghost" onClick={onResetBaseline}>
                Reset to baseline
              </button>
            </div>
            {intakeError && (
              <div className="dash-alert dash-alert--soft" role="alert">
                {intakeError}
              </div>
            )}
            {proposedCount > 0 && (
              <div className="dash-intake-summary">
                <p className="dash-intake-summary__line">
                  <strong>{proposedCount}</strong> proposed update{proposedCount === 1 ? "" : "s"} found
                </p>
                {avgConfidence != null && (
                  <p className="dash-intake-summary__line">Average confidence: {avgConfidence.toFixed(0)}%</p>
                )}
                <button type="button" className="dash-btn dash-btn--ghost dash-btn--block" onClick={onOpenReview}>
                  Review updates
                </button>
              </div>
            )}
            {!intakeLoading && proposedCount === 0 && !intakeError && (
              <p className="dash-placeholder dash-placeholder--left">Run “Analyze with AI” to populate the review queue.</p>
            )}
          </div>
        )}

        {active === "config" && (
          <div className="dash-sidebar-pane">
            <ConfigPanel config={config} baselinePackId={baselinePackId} narrow />
          </div>
        )}

        {active === "methodology" && (
          <div className="dash-sidebar-pane">
            <p className="dash-method">
              <strong>Risk formula</strong>
            </p>
            <p className="dash-method-formula">
              Regional risk = automation exposure × employment concentration × digital adoption × time factor
            </p>
            <p className="dash-muted dash-muted--tight">
              Weights are illustrative for this demo; the live product would calibrate against national labor accounts.
            </p>
          </div>
        )}

        {active === "diagnostics" && (
          <div className="dash-sidebar-pane">
            <DemoDiagnostics
              mockMode={mockMode}
              viteMockEnv={viteMockEnv}
              riskSource={riskSource}
              interventionsSource={interventionsSource}
              boundaryMatch={boundaryMatch}
              expanded
            />
          </div>
        )}
      </div>
    </div>
  );
}
