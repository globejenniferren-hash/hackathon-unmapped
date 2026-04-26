import { Link } from "react-router-dom";

export function DashboardTopBar() {
  return (
    <header className="dash-topbar">
      <div className="dash-topbar__brand">
        <Link to="/" className="dash-topbar__crumb">
          UNMAPPED
        </Link>
        <span className="dash-topbar__sep">/</span>
        <span className="dash-topbar__crumb dash-topbar__crumb--muted">Government</span>
      </div>
      <div className="dash-topbar__titles">
        <h1 className="dash-topbar__title">AI Displacement Risk Dashboard</h1>
        <p className="dash-topbar__subtitle">Indonesia · Province-level simulation · 2026–2031</p>
      </div>
      <div className="dash-topbar__badges" aria-label="Mode badges">
        <span className="dash-badge dash-badge--teal">Demo mode</span>
        <span className="dash-badge dash-badge--amber">Mock data</span>
        <span className="dash-badge dash-badge--muted">Baseline pack</span>
      </div>
    </header>
  );
}
