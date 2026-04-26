import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { fetchResource } from "@/lib/api";

type Confidence = "high" | "low";
type FollowUp = { q: string; options: string[] };
type Skill = {
  id: string;
  name: string;
  translation: string;
  evidenceQuote: string;
  icon: string;
  confidence: Confidence;
  confidenceReason: string;
  followUps: FollowUp[];
  evidencePrompt: string;
};
type OpeningPrompt = { emoji: string; text: string; hint: string };
type SkillsData = {
  openingPrompts: OpeningPrompt[];
  transcript: string;
  skills: Skill[];
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (confidence === "high") {
    return (
      <span className="inline-flex items-center gap-1 bg-moss/15 text-moss text-[11px] font-semibold px-2.5 py-1 rounded-full">
        ✓ confirmed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-ochre/25 text-clay text-[11px] font-semibold px-2.5 py-1 rounded-full">
      ? needs detail
    </span>
  );
}

type Stage =
  | "ask"           // 1. opening question + mic + prompt chips
  | "listening"
  | "thinking"
  | "reveal"        // 2. extracted skills appear
  | "deepDive"      // 3. follow-ups + evidence per skill
  | "done";         // 4. wrap up

export const Route = createFileRoute("/voice")({
  component: VoiceScreen,
});

function VoiceScreen() {
  const [data, setData] = useState<SkillsData | null>(null);
  const [stage, setStage] = useState<Stage>("ask");
  const [revealed, setRevealed] = useState(0);
  const [skillIdx, setSkillIdx] = useState(0);
  // answers keyed by `${skillIdx}-${followUpIdx}` (final) and `rec-${...}` (voice marker)
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, boolean>>({});
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const recordTimer = useRef<number | null>(null);

  useEffect(() => {
    fetchResource<SkillsData>("skillExtraction").then(setData).catch(() => setData(null));
    return () => {
      timers.current.forEach(clearTimeout);
      if (recordTimer.current) clearTimeout(recordTimer.current);
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Speak the question aloud using the browser's built-in TTS.
  const playQuestion = (text: string, key: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (playingKey === key) {
      setPlayingKey(null);
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    utter.pitch = 1.05;
    utter.onend = () => setPlayingKey((k) => (k === key ? null : k));
    utter.onerror = () => setPlayingKey(null);
    setPlayingKey(key);
    window.speechSynthesis.speak(utter);
  };

  // Mock voice reply — after a short "listening" window, pick the first option
  // as the stand-in transcript so the demo flows without real STT wiring.
  const toggleRecord = (key: string) => {
    if (recordingKey === key) {
      setRecordingKey(null);
      if (recordTimer.current) clearTimeout(recordTimer.current);
      return;
    }
    if (recordTimer.current) clearTimeout(recordTimer.current);
    setRecordingKey(key);
    recordTimer.current = window.setTimeout(() => {
      // key format: `${originalSkillIdx}-${followUpIdx}`
      const [si, fi] = key.split("-").map(Number);
      const opt = data?.skills[si]?.followUps[fi]?.options[0] ?? "Yes";
      setAnswers((p) => ({ ...p, [key]: opt, [`rec-${key}`]: opt }));
      setRecordingKey(null);
    }, 2200);
  };

  const startListening = () => {
    if (!data) return;
    setStage("listening");
    setRevealed(0);
    timers.current.push(window.setTimeout(() => setStage("thinking"), 1800));
    timers.current.push(window.setTimeout(() => {
      setStage("reveal");
      data.skills.forEach((_, i) => {
        timers.current.push(window.setTimeout(() => setRevealed(i + 1), 600 * (i + 1)));
      });
    }, 3000));
  };

  // Only low-confidence skills need a deep-dive. High-confidence ones are auto-confirmed.
  const lowConfIdxs = useMemo(
    () => (data ? data.skills.map((s, i) => (s.confidence === "low" ? i : -1)).filter((i) => i >= 0) : []),
    [data]
  );
  const currentOrigIdx = lowConfIdxs[skillIdx];
  const currentSkill = currentOrigIdx != null ? data?.skills[currentOrigIdx] : undefined;
  const skillAnswered = currentSkill
    ? currentSkill.followUps.every((_, fi) => answers[`${currentOrigIdx}-${fi}`])
    : false;

  const goNextSkill = () => {
    if (skillIdx < lowConfIdxs.length - 1) setSkillIdx(skillIdx + 1);
    else setStage("done");
  };

  // Auto-skip the deep-dive entirely if every skill is already high-confidence.
  const enterDeepDive = () => {
    if (lowConfIdxs.length === 0) setStage("done");
    else {
      setSkillIdx(0);
      setStage("deepDive");
    }
  };


  return (
    <MobileFrame>
      <div className="flex flex-col gap-6 pb-4">
        {/* Progress ribbon */}
        <ProgressRibbon stage={stage} />

        {/* ═══════════ STAGE 1 — ASK ═══════════ */}
        {(stage === "ask" || stage === "listening" || stage === "thinking") && data && (
          <section className="space-y-5 animate-in fade-in duration-500">
            <div className="space-y-2">
              
              <h1 className="font-serif text-[26px] leading-[1.15] text-graphite">
                What do you do <span className="italic squiggle">in your day</span>?
              </h1>
              <p className="text-[14px] text-graphite-light leading-relaxed">
                Any work counts — at home, in a shop, on the road, in a field.
                Big or small. Just talk, like you would to a friend.
              </p>
            </div>

            {/* Mic — central */}
            <div className="bg-gradient-to-br from-ochre/15 via-card to-terracotta/10 sticker p-7 flex flex-col items-center gap-4">
              <button
                onClick={startListening}
                disabled={stage !== "ask"}
                className={`size-32 rounded-full flex items-center justify-center transition-all shadow-lg ${
                  stage === "listening"
                    ? "bg-terracotta text-paper animate-pulse scale-110"
                    : stage === "thinking"
                    ? "bg-ochre text-graphite"
                    : "bg-gradient-to-br from-terracotta to-ochre text-paper hover:scale-105"
                }`}
                aria-label="Start recording"
              >
                <MicIcon className="size-12" />
              </button>
              <p className="font-hand text-lg text-graphite text-center">
                {stage === "listening" && "i'm listening… 🎙️"}
                {stage === "thinking" && "let me think about that…"}
              </p>
            </div>

            {/* Prompt chips */}
            {stage === "ask" && (
              <div className="space-y-2.5">
                <p className="font-hand text-base text-graphite-light">
                  not sure where to start? try one of these…
                </p>
                <div className="flex flex-col gap-2">
                  {data.openingPrompts.map((chip) => (
                    <button
                      key={chip.text}
                      onClick={startListening}
                      className="text-left bg-card sticker px-4 py-3 flex items-center gap-3 hover:-translate-y-0.5 hover:bg-ochre/10 transition-all"
                    >
                      <span className="text-2xl">{chip.emoji}</span>
                      <div className="flex-1">
                        <p className="font-serif italic text-graphite text-[15px] leading-tight">
                          "{chip.text}"
                        </p>
                        <p className="text-[11px] text-graphite-light mt-0.5">{chip.hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ═══════════ STAGE 2 — REVEAL EXTRACTED SKILLS ═══════════ */}
        {stage === "reveal" && data && (
          <section className="space-y-4 animate-in fade-in duration-500">
            <div>
              <p className="font-hand text-lg text-moss">we hear you 🌿</p>
              <h2 className="font-serif text-[24px] leading-tight text-graphite">
                Here's what we noticed —
                <br />
                <span className="italic">you have real skills.</span>
              </h2>
            </div>

            {/* Transcript echo */}
            <div className="bg-paper-warm/60 rounded-2xl p-3 border-l-2 border-terracotta/40">
              <p className="font-hand text-xs text-graphite-light mb-1">you said…</p>
              <p className="text-[13px] italic text-graphite leading-relaxed">
                "{data.transcript}"
              </p>
            </div>

            {/* Extracted skill stickers */}
            <div className="space-y-3">
              {data.skills.slice(0, revealed).map((s, i) => (
                <div
                  key={s.id}
                  className="bg-card sticker p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-500"
                  style={{ transform: `rotate(${i % 2 === 0 ? "-0.5deg" : "0.5deg"})` }}
                >
                  <div className="size-12 rounded-full bg-ochre/20 flex items-center justify-center text-2xl flex-shrink-0">
                    {s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-serif text-[17px] leading-tight text-graphite">
                        {s.name}
                      </h3>
                      <ConfidenceBadge confidence={s.confidence} />
                    </div>
                    <p className="text-[12px] text-graphite-light italic mt-0.5">
                      {s.translation}
                    </p>
                    <p className="text-[12px] text-graphite mt-1.5 border-l-2 border-ochre/50 pl-2 italic">
                      from: "{s.evidenceQuote}"
                    </p>
                    <p className="text-[11px] text-graphite-light mt-1.5 leading-relaxed">
                      {s.confidence === "high" ? "✓ " : "? "}
                      {s.confidenceReason}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {revealed === data.skills.length && (
              <div className="space-y-2 animate-in fade-in duration-700">
                {lowConfIdxs.length > 0 ? (
                  <>
                    <p className="font-hand text-sm text-graphite-light text-center">
                      {lowConfIdxs.length} skill{lowConfIdxs.length > 1 ? "s" : ""} need a bit more detail
                    </p>
                    <button
                      onClick={enterDeepDive}
                      className="w-full py-4 bg-terracotta text-paper font-semibold rounded-full shadow-md hover:-translate-y-0.5 transition-all"
                    >
                      Help us verify {lowConfIdxs.length} skill{lowConfIdxs.length > 1 ? "s" : ""} →
                    </button>
                  </>
                ) : (
                  <button
                    onClick={enterDeepDive}
                    className="w-full py-4 bg-moss text-paper font-semibold rounded-full shadow-md hover:-translate-y-0.5 transition-all"
                  >
                    All clear — see your outlook →
                  </button>
                )}
              </div>
            )}
          </section>
        )}


        {/* ═══════════ STAGE 3 — DEEP DIVE PER SKILL ═══════════ */}
        {stage === "deepDive" && currentSkill && data && (
          <section className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500" key={skillIdx}>
            {/* Skill counter — only counts skills that need verification */}
            <div className="flex items-center justify-between">
              <p className="font-hand text-base text-graphite-light">
                verifying {skillIdx + 1} of {lowConfIdxs.length}
              </p>
              <div className="flex gap-1.5">
                {lowConfIdxs.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === skillIdx
                        ? "w-6 bg-terracotta"
                        : i < skillIdx
                        ? "w-1.5 bg-moss"
                        : "w-1.5 bg-graphite/15"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Skill header */}
            <div className="bg-card sticker p-4 flex items-start gap-3">
              <div className="size-14 rounded-full bg-ochre/20 flex items-center justify-center text-3xl flex-shrink-0">
                {currentSkill.icon}
              </div>
              <div className="flex-1">
                <p className="font-hand text-sm text-clay">we want to verify…</p>
                <h2 className="font-serif text-xl text-graphite leading-tight">
                  {currentSkill.name}
                </h2>
                <p className="text-[12px] text-graphite-light italic mt-1 leading-snug">
                  {currentSkill.confidenceReason}
                </p>
              </div>
            </div>

            {/* Follow-up questions — voice-first */}
            <div className="space-y-3">
              {currentSkill.followUps.map((fu, fi) => {
                const key = `${currentOrigIdx}-${fi}`;
                const recKey = `rec-${key}`;
                const isPlaying = playingKey === key;
                const isRecording = recordingKey === key;
                const hasVoiceReply = !!answers[recKey];
                return (
                  <div key={fi} className="bg-card sticker p-4 space-y-3">
                    {/* Question + play button */}
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => playQuestion(fu.q, key)}
                        aria-label="Play question"
                        className={`size-11 rounded-full flex-shrink-0 flex items-center justify-center transition-all shadow-sm ${
                          isPlaying
                            ? "bg-terracotta text-paper animate-pulse"
                            : "bg-ochre/30 text-clay hover:bg-ochre/50 hover:scale-105"
                        }`}
                      >
                        {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
                      </button>
                      <div className="flex-1 pt-0.5">
                        <p className="font-serif text-[15px] text-graphite leading-snug">
                          {fu.q}
                        </p>
                      </div>
                    </div>

                    {/* Voice reply — primary action */}
                    <button
                      onClick={() => toggleRecord(key)}
                      className={`w-full rounded-2xl py-3 px-4 flex items-center justify-center gap-2 transition-all ${
                        isRecording
                          ? "bg-terracotta text-paper shadow-md scale-[1.02]"
                          : hasVoiceReply
                          ? "bg-moss/20 text-graphite border border-moss/40"
                          : "bg-gradient-to-r from-terracotta/15 to-ochre/15 text-graphite hover:from-terracotta/25 hover:to-ochre/25 border border-terracotta/30"
                      }`}
                    >
                      <MicIcon className={`size-5 ${isRecording ? "animate-pulse" : ""}`} />
                      <span className="font-serif text-[14px]">
                        {isRecording
                          ? "listening… tap to stop"
                          : hasVoiceReply
                          ? `✓ "${answers[recKey]}" — tap to redo`
                          : "Tap and answer in your own words"}
                      </span>
                    </button>

                    {/* Quick-pick fallback */}
                    <div className="space-y-1.5">
                      <p className="font-hand text-xs text-graphite-light text-center">
                        or just tap an answer
                      </p>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {fu.options.map((opt) => {
                          const selected = answers[key] === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => setAnswers((p) => ({ ...p, [key]: opt }))}
                              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-all ${
                                selected
                                  ? "bg-terracotta text-paper shadow-sm scale-105"
                                  : "bg-paper-warm text-graphite-light hover:bg-ochre/20 hover:text-graphite"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Evidence */}
            <div className="bg-ochre/10 border-2 border-dashed border-ochre/50 rounded-2xl p-4 space-y-3">
              <div>
                <p className="font-hand text-base text-clay">show us, if you can 📸</p>
                <p className="font-serif text-[15px] text-graphite leading-snug">
                  {currentSkill.evidencePrompt}
                </p>
              </div>
              {!evidence[currentSkill.id] ? (
                <label className="block cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={() => setEvidence((p) => ({ ...p, [currentSkill.id]: true }))}
                  />
                  <div className="bg-paper border border-ochre/40 rounded-xl py-3 flex items-center justify-center gap-2 hover:bg-ochre/10 transition-all">
                    <CameraIcon className="size-5 text-clay" />
                    <span className="font-serif text-sm text-graphite">Take or choose a photo</span>
                  </div>
                </label>
              ) : (
                <div className="bg-moss/15 rounded-xl py-2.5 px-3 flex items-center gap-2">
                  <span className="text-base">✓</span>
                  <span className="font-serif text-sm text-graphite">photo added — thank you</span>
                  <button
                    onClick={() => setEvidence((p) => ({ ...p, [currentSkill.id]: false }))}
                    className="ml-auto text-[12px] text-graphite-light underline"
                  >
                    remove
                  </button>
                </div>
              )}
            </div>

            {/* Next */}
            <div className="flex gap-2">
              <button
                onClick={goNextSkill}
                className="flex-1 py-3.5 bg-paper-warm text-graphite-light font-medium rounded-full hover:bg-ochre/15 transition-all text-sm"
              >
                Skip
              </button>
              <button
                onClick={goNextSkill}
                disabled={!skillAnswered}
                className={`flex-[2] py-3.5 font-semibold rounded-full shadow-md transition-all ${
                  skillAnswered
                    ? "bg-terracotta text-paper hover:-translate-y-0.5"
                    : "bg-graphite/15 text-graphite-light cursor-not-allowed"
                }`}
              >
                {skillIdx < lowConfIdxs.length - 1 ? "Next skill →" : "Finish ✓"}
              </button>
            </div>
          </section>
        )}

        {/* ═══════════ STAGE 4 — DONE ═══════════ */}
        {stage === "done" && data && (
          <section className="space-y-5 animate-in fade-in duration-500 text-center">
            <div className="text-6xl">🌟</div>
            <div className="space-y-2">
              <p className="font-hand text-xl text-moss">all done — thank you</p>
              <h2 className="font-serif text-[26px] leading-tight text-graphite">
                You shared <span className="italic squiggle">{data.skills.length} real skills</span>
              </h2>
              <p className="text-[14px] text-graphite-light leading-relaxed">
                That's more than most people can name about themselves.
                Now let's see what your future could look like.
              </p>
            </div>

            <div className="bg-card sticker p-4 space-y-2 text-left">
              {data.skills.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="text-xl">{s.icon}</span>
                  <span className="font-serif text-[15px] text-graphite flex-1">{s.name}</span>
                  <span className="text-moss text-sm">✓</span>
                </div>
              ))}
            </div>

            <Link
              to="/readiness"
              className="block w-full text-center py-4 bg-terracotta text-paper font-semibold rounded-full shadow-md hover:-translate-y-0.5 transition-all"
            >
              See your outlook →
            </Link>
          </section>
        )}
      </div>
    </MobileFrame>
  );
}

function ProgressRibbon({ stage }: { stage: Stage }) {
  const steps = [
    { key: "ask", label: "Talk", active: ["ask", "listening", "thinking"].includes(stage) },
    { key: "reveal", label: "Discover", active: stage === "reveal" },
    { key: "deepDive", label: "Deepen", active: stage === "deepDive" },
    { key: "done", label: "Done", active: stage === "done" },
  ];
  const activeIdx = steps.findIndex((s) => s.active);
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono-label text-graphite-light">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span
            className={`px-2 py-1 rounded-full transition-all ${
              i === activeIdx
                ? "bg-terracotta text-paper"
                : i < activeIdx
                ? "bg-moss/20 text-moss"
                : "bg-paper-warm"
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-graphite/30">·</span>}
        </div>
      ))}
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
