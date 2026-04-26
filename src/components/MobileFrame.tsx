import { Link, useLocation } from "@tanstack/react-router";

const tabs = [
  { to: "/voice", label: "Translate", match: (p: string) => p.startsWith("/voice") },
  {
    to: "/readiness/passport",
    label: "Passport",
    match: (p: string) => p.startsWith("/readiness/passport"),
  },
  {
    to: "/readiness/gap",
    label: "Assessment",
    match: (p: string) =>
      p === "/readiness" ||
      p === "/readiness/" ||
      p.startsWith("/readiness/gap") ||
      p.startsWith("/readiness/forward") ||
      p.startsWith("/readiness/weather"),
  },
] as const;

export function MobileFrame({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh flex justify-center">
      <div className="w-full max-w-md min-h-dvh flex flex-col bg-paper relative pb-24">
        <header className="px-6 pt-6 pb-4 flex items-center justify-between">
          <Link to="/voice" className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-terracotta flex items-center justify-center shadow-sm float-slow">
              <span className="font-serif italic text-paper text-base leading-none">u</span>
            </div>
            <div className="leading-none">
              <span className="font-serif italic font-semibold text-graphite text-lg">unmapped</span>
              <p className="font-hand text-[13px] text-terracotta -mt-0.5">your story, mapped</p>
            </div>
          </Link>
        </header>

        <main className="flex-1 px-6 pb-6">{children}</main>

        {/* Bottom navigation banner */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-4 pt-2 bg-gradient-to-t from-paper via-paper to-paper/90 backdrop-blur z-20">
          <div className="flex items-stretch gap-1.5 bg-card rounded-2xl p-1.5 border-2 border-ink-bleed shadow-lg">
            {tabs.map((t) => {
              const active = t.match(pathname);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  search={(prev: Record<string, unknown>) => prev}
                  className={`flex-1 flex items-center justify-center px-2 py-3 rounded-xl text-[12px] font-semibold transition-all ${
                    active
                      ? "bg-terracotta text-paper shadow-sm"
                      : "text-graphite-light hover:text-graphite hover:bg-paper-warm/40"
                  }`}
                >
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
