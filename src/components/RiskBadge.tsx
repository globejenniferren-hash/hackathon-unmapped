export type Risk = "durable" | "at-risk" | "declining";

export function RiskBadge({ risk }: { risk: Risk }) {
  const map: Record<Risk, { label: string; bg: string; text: string; emoji: string }> = {
    "durable": { label: "Durable", bg: "bg-moss/15", text: "text-moss", emoji: "🌱" },
    "at-risk": { label: "At Risk", bg: "bg-terracotta/15", text: "text-terracotta", emoji: "⚠️" },
    "declining": { label: "Declining", bg: "bg-graphite/10", text: "text-graphite-light", emoji: "🍂" },
  };
  const { label, bg, text, emoji } = map[risk];
  return (
    <span className={`inline-flex items-center gap-1 ${bg} ${text} text-[11px] font-semibold px-2.5 py-1 rounded-full`}>
      <span>{emoji}</span>{label}
    </span>
  );
}
