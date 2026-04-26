import type { BoundaryMockMatchDiagnostics } from "../../lib/provinceNameMatch";

export type DemoDiagnosticsProps = {
  mockMode: boolean;
  /** Raw env readout for the collapsible panel (may be undefined when unset). */
  viteMockEnv?: string;
  riskSource: "mock" | "api";
  interventionsSource: "mock" | "api";
  /** GeoJSON ↔ mock province join stats (from map load). */
  boundaryMatch?: BoundaryMockMatchDiagnostics | null;
  /** When true, render expanded panel (sidebar tab) instead of a collapsible details block. */
  expanded?: boolean;
};

export function DemoDiagnostics({
  mockMode,
  viteMockEnv,
  riskSource,
  interventionsSource,
  boundaryMatch,
  expanded,
}: DemoDiagnosticsProps) {
  const viteReadout = viteMockEnv === undefined ? "(unset — defaults to mock-first)" : `"${viteMockEnv}"`;
  const viteFlag = mockMode ? "true" : "false";
  const body = (
    <div className={"dash-diagnostics__body" + (expanded ? " dash-diagnostics__body--open" : "")}>
      <p>
        Static <code>public/mock/*.json</code> drives this view at <code>/mock/…</code> (not{" "}
        <code>/public/mock/…</code> in the URL).
      </p>
      <p>
        <code>VITE_USE_MOCK_API</code> env: {viteReadout} · effective mock-first:{" "}
        <strong>{viteFlag}</strong> · Last risk load: <strong>{riskSource}</strong> · Last interventions load:{" "}
        <strong>{interventionsSource}</strong>
      </p>
      <p>
        With mock off, <code>GET /api/dashboard/province-risk?…</code> and{" "}
        <code>POST /api/data-intake/analyze</code> are attempted; failures fall back to the same mock files.
      </p>
      <p>
        <strong>Map boundaries:</strong> For demo reliability, the dashboard loads Indonesia ADM1 shapes only from{" "}
        <code>/geo/IDN_ADM1.geojson</code> (file on disk: <code>public/geo/IDN_ADM1.geojson</code>). It does{" "}
        <strong>not</strong> call geoBoundaries or other remote boundary APIs on page load. To refresh boundaries,
        download IDN ADM1 GeoJSON once and save it to <code>public/geo/IDN_ADM1.geojson</code>.
      </p>

      {boundaryMatch != null && (
        <div className="dash-diagnostics-match" aria-label="Boundary to mock province matching">
          <p className="dash-diagnostics-match__title">Boundary ↔ mock matching</p>
          <ul className="dash-diagnostics-match__list">
            <li>GeoJSON features: {boundaryMatch.geoFeatureCount}</li>
            <li>Mock risk provinces: {boundaryMatch.mockCount}</li>
            <li>Geo features matched to mock: {boundaryMatch.matchedFeatureCount}</li>
          </ul>
          {boundaryMatch.unmatchedGeoNames.length > 0 && (
            <p className="dash-diagnostics-match__sub">
              <strong>Unmatched GeoJSON labels</strong> ({boundaryMatch.unmatchedGeoNames.length}):{" "}
              {boundaryMatch.unmatchedGeoNames.join("; ")}
            </p>
          )}
          {boundaryMatch.unmatchedMockNames.length > 0 && (
            <p className="dash-diagnostics-match__sub">
              <strong>Mock provinces with no GeoJSON match</strong> ({boundaryMatch.unmatchedMockNames.length}):{" "}
              {boundaryMatch.unmatchedMockNames.join("; ")}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (expanded) {
    return <div className="dash-diagnostics dash-diagnostics--panel">{body}</div>;
  }

  return (
    <details className="dash-diagnostics">
      <summary>Demo diagnostics</summary>
      {body}
    </details>
  );
}
