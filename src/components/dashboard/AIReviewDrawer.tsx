import { useCallback, useMemo, useState } from "react";
import type { ProposedUpdate } from "../../types/dataIntake";

export type AIReviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  proposedUpdates: ProposedUpdate[];
  approvedIds: string[];
  rejectedIds: string[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveMany: (ids: string[]) => void;
};

export function AIReviewDrawer({
  open,
  onClose,
  proposedUpdates,
  approvedIds,
  rejectedIds,
  onApprove,
  onReject,
  onApproveMany,
}: AIReviewDrawerProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const approvedSet = useMemo(() => new Set(approvedIds), [approvedIds]);
  const rejectedSet = useMemo(() => new Set(rejectedIds), [rejectedIds]);

  const pending = useMemo(
    () =>
      proposedUpdates.filter((u) => !approvedSet.has(u.id) && !rejectedSet.has(u.id)),
    [proposedUpdates, approvedSet, rejectedSet]
  );

  const checkedPendingIds = useMemo(
    () => pending.filter((u) => checked[u.id]).map((u) => u.id),
    [pending, checked]
  );

  const toggle = useCallback((id: string) => {
    setChecked((c) => ({ ...c, [id]: !c[id] }));
  }, []);

  const approveSelected = useCallback(() => {
    if (checkedPendingIds.length === 0) return;
    onApproveMany(checkedPendingIds);
    setChecked({});
  }, [checkedPendingIds, onApproveMany]);

  if (!open) return null;

  return (
    <div className="dash-drawer-root" role="dialog" aria-modal="true" aria-labelledby="dash-drawer-title">
      <button type="button" className="dash-drawer-backdrop" aria-label="Close review" onClick={onClose} />
      <div className="dash-drawer-panel">
        <header className="dash-drawer-head">
          <div>
            <h2 id="dash-drawer-title" className="dash-drawer-title">
              Review AI-proposed updates
            </h2>
            <p className="dash-drawer-sub">Approve only the rows you want to apply.</p>
          </div>
          <button type="button" className="dash-drawer-close dash-btn dash-btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="dash-drawer-body">
          {proposedUpdates.length === 0 && (
            <p className="dash-placeholder">No proposals. Run Analyze with AI from the left panel.</p>
          )}

          {proposedUpdates.map((u) => {
            const done = approvedSet.has(u.id);
            const rej = rejectedSet.has(u.id);
            return (
              <article
                key={u.id}
                className={
                  "dash-proposal-card" +
                  (done ? " dash-proposal-card--done" : "") +
                  (rej ? " dash-proposal-card--rejected" : "")
                }
              >
                <div className="dash-proposal-card__row">
                  <label className="dash-proposal-check">
                    <input
                      type="checkbox"
                      checked={!!checked[u.id]}
                      disabled={done || rej}
                      onChange={() => toggle(u.id)}
                    />
                    <span className="dash-proposal-meta">
                      <span className="dash-chip dash-chip--neutral">{u.dataset}</span>
                      <span className="dash-chip dash-chip--neutral">{u.region}</span>
                    </span>
                  </label>
                  <span className="dash-proposal-conf">{(u.confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <dl className="dash-proposal-dl">
                  <div>
                    <dt>Field</dt>
                    <dd>{u.field}</dd>
                  </div>
                  <div>
                    <dt>Current</dt>
                    <dd>{u.currentValue}</dd>
                  </div>
                  <div>
                    <dt>Proposed</dt>
                    <dd>{u.proposedValue}</dd>
                  </div>
                </dl>
                <p className="dash-proposal-evidence">{u.evidenceSnippet}</p>
                <div className="dash-proposal-actions">
                  {done ? (
                    <span className="dash-proposal-status">Approved</span>
                  ) : rej ? (
                    <span className="dash-proposal-status dash-proposal-status--muted">Rejected</span>
                  ) : (
                    <>
                      <button type="button" className="dash-btn dash-btn--primary dash-btn--sm" onClick={() => onApprove(u.id)}>
                        Approve
                      </button>
                      <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => onReject(u.id)}>
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <footer className="dash-drawer-foot">
          <button
            type="button"
            className="dash-btn dash-btn--primary"
            disabled={checkedPendingIds.length === 0}
            onClick={approveSelected}
          >
            Approve selected
          </button>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
