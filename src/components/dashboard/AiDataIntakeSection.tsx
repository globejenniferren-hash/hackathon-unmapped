import type { ProposedUpdate } from "../../types/dataIntake";

const DEMO_DOCUMENTS = [
  "telecom_regulator_connectivity_2026.pdf",
  "ministry_training_catalog_2026.pdf",
  "provincial_labor_report_2026.pdf",
] as const;

export type AiDataIntakeSectionProps = {
  demoDocument: string;
  onDemoDocumentChange: (id: string) => void;
  intakeLoading: boolean;
  intakeError: string | null;
  proposedUpdates: ProposedUpdate[];
  approvedIds: string[];
  intakeStatus: string | null;
  onAnalyze: () => void;
  onApprove: (id: string) => void;
  onResetBaseline: () => void;
};

export function AiDataIntakeSection({
  demoDocument,
  onDemoDocumentChange,
  intakeLoading,
  intakeError,
  proposedUpdates,
  approvedIds,
  intakeStatus,
  onAnalyze,
  onApprove,
  onResetBaseline,
}: AiDataIntakeSectionProps) {
  return (
    <section className="dash-section dash-intake">
      <div className="dash-section-head dash-section-head--row">
        <div>
          <h2 className="dash-h2">AI-assisted local data intake</h2>
          <p className="dash-muted">
            Upload or simulate a local report. UNMAPPED extracts proposed dashboard updates with evidence and
            confidence. Nothing changes until an operator approves.
          </p>
        </div>
      </div>

      <ol className="dash-flow" aria-label="Intake steps">
        <li className="dash-flow__step">
          <span className="dash-flow__n">1</span>
          <div>
            <strong>Document</strong>
            <p className="dash-micro">Choose a demo file or upload (simulated).</p>
          </div>
        </li>
        <li className="dash-flow__arrow" aria-hidden>
          →
        </li>
        <li className="dash-flow__step">
          <span className="dash-flow__n">2</span>
          <div>
            <strong>Review</strong>
            <p className="dash-micro">Inspect proposed fields, evidence, and confidence.</p>
          </div>
        </li>
        <li className="dash-flow__arrow" aria-hidden>
          →
        </li>
        <li className="dash-flow__step">
          <span className="dash-flow__n">3</span>
          <div>
            <strong>Apply</strong>
            <p className="dash-micro">Approve rows to recalculate the dashboard.</p>
          </div>
        </li>
      </ol>

      <div className="dash-intake__controls">
        <label className="dash-select-label">
          <span className="dash-eyebrow">Demo document</span>
          <select
            className="dash-select"
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
        <div className="dash-intake__btns">
          <button type="button" className="dash-btn dash-btn--primary" disabled={intakeLoading} onClick={onAnalyze}>
            {intakeLoading ? "Analyzing…" : "Analyze with AI"}
          </button>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onResetBaseline}>
            Reset to baseline
          </button>
        </div>
      </div>

      {intakeError && (
        <div className="dash-alert" role="alert">
          {intakeError}
        </div>
      )}
      {intakeStatus && approvedIds.length > 0 && (
        <div className="dash-success" role="status">
          {intakeStatus}
        </div>
      )}

      {proposedUpdates.length > 0 && (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Region</th>
                <th>Field</th>
                <th>Current</th>
                <th>Proposed</th>
                <th className="dash-table__num">Confidence</th>
                <th>Evidence</th>
                <th className="dash-table__num">Action</th>
              </tr>
            </thead>
            <tbody>
              {proposedUpdates.map((u) => {
                const done = approvedIds.includes(u.id);
                return (
                  <tr key={u.id}>
                    <td>{u.dataset}</td>
                    <td>{u.region}</td>
                    <td>{u.field}</td>
                    <td>{u.currentValue}</td>
                    <td>{u.proposedValue}</td>
                    <td className="dash-table__num">{(u.confidence * 100).toFixed(0)}%</td>
                    <td className="dash-table__evidence">{u.evidenceSnippet}</td>
                    <td className="dash-table__num">
                      <button
                        type="button"
                        className="dash-btn dash-btn--sm"
                        disabled={done}
                        onClick={() => onApprove(u.id)}
                      >
                        {done ? "Approved" : "Approve"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!intakeLoading && proposedUpdates.length === 0 && !intakeError && (
        <p className="dash-placeholder">Run “Analyze with AI” to populate the review queue.</p>
      )}
    </section>
  );
}
