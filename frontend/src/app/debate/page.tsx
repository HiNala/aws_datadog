"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { WaveformBars } from "@/components/WaveformBars";
import {
  startDebate,
  streamDebateTurn,
  getTextToSpeechStream,
  type DebateSessionResponse,
  type AgentProfile,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState = "idle" | "setup" | "ready" | "running" | "complete" | "error";

interface TurnDisplay {
  turnNumber: number;
  agent: "a" | "b";
  agentName: string;
  text: string;
  isThinking: boolean;
  isPlaying: boolean;
  model?: string;
  latencyMs?: number;
  tokensOut?: number;
}

// ---------------------------------------------------------------------------
// Streaming audio — identical to voice page (cross-browser MediaSource + blob)
// ---------------------------------------------------------------------------

async function playStreamingAudio(
  stream: ReadableStream<Uint8Array>,
  onStart: () => void,
  onEnd: () => void,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
): Promise<void> {
  const supportsMS =
    typeof MediaSource !== "undefined" &&
    MediaSource.isTypeSupported("audio/mpeg");

  if (supportsMS) {
    return new Promise<void>((resolve) => {
      const ms = new MediaSource();
      const url = URL.createObjectURL(ms);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); onEnd(); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); onEnd(); resolve(); };

      ms.addEventListener("sourceopen", async () => {
        let sb: SourceBuffer;
        try { sb = ms.addSourceBuffer("audio/mpeg"); }
        catch {
          URL.revokeObjectURL(url);
          const chunks: Uint8Array[] = [];
          const r = stream.getReader();
          for (;;) { const { done, value } = await r.read(); if (done) break; if (value) chunks.push(value); }
          const blob = new Blob(chunks, { type: "audio/mpeg" });
          const bu = URL.createObjectURL(blob);
          const a2 = new Audio(bu);
          audioRef.current = a2;
          a2.onended = () => { URL.revokeObjectURL(bu); onEnd(); resolve(); };
          a2.onerror = () => { URL.revokeObjectURL(bu); onEnd(); resolve(); };
          await a2.play().catch(() => { onEnd(); resolve(); });
          onStart();
          return;
        }

        const reader = stream.getReader();
        let started = false;
        const appendNext = async () => {
          if (sb.updating) return;
          const { done, value } = await reader.read();
          if (done) {
            if (!sb.updating) { try { ms.endOfStream(); } catch { /* ok */ } }
            else sb.addEventListener("updateend", () => { try { ms.endOfStream(); } catch { /* ok */ } }, { once: true });
            return;
          }
          if (value?.length) {
            try {
              sb.appendBuffer(value);
              if (!started) { started = true; audio.play().then(onStart).catch(() => { onEnd(); resolve(); }); }
            } catch { onEnd(); resolve(); }
          } else appendNext();
        };
        sb.addEventListener("updateend", appendNext);
        appendNext();
      });
    });
  }

  // Safari / fallback
  const chunks: Uint8Array[] = [];
  const r = stream.getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; if (value) chunks.push(value); }
  const blob = new Blob(chunks, { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioRef.current = audio;
  onStart();
  return new Promise<void>((resolve) => {
    audio.onended = () => { URL.revokeObjectURL(url); onEnd(); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); onEnd(); resolve(); };
    audio.play().catch(() => { onEnd(); resolve(); });
  });
}

// ---------------------------------------------------------------------------
// Parse SSE stream → yields parsed JSON events
// ---------------------------------------------------------------------------

async function parseSSE(
  stream: ReadableStream<Uint8Array>,
  onEvent: (e: Record<string, unknown>) => void
): Promise<void> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (raw) { try { onEvent(JSON.parse(raw)); } catch { /* ignore */ } }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Agent color palette
// ---------------------------------------------------------------------------

const A_COLOR = {
  solid: "var(--accent)",
  bg: "color-mix(in srgb, var(--accent) 10%, transparent)",
  border: "color-mix(in srgb, var(--accent) 28%, transparent)",
  glow: "0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent), var(--shadow-md)",
};

const B_COLOR = {
  solid: "var(--warning)",
  bg: "color-mix(in srgb, var(--warning) 10%, transparent)",
  border: "color-mix(in srgb, var(--warning) 28%, transparent)",
  glow: "0 0 0 2px color-mix(in srgb, var(--warning) 30%, transparent), var(--shadow-md)",
};

