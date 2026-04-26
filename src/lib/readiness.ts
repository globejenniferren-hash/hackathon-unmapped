import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

export const CITIES = [
  { id: "makassar", label: "Makassar", connectivity: 0.72 },
  { id: "sumba", label: "Sumba", connectivity: 0.18 },
  { id: "surabaya", label: "Surabaya", connectivity: 0.84 },
  { id: "pontianak", label: "Pontianak", connectivity: 0.46 },
] as const;

export type CityId = (typeof CITIES)[number]["id"];

export const readinessSearchSchema = z.object({
  city: fallback(z.enum(["makassar", "sumba", "surabaya", "pontianak"]), "makassar").default(
    "makassar",
  ),
});

export function getCity(id: CityId) {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}

// Apply a connectivity-based shift to baseline numbers.
// Lower connectivity = higher displacement risk, lower realized income.
export function cityRiskShift(connectivity: number): number {
  // 0.72 baseline -> 0; 0.18 -> +0.27; 0.84 -> -0.06
  return (0.72 - connectivity) * 0.5;
}
