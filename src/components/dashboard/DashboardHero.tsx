export type DashboardHeroProps = {
  yearRangeLabel: string;
};

export function DashboardHero({ yearRangeLabel }: DashboardHeroProps) {
  return (
    <header className="dash-hero">
      <div className="dash-hero__top">
        <div>
          <h1 className="dash-hero__title">AI Displacement Risk Dashboard</h1>
          <p className="dash-hero__subtitle">
            Indonesia · Province-level simulation · {yearRangeLabel}
          </p>
        </div>
        <div className="dash-hero__badges" aria-label="Context badges">
          <span className="dash-badge dash-badge--muted">Demo mode</span>
          <span className="dash-badge dash-badge--teal">Baseline pack: indonesia_public_v1</span>
          <span className="dash-badge dash-badge--amber">Mock data active</span>
        </div>
      </div>
      <p className="dash-hero__lead">
        Use the year slider, select a province, and review AI-extracted data updates before applying them.
      </p>
    </header>
  );
}
