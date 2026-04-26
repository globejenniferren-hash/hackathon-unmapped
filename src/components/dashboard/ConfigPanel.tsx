import type { CountryConfig } from "../../types/dashboard";

export type ConfigPanelProps = {
  config: CountryConfig | null;
  baselinePackId: string;
  /** Single-column layout for narrow sidebars. */
  narrow?: boolean;
};

export function ConfigPanel({ config, baselinePackId, narrow }: ConfigPanelProps) {
  return (
    <section className={"dash-config" + (narrow ? " dash-config--narrow" : "")}>
      <h2 className="dash-h2 dash-h2--small">Country config</h2>
      <div className="dash-config__grid">
        <dl className="dash-config__dl">
          <div>
            <dt>Country</dt>
            <dd>{config?.displayName ?? "Indonesia"}</dd>
          </div>
          <div>
            <dt>Admin unit</dt>
            <dd>{config?.mapLabel ?? "Provinces"}</dd>
          </div>
          <div>
            <dt>Locale</dt>
            <dd>{config?.locale ?? "id-ID"}</dd>
          </div>
          <div>
            <dt>Baseline pack</dt>
            <dd>{baselinePackId}</dd>
          </div>
        </dl>
        <p className="dash-config__priority">
          <strong>Data priority:</strong> Approved AI updates &gt; baseline country pack
        </p>
      </div>
      <p className="dash-micro">
        Alternate country configs (e.g. Ghana) can ship as additional JSON packs—brief mention only for this
        demo.
      </p>
    </section>
  );
}
