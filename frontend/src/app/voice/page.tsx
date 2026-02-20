"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WaveformBars } from "@/components/WaveformBars";
import { LogoIcon } from "@/components/Logo";
import { sendChatMessage, getTextToSpeechStream } from "@/lib/api";

type AgentState = "idle" | "listen" | "think" | "speak" | "error";

interface Exchange {
  userText: string;
  agentText: string;
  latencyMs?: number;
  model?: string;
  modelProvider?: string;
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

// ---------------------------------------------------------------------------
// Pulse rings — shown behind mic button when listening
// ---------------------------------------------------------------------------
function PulseRings({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      {[1.4, 1.8, 2.3].map((scale, i) => (
        <span
          key={i}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: "var(--accent)",
            opacity: 0.08 - i * 0.02,
            animation: `ov-ping 1.8s cubic-bezier(0,0,0.2,1) ${i * 300}ms infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes ov-ping {
          0%   { transform: scale(1);      opacity: 0.12; }
          80%, 100% { transform: scale(${2.4}); opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// Model provider pill
// ---------------------------------------------------------------------------
function ModelPill({ provider, model }: { provider: string; model: string }) {
  const isAWS     = provider === "AWS Bedrock";
  const isMiniMax = provider === "MiniMax";
  const color = isAWS
    ? { bg: "color-mix(in srgb, #f90 12%, transparent)", text: "#d97706" }
    : isMiniMax
      ? { bg: "color-mix(in srgb, var(--accent) 12%, transparent)", text: "var(--accent)" }
      : { bg: "var(--surface-overlay)", text: "var(--foreground-muted)" };

  const label = isAWS ? "Claude · Bedrock" : isMiniMax ? `MiniMax · ${model}` : provider;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: color.bg, color: color.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color.text }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// State config
// ---------------------------------------------------------------------------
const STATE_CONFIG: Record<AgentState, { label: string; hint: string; color: string }> = {
  idle:   { label: "Ready",      hint: "Tap the mic to speak",              color: "var(--foreground-muted)" },
  listen: { label: "Listening…", hint: "Speak naturally — I'm hearing you", color: "var(--accent)" },
  think:  { label: "Thinking…",  hint: "Processing your request",           color: "var(--warning)" },
  speak:  { label: "Speaking",   hint: "Tap to interrupt",                  color: "var(--success)" },
  error:  { label: "Error",      hint: "Something went wrong — tap to retry", color: "var(--error)" },
};

// ---------------------------------------------------------------------------
// Streaming audio via MediaSource Extensions
// ---------------------------------------------------------------------------
async function playStreamingAudio(
  stream: ReadableStream<Uint8Array>,
  onStart: () => void,
  onEnd: () => void,
  onError: () => void,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
): Promise<void> {
  // Safari doesn't support MediaSource with audio/mpeg in all versions,
  // so we collect stream then play as blob as a safe cross-browser approach.
  // For Chrome/Edge, we use MediaSource for true streaming.
  const supportsMediaSource = typeof MediaSource !== "undefined" &&
    MediaSource.isTypeSupported("audio/mpeg");

  if (supportsMediaSource) {
    return new Promise<void>((resolve) => {
      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        onEnd();
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        onError();
        resolve();
      };

      mediaSource.addEventListener("sourceopen", async () => {
        let sourceBuffer: SourceBuffer;
        try {
          sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        } catch {
          // Fallback to blob if codec not supported
          URL.revokeObjectURL(url);
          const chunks: Uint8Array[] = [];
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const blob = new Blob(chunks, { type: "audio/mpeg" });
          const blobUrl = URL.createObjectURL(blob);
          const a = new Audio(blobUrl);
          audioRef.current = a;
          a.onended = () => { URL.revokeObjectURL(blobUrl); onEnd(); resolve(); };
          a.onerror = () => { URL.revokeObjectURL(blobUrl); onError(); resolve(); };
          await a.play().catch(onError);
          onStart();
          return;
        }

        const reader = stream.getReader();
        let started = false;

        const appendNext = async () => {
          if (sourceBuffer.updating) return;
          const { done, value } = await reader.read();
          if (done) {
            if (!sourceBuffer.updating) {
              try { mediaSource.endOfStream(); } catch { /* already ended */ }
            } else {
              sourceBuffer.addEventListener("updateend", () => {
                try { mediaSource.endOfStream(); } catch { /* already ended */ }
              }, { once: true });
            }
            return;
          }
          if (value && value.length > 0) {
            try {
              sourceBuffer.appendBuffer(value);
              if (!started) {
                started = true;
                audio.play().then(onStart).catch(onError);
              }
            } catch {
              onError();
              resolve();
            }
          } else {
            appendNext();
          }
        };

        sourceBuffer.addEventListener("updateend", appendNext);
        appendNext();
      });
    });
  } else {
    // Collect all chunks then play (Safari / older browsers)
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const blob = new Blob(chunks, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    onStart();
    return new Promise<void>((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); onEnd(); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); onError(); resolve(); };
      audio.play().catch(() => { onError(); resolve(); });
    });
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function VoicePage() {
  const [agentState, setAgentState]   = useState<AgentState>("idle");
  const [transcript, setTranscript]   = useState("");
  const [exchanges, setExchanges]     = useState<Exchange[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [supported, setSupported]     = useState(true);
  const [lastModel, setLastModel]     = useState<{ model: string; provider: string } | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const startTimeRef   = useRef<number>(0);
  const scrollRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      setSupported(false);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [exchanges]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  const handleTranscriptFinal = useCallback(
    async (text: string) => {
      if (!text.trim()) { setAgentState("idle"); return; }

      setAgentState("think");
      setTranscript("");
      startTimeRef.current = performance.now();

      try {
        // 1. LLM call (Bedrock → MiniMax M2.5 fallback)
        const chatData = await sendChatMessage(text, conversationId);
        setConversationId(chatData.conversation_id);
        const llmMs = Math.round(performance.now() - startTimeRef.current);

        const provider = chatData.model_provider ?? "unknown";
        const model    = chatData.model ?? "";
        setLastModel({ model, provider });

        setAgentState("speak");

        // 2. Streaming TTS — speech-2.8-turbo, audio starts in ~200ms
        try {
          const stream = await getTextToSpeechStream(chatData.response);
          await playStreamingAudio(
            stream,
            () => { /* audio started playing — already in speak state */ },
            () => setAgentState("idle"),
            () => setAgentState("idle"),
            audioRef,
          );
        } catch {
          setAgentState("idle");
        }

        setExchanges((prev) => [
          ...prev,
          {
            userText: text,
            agentText: chatData.response,
            latencyMs: llmMs,
            model,
            modelProvider: provider,
          },
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

    recognition.onstart  = () => setAgentState("listen");
    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t;
        else interim += t;
      }
      setTranscript(finalTranscript || interim);
    };
    recognition.onerror = () => { setAgentState("idle"); setTranscript(""); };
    recognition.onend   = () => {
      if (finalTranscript.trim()) handleTranscriptFinal(finalTranscript.trim());
      else { setAgentState("idle"); setTranscript(""); }
    };
    recognition.start();
  }, [stopAudio, handleTranscriptFinal]);

  const handleMicClick = () => {
    if (agentState === "listen") { recognitionRef.current?.stop(); return; }
    if (agentState === "speak")  { stopAudio(); setAgentState("idle"); return; }
    if (agentState === "idle" || agentState === "error") startListening();
  };

  const cfg = STATE_CONFIG[agentState];
  const micBg =
    agentState === "listen" ? "var(--accent)"
    : agentState === "speak"  ? "var(--success)"
    : agentState === "think"  ? "var(--surface-overlay)"
    : agentState === "error"  ? "var(--error)"
    : "var(--surface-raised)";

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center" style={{ background: "var(--surface)" }}>
      <div className="w-full max-w-lg px-4 pt-10">

        {/* ── Hero card ──────────────────────────────────────────────────── */}
        <div
          className="rounded-3xl p-8 text-center"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Logo + model badge row */}
          <div className="mb-5 flex items-center justify-center gap-3">
            <div style={{ color: "var(--accent)" }}>
              <LogoIcon size={42} />
            </div>
            {lastModel && (
              <ModelPill provider={lastModel.provider} model={lastModel.model} />
            )}
          </div>

          {/* State label */}
          <p
            className="text-[11px] font-semibold uppercase tracking-widest transition-colors duration-300"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </p>

          {/* Waveform */}
          <div className="my-5 flex justify-center">
            <WaveformBars
              active={agentState !== "idle" && agentState !== "error"}
              mode={agentState === "error" ? "idle" : agentState}
              bars={13}
              maxHeight={48}
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
                className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full transition-all duration-300"
                style={{
                  background: micBg,
                  boxShadow:
                    agentState === "listen" ? "0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent), var(--shadow-lg)"
                    : agentState === "speak"  ? "0 0 0 3px color-mix(in srgb, var(--success) 30%, transparent), var(--shadow-lg)"
                    : "var(--shadow-md)",
                  color: agentState === "idle" ? "var(--foreground-muted)" : "#fff",
                  cursor: agentState === "think" ? "wait" : "pointer",
                }}
              >
                {agentState === "think" ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" className="animate-spin" style={{ color: "var(--foreground-muted)" }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="55" strokeDashoffset="20" />
                  </svg>
                ) : agentState === "speak" ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Transcript / hint */}
          <div className="mt-5 min-h-[40px] px-2">
            {transcript ? (
              <p className="text-sm italic leading-snug transition-all" style={{ color: "var(--foreground-muted)" }}>
                &ldquo;{transcript}&rdquo;
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                {supported ? cfg.hint : "Speech recognition not supported — use Chrome or Edge"}
              </p>
            )}
          </div>

          {/* Stack info pills */}
          <div className="mt-5 flex justify-center gap-2 flex-wrap">
            {[
              { label: "AWS Bedrock", sub: "Claude Sonnet" },
              { label: "MiniMax", sub: "M2.5 fallback" },
              { label: "MiniMax TTS", sub: "speech-2.8" },
              { label: "Datadog", sub: "LLM Obs" },
            ].map(({ label, sub }) => (
              <div
                key={label}
                className="rounded-lg px-2.5 py-1 text-center"
                style={{ background: "var(--surface-overlay)", border: "1px solid var(--border)" }}
              >
                <p className="text-[10px] font-semibold" style={{ color: "var(--foreground)" }}>{label}</p>
                <p className="text-[9px]" style={{ color: "var(--foreground-muted)" }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Conversation transcript ─────────────────────────────────────── */}
        {exchanges.length > 0 && (
          <div
            ref={scrollRef}
            className="mt-4 max-h-[42vh] overflow-y-auto rounded-2xl"
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
                {/* User bubble */}
                <div className="mb-3 flex justify-end">
                  <div
                    className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm"
                    style={{ background: "var(--user-bubble)", color: "var(--foreground)" }}
                  >
                    {ex.userText}
                  </div>
                </div>

                {/* Agent response */}
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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                      {ex.agentText}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      {ex.latencyMs && (
                        <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
                          {ex.latencyMs}ms LLM
                        </span>
                      )}
                      {ex.modelProvider && (
                        <ModelPill provider={ex.modelProvider} model={ex.model ?? ""} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* footer */}
        <p className="mt-4 pb-8 text-center text-[10px]" style={{ color: "var(--foreground-muted)" }}>
          Streaming audio via MiniMax speech-2.8-turbo · LLM Obs via Datadog
        </p>
      </div>
    </div>
  );
}