function agentColor(agent: "a" | "b") {
  return agent === "a" ? A_COLOR : B_COLOR;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentCardDisplay({
  profile,
  agent,
  isActive,
  isSpeaking,
}: {
  profile: AgentProfile;
  agent: "a" | "b";
  isActive: boolean;
  isSpeaking: boolean;
}) {
  const c = agentColor(agent);
  return (
    <div
      className="flex-1 rounded-2xl p-5 transition-all duration-300"
      style={{
        background: isActive ? c.bg : "var(--surface-raised)",
        border: `1px solid ${isActive ? c.border : "var(--border)"}`,
        boxShadow: isActive ? c.glow : "var(--shadow-sm)",
      }}
    >
      {/* Avatar */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
          style={{ background: c.bg, color: c.solid, border: `1px solid ${c.border}` }}
        >
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
            {profile.name}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: c.solid }}>
            {agent === "a" ? "Perspective A" : "Perspective B"}
          </p>
        </div>
        {isSpeaking && (
          <div className="ml-auto">
            <WaveformBars active mode="speak" bars={5} maxHeight={20} barWidth={2} gap={2} />
          </div>
        )}
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "var(--foreground-muted)" }}>
        &ldquo;{profile.perspective}&rdquo;
      </p>
    </div>
  );
}

