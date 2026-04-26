import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import type { z } from "zod";
import { MobileFrame } from "@/components/MobileFrame";
import { CITIES, readinessSearchSchema } from "@/lib/readiness";

type ReadinessSearch = z.infer<typeof readinessSearchSchema>;

export const Route = createFileRoute("/readiness")({
  validateSearch: zodValidator(readinessSearchSchema),
  component: ReadinessLayout,
});

const assessmentTabs = [
  { to: "/readiness/gap", label: "Missed Income" },
  { to: "/readiness/forward", label: "Looking Forward" },
  { to: "/readiness/weather", label: "Resilience" },
] as const;

function ReadinessLayout() {
  const { city } = Route.useSearch();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Skill Passport is identity — it doesn't change with location.
  const isPassport = pathname.startsWith("/readiness/passport");
  const isAssessment = assessmentTabs.some((t) => pathname.startsWith(t.to));

  return (
    <MobileFrame>
      <div className="flex flex-col gap-5">
        {/* Assessment sub-banner */}
        {isAssessment && (
          <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-paper/90 backdrop-blur">
            <div className="flex items-stretch gap-1 bg-card rounded-full p-1 border border-ink-bleed shadow-sm">
              {assessmentTabs.map((t) => {
                const active = pathname.startsWith(t.to);
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    search={(prev: ReadinessSearch) => prev}
                    className={`flex-1 text-center px-2 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                      active
                        ? "bg-terracotta text-paper shadow-sm"
                        : "text-graphite-light hover:text-graphite"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Global location picker — hidden on the Passport chapter */}
        {!isPassport && (
          <div className="flex items-center justify-end">
            <label className="inline-flex items-center gap-2 bg-card sticker px-3 py-2">
              <span className="text-base leading-none">📍</span>
              <select
                value={city}
                onChange={(e) =>
                  navigate({
                    to: ".",
                    search: (prev: ReadinessSearch) => ({
                      ...prev,
                      city: e.target.value as typeof city,
                    }),
                    replace: true,
                  })
                }
                className="bg-transparent text-xs font-semibold text-graphite focus:outline-none"
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <Outlet />
      </div>
    </MobileFrame>
  );
}


