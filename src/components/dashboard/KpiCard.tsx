export type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
};

export function KpiCard({ label, value, hint, emphasize }: KpiCardProps) {
  return (
    <div className={"dash-kpi" + (emphasize ? " dash-kpi--accent" : "")}>
      <span className="dash-kpi__label">{label}</span>
      <span className="dash-kpi__value">{value}</span>
      {hint && <span className="dash-kpi__hint">{hint}</span>}
    </div>
  );
}
