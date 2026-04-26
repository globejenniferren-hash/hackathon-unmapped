const PASSPORT_PREFILL_KEY = "unmapped.passport.skills.prefill.v1";

export type PassportPrefillSkill = {
  id: string;
  name: string;
  translation: string;
  icon: string;
  evidence: Array<{
    where: string;
    city: string;
    from: string;
    to: string;
    duration: string;
    detail: string;
  }>;
};

export function savePassportSkillPrefill(skills: PassportPrefillSkill[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PASSPORT_PREFILL_KEY, JSON.stringify(skills));
  } catch {
    // best effort only
  }
}

export function readPassportSkillPrefill(): PassportPrefillSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PASSPORT_PREFILL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === "object");
  } catch {
    return [];
  }
}
