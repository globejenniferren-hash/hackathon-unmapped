import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { fetchResource } from "@/lib/api";
import { readinessSearchSchema, getCity } from "@/lib/readiness";
import { readPassportSkillPrefill } from "@/lib/passportPrefill";

type ReadinessSearch = z.infer<typeof readinessSearchSchema>;

type Evidence = {
  where: string;
  city: string;
  from: string;
  to: string;
  duration: string;
  detail: string;
};
type Skill = {
  id: string;
  name: string;
  translation: string;
  icon: string;
  evidence: Evidence[];
};
type Education = { level: string; institution: string; years: string; completed: boolean; note?: string };
type PassportData = {
  profile: {
    name: string;
    age: number;
    city: string;
    province: string;
    country: string;
    language: string;
    household: string;
    issuedOn: string;
    passportId: string;
  };
  education: Education[];
  skills: Skill[];
};

export const Route = createFileRoute("/readiness/passport")({
  component: PassportPage,
});

function PassportPage() {
  const search = Route.useSearch() as ReadinessSearch;
  const city = getCity(search.city);
  const [data, setData] = useState<PassportData | null>(null);
  const [openSkill, setOpenSkill] = useState<string | null>(null);

  useEffect(() => {
    fetchResource<PassportData>("passport")
      .then((base) => {
        const prefillSkills = readPassportSkillPrefill();
        if (prefillSkills.length) {
          setData({ ...base, skills: prefillSkills });
          return;
        }
        setData(base);
      })
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return <div className="text-center py-12 text-graphite-light text-sm">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl text-graphite leading-tight">Skill Passport</h1>
      </div>

      {/* Passport cover */}
      <div className="bg-ochre/15 border-2 border-ochre/50 rounded-2xl p-5 sticker-tape relative">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-serif text-2xl text-graphite leading-tight mt-1">
              {data.profile.name}
            </h2>
            <p className="text-xs text-graphite-light italic">
              {data.profile.age} · {city.label}, {data.profile.province}
            </p>
          </div>
          <div className="size-14 rounded-full bg-terracotta/20 border-2 border-terracotta/50 flex items-center justify-center font-serif italic text-terracotta text-2xl">
            {data.profile.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px] pt-3 border-t border-dashed border-ochre/40">
          <Field label="Language" value={data.profile.language} />
          <Field label="Household" value={data.profile.household} />
          <Field label="Issued" value={data.profile.issuedOn} />
          <Field label="ID" value={data.profile.passportId} mono />
        </div>
      </div>

      {/* Education */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl text-graphite">Education</h2>
        <ol className="space-y-3 relative border-l-2 border-dashed border-ink-bleed pl-5 ml-2">
          {data.education.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-terracotta border-2 border-paper" />
              <p className="font-mono-label text-[10px] tracking-wider text-graphite-light">
                {e.years}
              </p>
              <p className="font-serif text-base text-graphite leading-tight">{e.level}</p>
              <p className="text-xs text-graphite-light italic">{e.institution}</p>
              {e.note && <p className="text-[11px] text-graphite mt-1">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>

      {/* Skills */}
      <section className="space-y-3">
        <div>
          <p className="font-hand text-base text-terracotta">tap a skill to open it ✋</p>
          <h2 className="font-serif text-xl text-graphite">Skills with receipts</h2>
        </div>
        <div className="space-y-2">
          {data.skills.map((s) => {
            const open = openSkill === s.id;
            return (
              <div key={s.id} className="bg-card sticker overflow-hidden">
                <button
                  onClick={() => setOpenSkill(open ? null : s.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-ochre/5 transition-colors"
                >
                  <span className="text-2xl">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-serif text-base text-graphite leading-tight">{s.name}</p>
                  </div>
                  <span className="text-graphite-light text-sm">{open ? "−" : "+"}</span>
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-3 border-t border-dashed border-ink-bleed pt-3">
                    {s.evidence.map((ev, i) => (
                      <div key={i} className="space-y-1">
                        <p className="font-serif text-sm text-graphite leading-tight">
                          {ev.where}{" "}
                          <span className="text-graphite-light italic font-sans text-[11px]">
                            · {ev.city}
                          </span>
                        </p>
                        <p className="font-mono-label text-[10px] tracking-wider text-terracotta">
                          {ev.from} — {ev.to} · {ev.duration}
                        </p>
                        <p className="text-xs text-graphite leading-relaxed">{ev.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <NextLink to="/readiness/gap" label="Next: what you're already worth →" />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="font-mono-label text-[9px] tracking-wider text-graphite-light uppercase">
        {label}
      </p>
      <p className={`text-graphite ${mono ? "font-mono text-[11px]" : "text-xs"}`}>{value}</p>
    </div>
  );
}

function NextLink({ to, label }: { to: "/readiness/gap" | "/readiness/forward" | "/readiness/weather" | "/readiness"; label: string }) {
  return (
    <Link
      to={to}
      search={(prev: ReadinessSearch) => prev}
      className="block w-full text-center py-3 rounded-full bg-terracotta text-paper font-semibold text-sm hover:bg-terracotta/90 transition-colors"
    >
      {label}
    </Link>
  );
}
