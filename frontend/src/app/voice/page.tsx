"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WaveformBars } from "@/components/WaveformBars";
import { LogoIcon } from "@/components/Logo";
import { sendChatMessage, getTextToSpeech } from "@/lib/api";

type AgentState = "idle" | "listen" | "think" | "speak" | "error";

interface Exchange {
  userText: string;
  agentText: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Web Speech API type augmentation
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

// ---------------------------------------------------------------------------
// Mic pulse rings — render behind the mic button when listening
// ---------------------------------------------------------------------------
function PulseRings({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      {[1.4, 1.7, 2.1].map((scale, i) => (
        <span
          key={i}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: "var(--accent)",
            opacity: 0.07 - i * 0.02,
            transform: `scale(${scale})`,
            animation: `ping 1.6s cubic-bezier(0,0,0.2,1) ${i * 250}ms infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes ping {
          0% { transform: scale(${1}); opacity: 0.12; }
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// State config
// ---------------------------------------------------------------------------
const STATE_CONFIG: Record<
  AgentState,
  { label: string; hint: string; color: string }
> = {
  idle: {
    label: "Ready",
    hint: "Tap the mic to speak",
    color: "var(--foreground-muted)",
  },
  listen: {
    label: "Listening…",
    hint: "Speak naturally — I'm hearing you",
    color: "var(--accent)",
  },
  think: {
    label: "Thinking…",
    hint: "Claude is processing your request",
    color: "var(--warning)",
  },
  speak: {
    label: "Speaking",
    hint: "Tap mic to interrupt",
    color: "var(--success)",
  },
  error: {
    label: "Error",
    hint: "Something went wrong — tap to try again",
    color: "var(--error)",
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function VoicePage() {
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [transcript, setTranscript] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check browser support
  useEffect(() => {
    if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      setSupported(false);
    }
  }, []);

  // Scroll transcript to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [exchanges]);

  // Stop audio when starting to listen
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const handleTranscriptFinal = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setAgentState("idle");
        return;
      }

      setAgentState("think");
      setTranscript("");
      startTimeRef.current = performance.now();

      try {
        const chatData = await sendChatMessage(text, conversationId);
        setConversationId(chatData.conversation_id);
        const latencyMs = Math.round(performance.now() - startTimeRef.current);

        setAgentState("speak");

        // TTS
        try {
          const audioBuffer = await getTextToSpeech(chatData.response);
          const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onended = () => {
            setAgentState("idle");
            URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setAgentState("idle");
            URL.revokeObjectURL(url);
          };
          await audio.play();
        } catch {
          // TTS failed — still show response
          setAgentState("idle");
        }

        setExchanges((prev) => [
          ...prev,
          { userText: text, agentText: chatData.response, latencyMs },
        ]);
      } catch (e) {
        console.error(e);
        setAgentState("error");
        setTimeout(() => setAgentState("idle"), 2500);
      }
    },
    [conversationId]
  );

  const startListening = useCallback(() => {
    stopAudio();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onstart = () => setAgentState("listen");

    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim += t;
        }
      }
      setTranscript(finalTranscript || interim);
    };

    recognition.onerror = () => {
      setAgentState("idle");
      setTranscript("");
    };

    recognition.onend = () => {
      if (finalTranscript.trim()) {
        handleTranscriptFinal(finalTranscript.trim());
      } else {
        setAgentState("idle");
        setTranscript("");
      }
    };

    recognition.start();
  }, [stopAudio, handleTranscriptFinal]);

  const handleMicClick = () => {
    if (agentState === "listen") {
      recognitionRef.current?.stop();
      return;
    }
    if (agentState === "speak") {
      stopAudio();
      setAgentState("idle");
      return;
    }
    if (agentState === "idle" || agentState === "error") {
      startListening();
    }
  };

  const cfg = STATE_CONFIG[agentState];

  const micBg =
    agentState === "listen"
      ? "var(--accent)"
      : agentState === "speak"
        ? "var(--success)"
        : agentState === "think"
          ? "var(--surface-overlay)"
          : agentState === "error"
            ? "var(--error)"
            : "var(--surface-raised)";

  const micColor =
    agentState === "idle"
      ? "var(--foreground-muted)"
      : "#ffffff";

  return (
    <div
      className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center"
      style={{ background: "var(--surface)" }}
    >
      {/* ── Floating hero card ── */}
      <div className="w-full max-w-lg px-4 pt-12">
        <div
          className="rounded-3xl p-8 text-center"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <div style={{ color: "var(--accent)" }}>
              <LogoIcon size={48} />
            </div>
          </div>

          {/* Status label */}
          <p
            className="text-[11px] font-semibold uppercase tracking-widest transition-colors duration-300"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </p>

          {/* Waveform */}
          <div className="my-5 flex justify-center">
            <WaveformBars
              active={agentState !== "idle"}
              mode={agentState === "error" ? "idle" : agentState}
              bars={11}
              maxHeight={44}
              barWidth={3}
              gap={4}
            />
          </div>

          {/* Mic button */}
          <div className="relative flex justify-center">
            <div className="relative">
              <PulseRings active={agentState === "listen"} />
              <button
                onClick={handleMicClick}
                disabled={agentState === "think"}
                className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-all duration-300"
                style={{
                  background: micBg,
                  boxShadow:
                    agentState === "listen"
                      ? "0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)"
                      : agentState === "speak"
                        ? "0 0 0 3px color-mix(in srgb, var(--success) 30%, transparent)"
                        : "var(--shadow-md)",
                  color: micColor,
                }}
              >
                {agentState === "think" ? (
                  /* Spinner */
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    className="animate-spin"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20" />
                  </svg>
                ) : agentState === "speak" ? (
                  /* Speaker wave icon */
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                ) : (
                  /* Microphone icon */
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Hint + live transcript */}
          <div className="mt-5 min-h-[36px]">
            {transcript ? (
              <p
                className="text-sm italic leading-snug transition-all"
                style={{ color: "var(--foreground-muted)" }}
              >
                &ldquo;{transcript}&rdquo;
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                {supported
                  ? cfg.hint
                  : "Speech recognition not supported — use Chrome or Edge"}
              </p>
            )}
          </div>
        </div>

        {/* ── Conversation transcript ── */}
        {exchanges.length > 0 && (
          <div
            ref={scrollRef}
            className="mt-4 max-h-[40vh] overflow-y-auto rounded-2xl"
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {exchanges.map((ex, i) => (
              <div
                key={i}
                className="border-b p-4 last:border-0"
                style={{ borderColor: "var(--border)" }}
              >
                {/* User */}
                <div className="mb-3 flex justify-end">
                  <div
                    className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm"
                    style={{
                      background: "var(--user-bubble)",
                      color: "var(--foreground)",
                    }}
                  >
                    {ex.userText}
                  </div>
                </div>
                {/* Agent */}
                <div className="flex gap-2.5">
                  <div
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    <LogoIcon size={14} />
                  </div>
                  <div>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                      {ex.agentText}
                    </p>
                    {ex.latencyMs && (
                      <p className="mt-1 text-[10px]" style={{ color: "var(--foreground-muted)" }}>
                        {ex.latencyMs}ms
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        <p className="mt-4 pb-8 text-center text-[11px]" style={{ color: "var(--foreground-muted)" }}>
          Claude on AWS Bedrock &middot; MiniMax TTS &middot; Datadog LLM Observability
        </p>
      </div>
    </div>
  );
}
