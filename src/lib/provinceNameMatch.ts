import type { FeatureCollection } from "geojson";
import type { ProvinceRiskResponse } from "../types/dashboard";

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalize admin labels for matching (GeoJSON English / Indonesian ↔ mock JSON names).
 */
export function normalizeRegionKey(raw: string): string {
  let s = stripDiacritics(raw).toLowerCase().trim();

  s = s
    .replace(/^provinsi\s+/i, "")
    .replace(/^propinsi\s+/i, "")
    .replace(/^daerah istimewa\s+/i, "")
    .replace(/^di\s+yogyakarta/i, "yogyakarta")
    .replace(/^di\s+/i, "")
    .replace(/^special region of\s+/i, "")
    .replace(/^special capital region of\s+/i, "")
    .replace(/^special capital district of\s+/i, "");

  s = s
    .replace(/\s+province\s*$/i, "")
    .replace(/\s+provinsi\s*$/i, "")
    .replace(/\s+special region\s*$/i, "")
    .replace(/\s+special capital region\s*$/i, "")
    .replace(/\s+capital region\s*$/i, "")
    .replace(/\s+administrative city\s*$/i, "")
    .replace(/\s+autonomous region\s*$/i, "");

  s = s.replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/\bsumatra\b/g, "sumatera");
  return s;
}

/** Collapse English / Indonesian variants to one normalized token before alias / province lookup. */
const SYNONYM_TO_CANONICAL: Record<string, string> = {
  jakarta: "dki jakarta",
  "dki jakarta": "dki jakarta",
  "jakarta raya": "dki jakarta",
  "jakarta special capital region": "dki jakarta",
  "jakarta capital": "dki jakarta",

  "west java": "jawa barat",
  "jawa barat": "jawa barat",

  "central java": "jawa tengah",
  "jawa tengah": "jawa tengah",

  "east java": "jawa timur",
  "jawa timur": "jawa timur",

  bali: "bali",

  "north sumatra": "sumatera utara",
  "north sumatera": "sumatera utara",
  "sumatera utara": "sumatera utara",

  "south sulawesi": "sulawesi selatan",
  "sulawesi selatan": "sulawesi selatan",

  "central sulawesi": "sulawesi tengah",
  "sulawesi tengah": "sulawesi tengah",

  "north sulawesi": "sulawesi utara",
  "sulawesi utara": "sulawesi utara",

  "southeast sulawesi": "sulawesi tenggara",
  "sulawesi tenggara": "sulawesi tenggara",

  "west sulawesi": "sulawesi barat",
  "sulawesi barat": "sulawesi barat",

  "east kalimantan": "kalimantan timur",
  "kalimantan timur": "kalimantan timur",
  kaltim: "kalimantan timur",

  papua: "papua",

  yogyakarta: "di yogyakarta",
  "di yogyakarta": "di yogyakarta",
  "special region of yogyakarta": "di yogyakarta",

  "west nusa tenggara": "nusa tenggara barat",
  "nusa tenggara barat": "nusa tenggara barat",

  "east nusa tenggara": "nusa tenggara timur",
  "nusa tenggara timur": "nusa tenggara timur",

  "bangka belitung islands": "kepulauan bangka belitung",
  "bangka belitung": "kepulauan bangka belitung",
  "kepulauan bangka belitung": "kepulauan bangka belitung",

  "riau islands": "kepulauan riau",
  "kepulauan riau": "kepulauan riau",

  "north maluku": "maluku utara",
  "maluku utara": "maluku utara",

  "west papua": "papua barat",
  "papua barat": "papua barat",
};

/** Canonical normalized keys that map directly to mock province ids (mock JSON has 9 provinces). */
const ALIAS_TO_PROVINCE_ID: Record<string, string> = {
  "dki jakarta": "id-jk",
  jakarta: "id-jk",
  "jakarta raya": "id-jk",
  "jakarta special capital region": "id-jk",
  "jawa barat": "id-jb",
  "west java": "id-jb",
  "jawa tengah": "id-jt",
  "central java": "id-jt",
  "jawa timur": "id-ji",
  "east java": "id-ji",
  bali: "id-ba",
  "sumatera utara": "id-su",
  "north sumatra": "id-su",
  "north sumatera": "id-su",
  "sulawesi selatan": "id-ss",
  "south sulawesi": "id-ss",
  "south sulawesi province": "id-ss",
  "kalimantan timur": "id-kt",
  "east kalimantan": "id-kt",
  papua: "id-pa",
};

function canonicalKeyForLookup(n: string): string {
  if (!n) return n;
  return SYNONYM_TO_CANONICAL[n] ?? n;
}

/**
 * ISO 3166-2:ID codes on boundary features → mock province id when unambiguous for this demo pack.
 * ID-KT / ID-KI are resolved using the English/Indonesian label when needed (see Central vs East Kalimantan).
 */
