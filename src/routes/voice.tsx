import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { fetchResource } from "@/lib/api";
import { savePassportSkillPrefill } from "@/lib/passportPrefill";
import { saveConversationSkills } from "@/lib/conversationSkills";

type Confidence = "high" | "low";
type FollowUp = { q: string; options: string[] };
type Skill = {
  id: string;
  name: string;
  iscoCode?: string;
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

type ApiSkill = {
  name?: string;
  isco_code?: string;
  isco_title?: string;
  evidence?: string;
  confidence?: string;
  related_esco_skills?: string[];
  verification_questions?: string[];
  assessment_notes?: string;
};

type ApiSkillExtractionResponse = {
  skills?: ApiSkill[];
  follow_up_questions?: string[];
};

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    [index: number]: SpeechRecognitionResultLike;
    length: number;
  };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const ICONS = ["🛠️", "🧠", "📦", "🧾", "🧰", "🚚", "🖥️", "📊"];
const DEFAULT_OPENING_PROMPTS: OpeningPrompt[] = [
  { emoji: "🏪", text: "I help at my family's shop", hint: "selling, stocking, talking to customers" },
  { emoji: "🛵", text: "I drive people or deliver things", hint: "rideshare, truck, delivery" },
  { emoji: "🔧", text: "I fix or build things with my hands", hint: "repair, construction, crafts" },
];

function pickIcon(skillName: string, idx: number): string {
  const name = skillName.toLowerCase();
  if (name.includes("drive") || name.includes("transport")) return "🛵";
  if (name.includes("cook") || name.includes("food")) return "🍲";
  if (name.includes("customer") || name.includes("service")) return "👋";
  if (name.includes("stock") || name.includes("inventory")) return "📦";
  return ICONS[idx % ICONS.length];
}

function mapApiToVoiceData(
  api: ApiSkillExtractionResponse,
  transcript: string,
  openingPrompts: OpeningPrompt[],
  fallbackSkills: Skill[]
): SkillsData {
  const normalized = Array.isArray(api.skills)
    ? api.skills
        .map((s, idx) => {
          const name = String(s.name ?? "").trim();
          if (!name) return null;
          const confidenceWord = String(s.confidence ?? "").toLowerCase();
          const confidence: Confidence = confidenceWord === "high" ? "high" : "low";
          const related = Array.isArray(s.related_esco_skills) ? s.related_esco_skills : [];
          const verification = Array.isArray(s.verification_questions)
            ? s.verification_questions.filter(Boolean).slice(0, 2)
            : [];
          const followUps = [
            {
              q:
                verification[0] ??
                api.follow_up_questions?.[idx] ??
                `Can you share one concrete task where you use ${name}?`,
              options: ["Daily", "Sometimes", "Rarely"],
            },
            {
              q:
                verification[1] ??
                `How confident are you doing ${name} on your own?`,
              options: ["Very", "Somewhat", "Need support"],
            },
          ];
          return {
            id: `api_skl_${idx + 1}`,
            name,
            iscoCode: String(s.isco_code ?? "").trim() || undefined,
            translation: String(s.isco_title ?? related[0] ?? "Work skill identified from your speech."),
            evidenceQuote: String(s.evidence ?? "Captured from your voice transcript"),
            icon: pickIcon(name, idx),
            confidence,
            confidenceReason:
              String(s.assessment_notes ?? "").trim() ||
              "Preliminary match from conversation; verify in the next step.",
            followUps,
            evidencePrompt: `Any proof of ${name} (photo, sample, or reference).`,
          } satisfies Skill;
        })
        .filter((s): s is Skill => s !== null)
    : [];

  return {
    openingPrompts,
    transcript,
    skills: normalized.length ? normalized : fallbackSkills,
  };
}

function toPassportPrefillSkills(skills: Skill[]) {
  const year = String(new Date().getFullYear());
  return skills.map((s, idx) => ({
    id: `voice_${idx + 1}`,
    name: s.name,
    translation: s.translation,
    icon: s.icon,
    evidence: [
      {
        where: "Conversation capture",
        city: "Self-reported",
        from: year,
        to: "present",
        duration: "in-progress verification",
        detail: s.evidenceQuote || "Captured during voice conversation.",
      },
    ],
  }));
}

