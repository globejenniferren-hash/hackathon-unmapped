const KEY = "unmapped.conversation.skills.v1";

export type ConversationSkill = {
  name: string;
  isco_code?: string;
};

export function saveConversationSkills(skills: ConversationSkill[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(skills));
  } catch {
    // best effort
  }
}

export function readConversationSkills(): ConversationSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({
        name: String(s?.name || "").trim(),
        isco_code: String(s?.isco_code || "").trim() || undefined,
      }))
      .filter((s) => s.name);
  } catch {
    return [];
  }
}
