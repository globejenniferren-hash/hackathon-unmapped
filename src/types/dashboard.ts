/** Mirrors `public/mock/provinceRiskResponse.json` */
export type ProvinceRiskResponse = {
  meta: {
    title: string;
    country: string;
    countryName: string;
    dataSource: string;
    unit: string;
    disclaimer: string;
  };
  years: number[];
  provinces: {
    id: string;
    name: string;
    nameLocal: string;
    region: string;
    populationHint: number;
    riskByYear: Record<string, number>;
  }[];
  legend: {
    lowMax: number;
    mediumMax: number;
    highMax: number;
    labels: { low: string; medium: string; high: string; critical: string };
  };
};

/** Mirrors `public/mock/interventionResponse.json` */
export type Intervention = {
  id: string;
  rank: number;
  title: string;
  titleLocal: string;
  description: string;
  estimatedCostUsd: number;
  baseJobsCreated: number;
  baseJobsProtected: number;
};

export type InterventionResponse = {
  meta: {
    dataSource: string;
    disclaimer: string;
  };
  country: string;
  byProvince: Record<string, { interventions: Intervention[] }>;
};

export type CountryConfig = {
  countryCode: string;
  displayName: string;
  locale: string;
  currency: string;
  mapLabel: string;
  primaryAdminUnit: string;
  sourcesNote: string;
};

export type RiskBand = "low" | "medium" | "high" | "critical";