async function postSkillExtraction(transcript: string): Promise<ApiSkillExtractionResponse> {
  const response = await fetch("/api/skills/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  if (!response.ok) {
    throw new Error(`Skill extraction failed (${response.status})`);
  }
  return (await response.json()) as ApiSkillExtractionResponse;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [debugLastEvent, setDebugLastEvent] = useState("idle");
  const [debugLastError, setDebugLastError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("ask");
  const [revealed, setRevealed] = useState(0);
  const [skillIdx, setSkillIdx] = useState(0);
  // answers keyed by `${skillIdx}-${followUpIdx}`
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, boolean>>({});
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const openingPromptsRef = useRef<OpeningPrompt[]>([]);
  const fallbackSkillsRef = useRef<Skill[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stillListeningRef = useRef(false);
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    fetchResource<SkillsData>("skillExtraction")
      .then((seed) => {
        setData(seed);
        openingPromptsRef.current = seed.openingPrompts ?? [];
        fallbackSkillsRef.current = seed.skills ?? [];
      })
      .catch(() => {
        setData({
          openingPrompts: DEFAULT_OPENING_PROMPTS,
          transcript: "",
          skills: [],
        });
        openingPromptsRef.current = DEFAULT_OPENING_PROMPTS;
        fallbackSkillsRef.current = [];
        setVoiceError("Could not load demo prompts. You can still type or use mic.");
      });
    setVoiceSupported(getSpeechRecognitionCtor() !== null);
    return () => {
      timers.current.forEach(clearTimeout);
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      try {
        stillListeningRef.current = false;
        recognitionRef.current?.abort();
      } catch {
        // no-op
      }
    };
  }, []);

  const startListening = useCallback(
    async (seedText?: string) => {
      // Prompt chips still support direct text path.
      if (seedText?.trim()) {
        setVoiceError(null);
        setLiveTranscript(seedText.trim());
        setDebugLastEvent("seed_text_used");
        setStage("thinking");
        const api = await postSkillExtraction(seedText.trim());
        const next = mapApiToVoiceData(
          api,
          seedText.trim(),
          openingPromptsRef.current,
          fallbackSkillsRef.current
        );
        setData(next);
        saveConversationSkills(
          next.skills.map((s) => ({
            name: s.name,
            isco_code: s.iscoCode,
          }))
        );
        savePassportSkillPrefill(toPassportPrefillSkills(next.skills));
        setStage("reveal");
        next.skills.forEach((_, i) => {
          timers.current.push(window.setTimeout(() => setRevealed(i + 1), 600 * (i + 1)));
        });
        return;
      }

      if (stage === "ask") {
        const Ctor = getSpeechRecognitionCtor();
        if (!Ctor) {
          setVoiceError("Speech recognition is not supported in this browser.");
          return;
        }
        setVoiceError(null);
        setLiveTranscript("");
        finalTranscriptRef.current = "";
        setDebugLastEvent("recording_started");
        setDebugLastError(null);
        setStage("listening");
        setRevealed(0);
        try {
          const recognition = new Ctor();
          recognition.lang = "en-US";
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onstart = () => {
            setDebugLastEvent("recognition_started");
          };
          recognition.onresult = (event) => {
            let finalText = finalTranscriptRef.current;
            let interimText = "";
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const result = event.results[i];
              const segment = String(result?.[0]?.transcript ?? "").trim();
              if (!segment) continue;
              if (result.isFinal) finalText = `${finalText} ${segment}`.trim();
              else interimText = `${interimText} ${segment}`.trim();
            }
            finalTranscriptRef.current = finalText;
            setLiveTranscript(`${finalText} ${interimText}`.trim());
          };
          recognition.onerror = (event) => {
            const err = String(event?.error ?? "unknown");
            setDebugLastError(err);
            setDebugLastEvent(`recognition_error:${err}`);
          };
          recognition.onend = () => {
            if (stillListeningRef.current) {
              setDebugLastEvent("recognition_restarting");
              try {
                recognition.start();
              } catch (error) {
                setDebugLastError(error instanceof Error ? error.message : "restart_failed");
              }
            } else {
              setDebugLastEvent("recognition_ended");
            }
          };
          recognitionRef.current = recognition;
          stillListeningRef.current = true;
          recognition.start();
        } catch (error) {
          stillListeningRef.current = false;
          setStage("ask");
          setVoiceError(error instanceof Error ? error.message : "Unable to start recording.");
        }
        return;
      }

      if (stage === "listening") {
        setDebugLastEvent("recording_stopped");
        stillListeningRef.current = false;
        try {
          recognitionRef.current?.stop();
        } catch {
          // no-op
        }
        setStage("thinking");
        try {
          const transcript = String(finalTranscriptRef.current || liveTranscript).trim();
          if (!transcript) throw new Error("No speech captured. Please try again.");
          setLiveTranscript(transcript);
          const api = await postSkillExtraction(transcript);
          const next = mapApiToVoiceData(
            api,
            transcript,
            openingPromptsRef.current,
            fallbackSkillsRef.current
          );
          setData(next);
          saveConversationSkills(
            next.skills.map((s) => ({
              name: s.name,
              isco_code: s.iscoCode,
            }))
          );
          savePassportSkillPrefill(toPassportPrefillSkills(next.skills));
          setStage("reveal");
          next.skills.forEach((_, i) => {
            timers.current.push(window.setTimeout(() => setRevealed(i + 1), 600 * (i + 1)));
          });
        } catch (error) {
          setDebugLastEvent("capture_failed");
          setStage("ask");
          setVoiceError(error instanceof Error ? error.message : "Could not capture voice input.");
        }
      }
    },
    [liveTranscript, stage, voiceSupported]
  );

  const stopListening = useCallback(() => {
    void startListening();
  }, [startListening]);

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
      return;
    }
    setRecordingKey(key);
  };

  // Only medium/lower confidence skills require verification.
  const verifyIdxs = useMemo(
    () => (data ? data.skills.map((s, i) => (s.confidence === "low" ? i : -1)).filter((i) => i >= 0) : []),
    [data]
  );
  const currentOrigIdx = verifyIdxs[skillIdx];
  const currentSkill = currentOrigIdx != null ? data?.skills[currentOrigIdx] : undefined;
  const skillAnswered = currentSkill
    ? currentSkill.followUps.every((_, fi) => answers[`${currentOrigIdx}-${fi}`])
    : false;

  const goNextSkill = () => {
    if (skillIdx < verifyIdxs.length - 1) setSkillIdx(skillIdx + 1);
    else setStage("done");
  };

  const enterDeepDive = () => {
    if (verifyIdxs.length === 0) setStage("done");
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
              {voiceError && (
                <p className="text-[12px] text-terracotta">{voiceError}</p>
              )}
              {!voiceSupported && (
                <p className="text-[12px] text-graphite-light">
                  Mic transcription is not available here. Tap a prompt chip to continue with text.
                </p>
              )}
            </div>

            {/* Mic — central */}
            <div className="bg-gradient-to-br from-ochre/15 via-card to-terracotta/10 sticker p-7 flex flex-col items-center gap-4">
              <button
                onClick={() => {
                  if (stage === "listening") {
                    stopListening();
                  } else if (stage === "ask") {
                    void startListening();
                  }
                }}
                disabled={stage === "thinking"}
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
                {stage === "listening" && "i'm listening… tap mic again to stop 🎙️"}
                {stage === "thinking" && "let me think about that…"}
              </p>
              {stage === "listening" && (
                <button
                  onClick={stopListening}
                  className="px-4 py-1.5 rounded-full text-[12px] font-semibold bg-paper-warm text-graphite border border-ink-bleed hover:bg-paper"
                >
                  Stop listening
                </button>
              )}
              {(stage === "listening" || stage === "thinking") && liveTranscript && (
                <div className="w-full bg-paper-warm/70 rounded-xl border border-ink-bleed p-3">
                  <p className="text-[10px] text-graphite-light uppercase tracking-wider">Live transcript</p>
                  <p className="text-[12px] text-graphite leading-relaxed">{liveTranscript}</p>
                </div>
              )}
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
                      onClick={() => void startListening(chip.text)}
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
                {verifyIdxs.length > 0 ? (
                  <>
                    <p className="font-hand text-sm text-graphite-light text-center">
                      {verifyIdxs.length} skill{verifyIdxs.length > 1 ? "s" : ""} need verification
                    </p>
                    <button
                      onClick={enterDeepDive}
                      className="w-full py-4 bg-terracotta text-paper font-semibold rounded-full shadow-md hover:-translate-y-0.5 transition-all"
                    >
                      Verify captured skills →
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
                verifying {skillIdx + 1} of {verifyIdxs.length}
              </p>
              <div className="flex gap-1.5">
                {verifyIdxs.map((_, i) => (
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
                const isPlaying = playingKey === key;
                const isRecording = recordingKey === key;
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
                          : "bg-gradient-to-r from-terracotta/15 to-ochre/15 text-graphite hover:from-terracotta/25 hover:to-ochre/25 border border-terracotta/30"
                      }`}
                    >
                      <MicIcon className={`size-5 ${isRecording ? "animate-pulse" : ""}`} />
                      <span className="font-serif text-[14px]">
                        {isRecording
                          ? "listening… tap to stop"
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
                {skillIdx < verifyIdxs.length - 1 ? "Next skill →" : "Finish ✓"}
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
