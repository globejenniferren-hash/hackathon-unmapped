import type { Intervention } from "../types/dashboard";

export function formatPct01(n: number | null) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function formatUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function applyBudget(
  inters: Intervention[],
  budgetPercent: number
): { per: (i: Intervention) => { c: number; p: number }; totalC: number; totalP: number } {
  const s = Math.max(0, Math.min(100, budgetPercent)) / 100;
  const totalC = inters.reduce((a, i) => a + i.baseJobsCreated * s, 0);
  const totalP = inters.reduce((a, i) => a + i.baseJobsProtected * s, 0);
  return {
    per: (i: Intervention) => ({
      c: Math.round(i.baseJobsCreated * s),
      p: Math.round(i.baseJobsProtected * s),
    }),
    totalC: Math.round(totalC),
    totalP: Math.round(totalP),
  };
}
