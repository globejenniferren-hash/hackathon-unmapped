import type { DataIntakeAnalyzeResponse, DataIntakeCatalog } from "../types/dataIntake";
import { useMockByDefault } from "./loadDashboardData";

function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${path.replace(/^\//, "")}`;
}

async function readJsonOrThrow<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

function pickFromCatalog(catalog: DataIntakeCatalog, documentFileName: string): DataIntakeAnalyzeResponse {
  const doc = catalog.documents[documentFileName];
  return {
    meta: catalog.meta,
    proposedUpdates: doc?.proposedUpdates ?? [],
  };
}

/**
 * POST /api/data-intake/analyze with `{ documentId }` when not in mock mode; otherwise load
 * `public/mock/dataIntakeAnalyze.json` and select the document bucket.
 */
export async function analyzeDataIntake(documentFileName: string): Promise<DataIntakeAnalyzeResponse> {
  if (useMockByDefault()) {
    const catalog = await readJsonOrThrow<DataIntakeCatalog>(publicUrl("mock/dataIntakeAnalyze.json"));
    return pickFromCatalog(catalog, documentFileName);
  }
  try {
    const res = await fetch(publicUrl("api/data-intake/analyze"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: documentFileName }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as DataIntakeAnalyzeResponse;
  } catch {
    const catalog = await readJsonOrThrow<DataIntakeCatalog>(publicUrl("mock/dataIntakeAnalyze.json"));
    return pickFromCatalog(catalog, documentFileName);
  }
}
