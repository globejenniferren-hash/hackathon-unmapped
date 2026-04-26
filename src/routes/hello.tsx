import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { fetchResource } from "@/lib/api";

type Sponsor = { exists: boolean; name: string; program: string };
type Defaults = {
  name: string;
  city: string;
  country: string;
  language: string;
  sector: string;
  sponsor: Sponsor;
};

export const Route = createFileRoute("/hello")({
  component: Onboarding,
});

const STEPS = ["name", "location", "dob", "photo", "summary"] as const;
type Step = (typeof STEPS)[number];

function Onboarding() {
  const navigate = useNavigate();
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [step, setStep] = useState(0);

  // form state
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [dob, setDob] = useState(""); // yyyy-mm-dd
  const [photo, setPhoto] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // swipe handling
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  useEffect(() => {
    fetchResource<Defaults>("userProfile").then(setDefaults).catch(() => setDefaults(null));
  }, []);

  const current: Step = STEPS[step];
  const canAdvance =
    (current === "name" && name.trim().length >= 2) ||
    (current === "location" && country.trim() && city.trim()) ||
    (current === "dob" && /^\d{4}-\d{2}-\d{2}$/.test(dob)) ||
    (current === "photo") || // photo optional
    (current === "summary");

  const next = () => {
    if (!canAdvance) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const prev = () => step > 0 && setStep(step - 1);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const onTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const dx = touchEndX.current - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(f);
  };

  return (
    <MobileFrame>
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <p className="font-hand text-lg text-terracotta">hello there 👋</p>
          <h1 className="font-serif text-3xl text-graphite leading-[1.1]">
            Let's <span className="italic squiggle">get to know</span> you.
          </h1>
          <p className="text-sm text-graphite-light leading-relaxed max-w-[36ch]">
            A few quick questions, then we begin. Swipe between steps.
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === step ? "w-8 bg-terracotta" : i < step ? "w-2 bg-terracotta/50" : "w-2 bg-ink-bleed"
              }`}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* Swipeable card */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="bg-card sticker p-6 min-h-[340px] flex flex-col select-none"
        >
          {current === "name" && (
            <div className="flex-1 flex flex-col gap-4 animate-in fade-in duration-300">
              <p className="font-hand text-base text-terracotta">step 1 of 5</p>
              <h2 className="font-serif text-2xl text-graphite leading-tight">What's your name?</h2>
              <p className="text-sm text-graphite-light">The name you'd like us to call you.</p>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder={defaults?.name ?? "Your name"}
                className="mt-2 w-full bg-paper-warm/40 border-2 border-ink-bleed focus:border-terracotta rounded-xl px-4 py-3.5 font-serif text-xl text-graphite outline-none transition-colors"
              />
            </div>
          )}

          {current === "location" && (
            <div className="flex-1 flex flex-col gap-4 animate-in fade-in duration-300">
              <p className="font-hand text-base text-terracotta">step 2 of 5</p>
              <h2 className="font-serif text-2xl text-graphite leading-tight">Where do you live?</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-graphite-light font-semibold mb-1 block">🌏 Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value.slice(0, 60))}
                    placeholder={defaults?.country ?? "Country"}
                    className="w-full bg-paper-warm/40 border-2 border-ink-bleed focus:border-terracotta rounded-xl px-4 py-3 text-base text-graphite outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-graphite-light font-semibold mb-1 block">🏙️ City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value.slice(0, 60))}
                    placeholder={defaults?.city ?? "City"}
                    className="w-full bg-paper-warm/40 border-2 border-ink-bleed focus:border-terracotta rounded-xl px-4 py-3 text-base text-graphite outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {current === "dob" && (
            <div className="flex-1 flex flex-col gap-4 animate-in fade-in duration-300">
              <p className="font-hand text-base text-terracotta">step 3 of 5</p>
              <h2 className="font-serif text-2xl text-graphite leading-tight">When were you born?</h2>
              <p className="text-sm text-graphite-light">We use this only to tailor your outlook.</p>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                min="1925-01-01"
                className="mt-2 w-full bg-paper-warm/40 border-2 border-ink-bleed focus:border-terracotta rounded-xl px-4 py-3.5 font-serif text-xl text-graphite outline-none transition-colors"
              />
            </div>
          )}

          {current === "photo" && (
            <div className="flex-1 flex flex-col gap-4 animate-in fade-in duration-300">
              <p className="font-hand text-base text-terracotta">step 4 of 5</p>
              <h2 className="font-serif text-2xl text-graphite leading-tight">Add a photo</h2>
              <p className="text-sm text-graphite-light">Optional — but it makes things friendlier.</p>

              <div className="flex flex-col items-center gap-4 mt-2">
                <div className="relative size-32 rounded-full bg-gradient-to-br from-terracotta to-ochre flex items-center justify-center shadow-md overflow-hidden">
                  {photo ? (
                    <img src={photo} alt="You" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="font-serif italic text-paper text-5xl">
                      {(name || defaults?.name || "•")[0]}
                    </span>
                  )}
                </div>

                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => cameraRef.current?.click()}
                    className="flex-1 py-3 bg-graphite text-paper rounded-full text-sm font-semibold shadow-sm hover:-translate-y-0.5 transition-all"
                  >
                    📷 Camera
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 py-3 bg-card border-2 border-graphite text-graphite rounded-full text-sm font-semibold hover:bg-graphite hover:text-paper transition-all"
                  >
                    🖼️ Upload
                  </button>
                </div>
                {photo && (
                  <button
                    onClick={() => setPhoto(null)}
                    className="font-hand text-sm text-graphite-light hover:text-terracotta"
                  >
                    remove photo
                  </button>
                )}
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={onPickFile}
                  className="hidden"
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {current === "summary" && (
            <div className="flex-1 flex flex-col gap-4 animate-in fade-in duration-300">
              <p className="font-hand text-base text-terracotta">all set ✨</p>
              <h2 className="font-serif text-2xl text-graphite leading-tight">Does this look right?</h2>

              <div className="flex items-center gap-4 pt-2">
                <div className="size-16 rounded-full bg-gradient-to-br from-terracotta to-ochre flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
                  {photo ? (
                    <img src={photo} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="font-serif italic text-paper text-2xl">{name[0] ?? "•"}</span>
                  )}
                </div>
                <div>
                  <p className="font-serif text-xl text-graphite leading-tight">{name || "—"}</p>
                  <p className="text-sm text-graphite-light">{[city, country].filter(Boolean).join(", ") || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-dashed border-ink-bleed">
                <SumField label="Date of birth" value={dob ? formatDob(dob) : "—"} />
                <SumField label="Photo" value={photo ? "added ✓" : "skipped"} />
              </div>

              {defaults?.sponsor.exists && (
                <div className="bg-moss/10 border border-moss/30 rounded-xl p-4 mt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="size-2 rounded-full bg-moss animate-pulse" />
                    <p className="font-hand text-base text-moss">good news!</p>
                  </div>
                  <p className="text-sm font-semibold text-graphite">{defaults.sponsor.name}</p>
                  <p className="text-xs text-graphite-light italic">{defaults.sponsor.program}</p>
                </div>
              )}
            </div>
          )}

          {/* Card-level controls */}
          <div className="flex justify-between items-center pt-4 mt-auto">
            <button
              onClick={prev}
              disabled={step === 0}
              className="font-hand text-base text-graphite-light disabled:opacity-30"
            >
              ← back
            </button>
            <p className="font-hand text-sm text-graphite-light italic">swipe →</p>
            {current !== "summary" ? (
              <button
                onClick={next}
                disabled={!canAdvance}
                className="font-hand text-base text-terracotta font-bold disabled:opacity-30"
              >
                next →
              </button>
            ) : (
              <span className="font-hand text-base text-terracotta font-bold">ready ✓</span>
            )}
          </div>
        </div>

        {current === "summary" && (
          <button
            onClick={() => navigate({ to: "/voice" })}
            className="block w-full text-center py-4 bg-terracotta text-paper font-semibold rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Yes, let's begin →
          </button>
        )}

        <p className="font-hand text-base text-graphite-light text-center max-w-[36ch] mx-auto">
          your story stays with you, always.
        </p>
      </div>
    </MobileFrame>
  );
}

function SumField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-graphite-light font-semibold mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-graphite">{value}</p>
    </div>
  );
}

function formatDob(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}