function TurnBubble({
  turn,
  agentA,
  agentB,
}: {
  turn: TurnDisplay;
  agentA: AgentProfile;
  agentB: AgentProfile;
}) {
  const c = agentColor(turn.agent);
  const isA = turn.agent === "a";
  const profile = isA ? agentA : agentB;

  return (
    <div
      className={`flex gap-3 ${isA ? "flex-row" : "flex-row-reverse"}`}
      style={{ animation: "ov-fade-up 0.35s ease both" }}
    >
      {/* Avatar dot */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold self-start mt-1"
        style={{ background: c.bg, color: c.solid, border: `1px solid ${c.border}` }}
      >
        {profile.name.charAt(0).toUpperCase()}
      </div>

      {/* Bubble */}
      <div className={`max-w-[78%] ${isA ? "" : "items-end"} flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1.5 ${isA ? "" : "flex-row-reverse"}`}>
          <span className="text-[11px] font-semibold" style={{ color: c.solid }}>
            {profile.name}
          </span>
          <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
            Turn {turn.turnNumber}
          </span>
          {turn.latencyMs && (
            <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
              · {Math.round(turn.latencyMs)}ms
            </span>
          )}
        </div>

        {/* Content */}
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: turn.isPlaying
              ? c.bg
              : "var(--surface-raised)",
            border: `1px solid ${turn.isPlaying ? c.border : "var(--border)"}`,
            boxShadow: turn.isPlaying ? c.glow : "var(--shadow-sm)",
            transition: "all 0.3s ease",
          }}
        >
          {turn.isThinking ? (
            <div className="flex items-center gap-2 py-1">
              <WaveformBars active mode="think" bars={5} maxHeight={14} barWidth={2} gap={2} />
              <span className="text-xs italic" style={{ color: "var(--foreground-muted)" }}>
                Crafting argument…
              </span>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--foreground)" }}>
                {turn.text}
              </p>
              {turn.isPlaying && (
                <div className="mt-2 flex items-center gap-2">
                  <WaveformBars active mode="speak" bars={7} maxHeight={14} barWidth={2} gap={2} />
                  <span className="text-[10px]" style={{ color: c.solid }}>Speaking…</span>
                </div>
              )}
              {turn.model && !turn.isPlaying && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: "var(--surface-overlay)",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    {turn.model.includes("claude") ? "Claude · Bedrock" : turn.model.split("/").pop()}
                  </span>
                  {turn.tokensOut && (
                    <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
                      {turn.tokensOut} tokens
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TurnDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        const c = n % 2 === 1 ? "var(--accent)" : "var(--warning)";
        return (
          <span
            key={n}
            className="rounded-full transition-all duration-300"
            style={{
              width: active ? "20px" : "8px",
              height: "8px",
              background: done ? c : active ? c : "var(--border)",
              opacity: done ? 0.5 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mic button for voice topic input
// ---------------------------------------------------------------------------

function MicButton({ onResult }: { onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);

  const toggle = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    recRef.current = rec;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      if (text) onResult(text);
    };
    rec.start();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? "Stop listening" : "Speak your topic"}
      className="flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150 shrink-0"
      style={{
        background: listening
          ? "color-mix(in srgb, var(--accent) 15%, transparent)"
          : "var(--surface-overlay)",
        color: listening ? "var(--accent)" : "var(--foreground-muted)",
        border: `1px solid ${listening ? "color-mix(in srgb, var(--accent) 30%, transparent)" : "var(--border)"}`,
      }}
    >
      {listening ? (
        <span className="h-3 w-3 rounded-sm" style={{ background: "var(--accent)" }} />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DebatePage() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [topic, setTopic] = useState("");
  const [numTurns, setNumTurns] = useState(6);
  const [session, setSession] = useState<DebateSessionResponse | null>(null);
  const [turns, setTurns] = useState<TurnDisplay[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [activeAgent, setActiveAgent] = useState<"a" | "b" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stoppedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll conversation
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  // ── Run full debate ───────────────────────────────────────────────────────

  const runDebate = useCallback(async (sess: DebateSessionResponse) => {
    setPageState("running");
    stoppedRef.current = false;

    for (let turn = 1; turn <= sess.num_turns; turn++) {
      if (stoppedRef.current) break;

      const agent = turn % 2 === 1 ? "a" : "b";
      const agentName = agent === "a" ? sess.agent_a.name : sess.agent_b.name;
      setCurrentTurn(turn);
      setActiveAgent(agent);

      // Add placeholder
      setTurns((prev) => [
        ...prev,
        { turnNumber: turn, agent, agentName, text: "", isThinking: true, isPlaying: false },
      ]);

      // Fetch turn via SSE
      let turnText = "";
      let turnVoice = agent === "a" ? sess.agent_a.voice : sess.agent_b.voice;
      let turnModel = "";
      let turnLatency = 0;
      let turnTokens = 0;

      try {
        const sseStream = await streamDebateTurn(sess.session_id, turn);
        await parseSSE(sseStream, (evt) => {
          if (evt.type === "text") {
            turnText = (evt.text as string) || "";
            turnVoice = (evt.voice as string) || turnVoice;
            turnModel = (evt.model as string) || "";
            turnLatency = (evt.latency_ms as number) || 0;
            turnTokens = (evt.output_tokens as number) || 0;
            setTurns((prev) =>
              prev.map((t, i) =>
                i === prev.length - 1
                  ? { ...t, text: turnText, isThinking: false, model: turnModel, latencyMs: turnLatency, tokensOut: turnTokens }
                  : t
              )
            );
          }
        });
      } catch (e) {
        if (!stoppedRef.current) {
          setError(e instanceof Error ? e.message : "Turn generation failed");
          setPageState("error");
        }
        return;
      }

      if (stoppedRef.current) break;

      // Play TTS for this turn
      if (turnText) {
        setTurns((prev) =>
          prev.map((t, i) => (i === prev.length - 1 ? { ...t, isPlaying: true } : t))
        );
        try {
          const audioStream = await getTextToSpeechStream(turnText, turnVoice);
          await playStreamingAudio(
            audioStream,
            () => {},
            () => {
              setTurns((prev) =>
                prev.map((t, i) => (i === prev.length - 1 ? { ...t, isPlaying: false } : t))
              );
            },
            audioRef
          );
        } catch {
          // TTS failure is non-fatal — continue debate
          setTurns((prev) =>
            prev.map((t, i) => (i === prev.length - 1 ? { ...t, isPlaying: false } : t))
          );
        }
      }

      setActiveAgent(null);
    }

    if (!stoppedRef.current) {
      setPageState("complete");
      setActiveAgent(null);
    }
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    const t = topic.trim();
    if (!t) { inputRef.current?.focus(); return; }

    setPageState("setup");
    setError(null);

    try {
      const sess = await startDebate(t, numTurns);
      setSession(sess);
      setPageState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate perspectives");
      setPageState("error");
    }
  }, [topic, numTurns]);

  const handleBegin = useCallback(() => {
    if (!session) return;
    setTurns([]);
    setCurrentTurn(0);
    runDebate(session);
  }, [session, runDebate]);

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    stopAudio();
    setActiveAgent(null);
    setPageState("complete");
    // Mark any thinking turns as stopped
    setTurns((prev) =>
      prev.map((t) => (t.isThinking ? { ...t, isThinking: false, text: "[Stopped]" } : { ...t, isPlaying: false }))
    );
  }, [stopAudio]);

  const handleReset = useCallback(() => {
    stoppedRef.current = true;
    stopAudio();
    setPageState("idle");
    setSession(null);
    setTurns([]);
    setCurrentTurn(0);
    setActiveAgent(null);
    setError(null);
    setTopic("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [stopAudio]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && pageState === "idle") {
      e.preventDefault();
      handleStart();
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const isRunning = pageState === "running";
  const isDone = pageState === "complete";
  const isReady = pageState === "ready";

  return (
    <div
      className="flex min-h-[calc(100vh-3.5rem)] flex-col"
      style={{ background: "var(--surface)" }}
    >
      <style>{`
        @keyframes ov-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ov-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      {/* ── Hero / Input Section ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% -5%, color-mix(in srgb, var(--accent) 6%, transparent), transparent)",
          }}
        />

        <div className="relative mx-auto max-w-3xl px-6 pt-10 pb-8">
          {/* Eyebrow */}
          <div className="mb-5 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }}
              />
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--accent)" }}
              >
                Dual Perspectives
              </p>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                color: "var(--foreground-muted)",
                border: "1px solid var(--border)",
              }}
            >
              Powered by Claude · MiniMax TTS · Datadog
            </span>
          </div>

          <h1
            className="mb-2 text-3xl font-bold tracking-tight"
            style={{ color: "var(--foreground)", letterSpacing: "-0.03em" }}
          >
            Two voices. One truth.
          </h1>
          <p className="mb-7 text-sm" style={{ color: "var(--foreground-muted)" }}>
            Enter a topic and two distinct AI voices will debate it — streamed live to your speakers.
          </p>

          {/* Topic Input */}
          {(pageState === "idle" || pageState === "setup" || pageState === "error") && (
            <div style={{ animation: "ov-fade-up 0.4s ease both" }}>
              <div
                className="flex items-center gap-2 rounded-2xl p-2"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Should AI replace human creativity?"
                  disabled={pageState === "setup"}
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground-muted"
                  style={{ color: "var(--foreground)" }}
                />
                <MicButton onResult={setTopic} />
                <button
                  onClick={handleStart}
                  disabled={pageState === "setup" || !topic.trim()}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-150 shrink-0"
                  style={{
                    background: topic.trim() && pageState !== "setup" ? "var(--accent)" : "var(--surface-overlay)",
                    color: topic.trim() && pageState !== "setup" ? "#fff" : "var(--foreground-muted)",
                    boxShadow: topic.trim() && pageState !== "setup"
                      ? "0 2px 10px color-mix(in srgb, var(--accent) 35%, transparent)"
                      : "none",
                    cursor: pageState === "setup" || !topic.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {pageState === "setup" ? (
                    <>
                      <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeDasharray="55" strokeDashoffset="20" />
                      </svg>
                      Crafting…
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Start Debate
                    </>
                  )}
                </button>
              </div>

              {/* Turn count selector */}
              <div className="mt-4 flex items-center gap-4">
                <p className="text-[11px] font-medium" style={{ color: "var(--foreground-muted)" }}>
                  Turns
                </p>
                <div className="flex gap-1.5">
                  {[4, 6, 8].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumTurns(n)}
                      className="rounded-lg px-3 py-1 text-xs font-semibold transition-all duration-150"
                      style={{
                        background: numTurns === n ? "var(--accent)" : "var(--surface-raised)",
                        color: numTurns === n ? "#fff" : "var(--foreground-muted)",
                        border: `1px solid ${numTurns === n ? "transparent" : "var(--border)"}`,
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
                  {numTurns / 2} exchanges · ~{numTurns * 2}min listen
                </p>
              </div>

              {/* Error */}
              {pageState === "error" && error && (
                <div
                  className="mt-4 rounded-xl p-3.5 flex items-start gap-2.5"
                  style={{
                    background: "color-mix(in srgb, var(--error) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--error) 25%, transparent)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" style={{ color: "var(--error)" }}>
                    <circle cx="12" cy="12" r="10" /><line x1="15" x2="9" y1="9" y2="15" /><line x1="9" x2="15" y1="9" y2="15" />
                  </svg>
                  <p className="text-xs" style={{ color: "var(--error)" }}>{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Locked topic bar (when session exists) */}
          {session && (pageState === "ready" || isRunning || isDone) && (
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                animation: "ov-fade-up 0.4s ease both",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", flexShrink: 0 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="flex-1 text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                {session.topic}
              </p>
              {!isRunning && (
                <button
                  onClick={handleReset}
                  className="text-[11px] font-medium shrink-0"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  ← New topic
                </button>
              )}
            </div>
          )}

          {/* Agent Cards */}
          {session && (isReady || isRunning || isDone) && (
            <div
              className="mt-5 flex gap-4"
              style={{ animation: "ov-fade-up 0.5s 0.1s ease both" }}
            >
              <AgentCardDisplay
                profile={session.agent_a}
                agent="a"
                isActive={activeAgent === "a" || (isDone && true)}
                isSpeaking={activeAgent === "a" && isRunning}
              />
              {/* VS divider */}
              <div className="flex flex-col items-center justify-center gap-1 shrink-0">
                <div className="h-6 w-px" style={{ background: "var(--border)" }} />
                <span className="text-[10px] font-bold px-1" style={{ color: "var(--foreground-muted)" }}>
                  VS
                </span>
                <div className="h-6 w-px" style={{ background: "var(--border)" }} />
              </div>
              <AgentCardDisplay
                profile={session.agent_b}
                agent="b"
                isActive={activeAgent === "b" || (isDone && true)}
                isSpeaking={activeAgent === "b" && isRunning}
              />
            </div>
          )}

          {/* Begin button (ready state) */}
          {isReady && (
            <div className="mt-5 flex items-center gap-3" style={{ animation: "ov-fade-up 0.5s 0.2s ease both" }}>
              <button
                onClick={handleBegin}
                className="flex items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-150"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  boxShadow: "0 4px 16px color-mix(in srgb, var(--accent) 40%, transparent)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Begin Debate
              </button>
              <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                {session!.num_turns} turns · auto-plays audio · Datadog tracked
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Conversation Area ─────────────────────────────────────────────── */}
      {(isRunning || isDone || (turns.length > 0)) && (
        <div className="flex flex-1 flex-col mx-auto w-full max-w-3xl px-6">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto py-6 space-y-5"
            style={{ minHeight: "280px", maxHeight: "calc(100vh - 24rem)" }}
          >
            {turns.map((turn) => (
              <TurnBubble
                key={turn.turnNumber}
                turn={turn}
                agentA={session!.agent_a}
                agentB={session!.agent_b}
              />
            ))}

            {/* Waiting indicator between turns */}
            {isRunning && turns.every((t) => !t.isThinking && !t.isPlaying) && currentTurn < (session?.num_turns ?? 0) && (
              <div className="flex justify-center py-2" style={{ animation: "ov-fade-up 0.3s ease both" }}>
                <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
                  <WaveformBars active mode="think" bars={4} maxHeight={10} barWidth={2} gap={2} />
                  <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
                    Preparing next argument…
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom Control Bar ─────────────────────────────────────────── */}
          <div
            className="border-t py-4 flex items-center justify-between gap-4"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Progress dots */}
            <div className="flex items-center gap-3">
              <TurnDots current={currentTurn} total={session?.num_turns ?? numTurns} />
              <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
                {isDone ? "Debate complete" : `Turn ${currentTurn} of ${session?.num_turns ?? numTurns}`}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {isRunning && (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-150"
                  style={{
                    background: "color-mix(in srgb, var(--error) 10%, transparent)",
                    color: "var(--error)",
                    border: "1px solid color-mix(in srgb, var(--error) 25%, transparent)",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                  Stop
                </button>
              )}
              {isDone && (
                <>
                  <button
                    onClick={() => { setTurns([]); setCurrentTurn(0); if (session) runDebate(session); }}
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-150"
                    style={{
                      background: "var(--surface-raised)",
                      color: "var(--foreground-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 .49-4.99" />
                    </svg>
                    Replay
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-150"
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                      boxShadow: "0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent)",
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
                    </svg>
                    New Debate
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state (idle / ready with no turns yet) ───────────────────── */}
      {!isRunning && !isDone && turns.length === 0 && pageState !== "setup" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--foreground-muted)" }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              {isReady ? "Perspectives are ready" : "No debate started yet"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--foreground-muted)" }}>
              {isReady ? "Hit 'Begin Debate' to start the conversation" : "Enter a topic above to generate two contrasting viewpoints"}
            </p>
          </div>
          {/* Sample topics */}
          {pageState === "idle" && (
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {[
                "Should AI replace human creativity?",
                "Is remote work better than office work?",
                "Does social media do more harm than good?",
                "Is open source software better than proprietary?",
              ].map((t) => (
                <button
                  key={t}
                  onClick={() => { setTopic(t); inputRef.current?.focus(); }}
                  className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-150"
                  style={{
                    background: "var(--surface-raised)",
                    color: "var(--foreground-muted)",
                    border: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--accent) 30%, transparent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="pb-6 text-center text-[10px]" style={{ color: "var(--foreground-muted)" }}>
        Orchestrated by Claude · TTS by MiniMax speech-2.8-turbo · Traced by Datadog LLM Obs
      </p>
    </div>
  );
}