function resolveProvinceIdFromIso31662(iso: string, label: string): string | null {
  const u = iso.trim().toUpperCase();
  const nameKey = normalizeRegionKey(label);

  if (u === "ID-KT" || u === "ID-KI") {
    if (
      nameKey.includes("timur") ||
      nameKey.includes("east") ||
      nameKey.includes("kalimantan timur") ||
      nameKey.includes("kaltim")
    ) {
      return "id-kt";
    }
    return null;
  }

  const MAP: Record<string, string> = {
    "ID-JK": "id-jk",
    "ID-JB": "id-jb",
    "ID-JT": "id-jt",
    "ID-JI": "id-ji",
    "ID-BA": "id-ba",
    "ID-SU": "id-su",
    "ID-SN": "id-ss",
    "ID-PA": "id-pa",
  };
  return MAP[u] ?? null;
}

export function resolveProvinceIdFromShapeName(
  shapeName: string,
  provinces: ProvinceRiskResponse["provinces"]
): string | null {
  const n0 = normalizeRegionKey(shapeName);
  if (!n0) return null;

  const n = canonicalKeyForLookup(n0);

  const fromAlias = ALIAS_TO_PROVINCE_ID[n] ?? ALIAS_TO_PROVINCE_ID[n0];
  if (fromAlias) return fromAlias;

  for (const p of provinces) {
    const pn = normalizeRegionKey(p.name);
    const pl = normalizeRegionKey(p.nameLocal);
    if (pn === n || pl === n || pn === n0 || pl === n0) return p.id;
    if (canonicalKeyForLookup(pn) === n || canonicalKeyForLookup(pl) === n) return p.id;
  }

  return null;
}

/** Preferred property keys for admin1 / province labels (order matters). */
const SHAPE_NAME_KEYS = [
  "shapeName",
  "provinceName",
  "ADM1_EN",
  "NAME_1",
  "name",
  "name_1",
  "NAME",
  "province",
  "Province",
  "ADM1_NAME",
  "shapeGroup",
  "NAM_1",
] as const;

export function getShapeLabel(props: Record<string, unknown> | null | undefined): string {
  if (!props || typeof props !== "object" || Array.isArray(props)) return "";
  const p = props as Record<string, unknown>;

  for (const key of SHAPE_NAME_KEYS) {
    if (Object.prototype.hasOwnProperty.call(p, key)) {
      const v = p[key];
      if (v != null && String(v).trim() !== "") return typeof v === "string" ? v : String(v);
    }
  }

  const lowerKeyMap = new Map<string, string>();
  for (const k of Object.keys(p)) {
    lowerKeyMap.set(k.toLowerCase(), k);
  }
  for (const key of SHAPE_NAME_KEYS) {
    const actual = lowerKeyMap.get(key.toLowerCase());
    if (!actual) continue;
    const v = p[actual];
    if (v != null && String(v).trim() !== "") return typeof v === "string" ? v : String(v);
  }

  return "";
}

export function resolveProvinceIdFromBoundaryProperties(
  props: Record<string, unknown> | null | undefined,
  provinces: ProvinceRiskResponse["provinces"]
): string | null {
  if (!props || typeof props !== "object") return null;

  const label = getShapeLabel(props);
  let id = resolveProvinceIdFromShapeName(label, provinces);
  if (id) return id;

  const iso = typeof props.shapeISO === "string" ? props.shapeISO : "";
  if (iso.trim()) {
    id = resolveProvinceIdFromIso31662(iso, label || String(props.shapeName ?? ""));
    if (id) return id;
  }

  const adm = props.ADM1_EN ?? props.adm1_en;
  if (typeof adm === "string" && adm.trim()) {
    id = resolveProvinceIdFromShapeName(adm, provinces);
  }

  return id;
}

export type BoundaryMockMatchDiagnostics = {
  geoFeatureCount: number;
  mockCount: number;
  matchedFeatureCount: number;
  unmatchedGeoNames: string[];
  unmatchedMockNames: string[];
};

export function computeBoundaryMockMatchDiagnostics(
  fc: FeatureCollection,
  provinces: ProvinceRiskResponse["provinces"]
): BoundaryMockMatchDiagnostics {
  const features = fc.features ?? [];
  const matchedIds = new Set<string>();
  const unmatchedGeo = new Set<string>();

  for (const f of features) {
    const props = f.properties as Record<string, unknown> | null | undefined;
    const label = getShapeLabel(props ?? undefined) || "(no label)";
    const id = resolveProvinceIdFromBoundaryProperties(props ?? undefined, provinces);
    if (id) matchedIds.add(id);
    else unmatchedGeo.add(label);
  }

  const unmatchedMockNames = provinces.filter((p) => !matchedIds.has(p.id)).map((p) => p.name);

  return {
    geoFeatureCount: features.length,
    mockCount: provinces.length,
    matchedFeatureCount: features.filter((f) => {
      const id = resolveProvinceIdFromBoundaryProperties(
        f.properties as Record<string, unknown> | undefined,
        provinces
      );
      return !!id;
    }).length,
    unmatchedGeoNames: [...unmatchedGeo].sort(),
    unmatchedMockNames,
  };
}
