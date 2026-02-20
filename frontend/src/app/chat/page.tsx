"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { ChatMessage } from "@/components/ChatMessage";
import { WaveformBars } from "@/components/WaveformBars";
import {
  sendChatMessage,
  listConversations,
  getConversationMessages,
  getTextToSpeechStream,
  startDebate,
  streamDebateTurn,
  listDebateSessions,
  type ChatResponse,
  type ConversationSummary,
  type DebateSessionResponse,
  type AgentProfile,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  modelProvider?: string;
  tokens?: { input: number; output: number };
  latencyMs?: number;
}

type VoiceState = "idle" | "listen" | "think" | "speak";
type Mode = "chat" | "debate";
type DebatePhase = "idle" | "setup" | "ready" | "running" | "complete" | "error";

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

interface DebateSession {
  session_id: string;
  topic: string;
  agent_a_name: string;
  agent_b_name: string;
  num_turns: number;
  created_at: string | null;
}

// ── Streaming TTS ─────────────────────────────────────────────────────────────

async function playStreamingTTS(
  stream: ReadableStream<Uint8Array>,
  onStart: () => void,
  onEnd: () => void,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
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

// ── SSE Parser ────────────────────────────────────────────────────────────────

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

// ── Agent Colors ──────────────────────────────────────────────────────────────

const A_COLOR = {
  solid: "var(--accent)",
  bg: "color-mix(in srgb, var(--accent) 10%, transparent)",
  border: "color-mix(in srgb, var(--accent) 28%, transparent)",
};
const B_COLOR = {
  solid: "var(--warning)",
  bg: "color-mix(in srgb, var(--warning) 10%, transparent)",
  border: "color-mix(in srgb, var(--warning) 28%, transparent)",
};
function agentColor(agent: "a" | "b") { return agent === "a" ? A_COLOR : B_COLOR; }

// ── Icons ─────────────────────────────────────────────────────────────────────

function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function SendIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function StopIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function PlayIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({
  conversations,
  debates,
  activeConvId,
  onSelectConv,
  onNew,
  mode,
  onSetMode,
}: {
  conversations: ConversationSummary[];
  debates: DebateSession[];
  activeConvId: string | null;
  onSelectConv: (id: string) => void;
  onNew: () => void;
  mode: Mode;
  onSetMode: (m: Mode) => void;
}) {
  return (
    <aside
      className="flex w-56 shrink-0 flex-col"
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}
    >
      <div className="p-2.5">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all"
          style={{ color: "var(--foreground-muted)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {/* Chats */}
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
          Chats
        </p>
        {conversations.length === 0 ? (
          <p className="px-3 py-3 text-center text-[10px]" style={{ color: "var(--foreground-muted)" }}>No chats yet</p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((c) => {
              const active = mode === "chat" && activeConvId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { onSetMode("chat"); onSelectConv(c.id); }}
                  className="w-full rounded-lg px-3 py-2 text-left transition-all"
                  style={{ background: active ? "var(--surface-active)" : "transparent", color: active ? "var(--foreground)" : "var(--foreground-muted)" }}
                >
                  <p className="truncate text-[11px] font-medium">{c.title}</p>
                  <p className="mt-0.5 text-[9px] opacity-50">{c.message_count} messages</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Debates */}
        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--warning)" }}>
          Debates
        </p>
        {debates.length === 0 ? (
          <p className="px-3 py-3 text-center text-[10px]" style={{ color: "var(--foreground-muted)" }}>No debates yet</p>
        ) : (
          <div className="space-y-0.5">
            {debates.map((d) => (
              <button
                key={d.session_id}
                onClick={() => onSetMode("debate")}
                className="w-full rounded-lg px-3 py-2 text-left transition-all"
                style={{ color: "var(--foreground-muted)" }}
              >
                <p className="truncate text-[11px] font-medium">{d.topic}</p>
                <p className="mt-0.5 text-[9px] opacity-50">{d.agent_a_name} vs {d.agent_b_name}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Unified Input ─────────────────────────────────────────────────────────────

function UnifiedInput({
  value,
  onChange,
  onSend,
  onVoiceTranscript,
  isLoading,
  voiceState,
  onStop,
  placeholder,
  centered,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onVoiceTranscript: (text: string) => void;
  isLoading: boolean;
  voiceState: VoiceState;
  onStop: () => void;
  placeholder: string;
  centered?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHoldRef = useRef(false);

  const {
    isRecording,
    interimTranscript,
    startRecording,
    stopRecording,
  } = useSpeechRecognition({ onFinal: onVoiceTranscript });

  const hasText = value.trim().length > 0;
  const busy = isLoading || voiceState === "think";

  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && hasText && !busy) { e.preventDefault(); onSend(); }
  };

  const handlePointerDown = () => {
    if (busy || isRecording) return;
    wasHoldRef.current = false;
    if (!hasText) {
      holdTimerRef.current = setTimeout(() => { wasHoldRef.current = true; startRecording(); }, 200);
    }
  };

  const handlePointerUp = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (isRecording) { stopRecording(); return; }
    if (!wasHoldRef.current && !hasText && !busy) { startRecording(); return; }
    if (!wasHoldRef.current && hasText && !busy) { onSend(); }
    wasHoldRef.current = false;
  };

  const handlePointerLeave = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  };

  let buttonBg: string, buttonColor: string;
  if (busy) { buttonBg = "var(--error)"; buttonColor = "#fff"; }
  else if (isRecording) { buttonBg = "var(--error)"; buttonColor = "#fff"; }
  else if (hasText) { buttonBg = "var(--accent)"; buttonColor = "#fff"; }
  else { buttonBg = "var(--surface-hover)"; buttonColor = "var(--foreground-muted)"; }

  const displayPlaceholder = isRecording ? (interimTranscript || "Listening\u2026") : placeholder;

  return (
    <div className={centered ? "w-full max-w-2xl mx-auto" : "mx-auto max-w-2xl"}>
      {isRecording && (
        <div className="mb-2 flex items-center gap-2 px-1 animate-fade-in">
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--error)" }} />
          <span className="text-sm" style={{ color: "var(--foreground-muted)" }}>
            {interimTranscript ? `\u201C${interimTranscript}\u201D` : "Listening\u2026"}
          </span>
        </div>
      )}
      <div
        className="relative rounded-2xl transition-all duration-200"
        style={{
          background: "var(--surface-raised)",
          border: `1px solid ${isRecording ? "var(--accent)" : "var(--border)"}`,
          boxShadow: isRecording
            ? "0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)"
            : "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={isRecording ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={displayPlaceholder}
          disabled={busy}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-12 text-sm leading-relaxed outline-none"
          style={{ color: "var(--foreground)", minHeight: "56px", maxHeight: "200px" }}
        />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <div className="flex items-center gap-2 px-2">
            {voiceState === "speak" && (
              <div className="flex items-center gap-1.5 animate-fade-in">
                <WaveformBars active mode="speak" bars={5} maxHeight={12} barWidth={2} gap={2} />
                <span className="text-[10px] font-medium" style={{ color: "var(--success)" }}>Speaking</span>
              </div>
            )}
            {voiceState === "think" && (
              <div className="flex items-center gap-1.5 animate-fade-in">
                <div className="flex gap-0.5">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="h-1 w-1 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: `${d}ms` }} />
                  ))}
                </div>
                <span className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>Thinking</span>
              </div>
            )}
          </div>
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onClick={busy ? onStop : undefined}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 select-none touch-none"
            style={{ background: buttonBg, color: buttonColor, boxShadow: isRecording ? "0 0 12px color-mix(in srgb, var(--error) 40%, transparent)" : "none" }}
            title={busy ? "Stop" : isRecording ? "Release to stop" : hasText ? "Send message" : "Hold to speak"}
          >
            {busy ? <StopIcon /> : isRecording ? <MicIcon size={16} /> : hasText ? <SendIcon size={16} /> : <MicIcon size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Debate Sub-Components ─────────────────────────────────────────────────────

function AgentCard({ profile, agent, isActive }: { profile: AgentProfile; agent: "a" | "b"; isActive: boolean }) {
  const c = agentColor(agent);
  return (
    <div
      className="flex-1 rounded-xl p-4 transition-all duration-300"
      style={{
        background: isActive ? c.bg : "var(--surface-raised)",
        border: `1px solid ${isActive ? c.border : "var(--border)"}`,
      }}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
          style={{ background: c.bg, color: c.solid, border: `1px solid ${c.border}` }}
        >
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: "var(--foreground)" }}>{profile.name}</p>
          <p className="text-[9px] font-medium uppercase tracking-wider" style={{ color: c.solid }}>
            {agent === "a" ? "Perspective A" : "Perspective B"}
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--foreground-muted)" }}>
        &ldquo;{profile.perspective}&rdquo;
      </p>
    </div>
  );
}

function TurnBubble({ turn, agentA, agentB }: { turn: TurnDisplay; agentA: AgentProfile; agentB: AgentProfile }) {
  const c = agentColor(turn.agent);
  const isA = turn.agent === "a";
  const profile = isA ? agentA : agentB;

  return (
    <div className={`flex gap-3 ${isA ? "flex-row" : "flex-row-reverse"}`} style={{ animation: "ov-fade-up 0.35s ease both" }}>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold self-start mt-1"
        style={{ background: c.bg, color: c.solid, border: `1px solid ${c.border}` }}
      >
        {profile.name.charAt(0).toUpperCase()}
      </div>
      <div className={`max-w-[78%] ${isA ? "" : "items-end"} flex flex-col`}>
        <div className={`flex items-center gap-2 mb-1 ${isA ? "" : "flex-row-reverse"}`}>
          <span className="text-[11px] font-semibold" style={{ color: c.solid }}>{profile.name}</span>
          <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>Turn {turn.turnNumber}</span>
          {turn.latencyMs && <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>· {Math.round(turn.latencyMs)}ms</span>}
        </div>
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: turn.isPlaying ? c.bg : "var(--surface-raised)",
            border: `1px solid ${turn.isPlaying ? c.border : "var(--border)"}`,
            transition: "all 0.3s ease",
          }}
        >
          {turn.isThinking ? (
            <div className="flex items-center gap-2 py-1">
              <WaveformBars active mode="think" bars={5} maxHeight={14} barWidth={2} gap={2} />
              <span className="text-xs italic" style={{ color: "var(--foreground-muted)" }}>Crafting argument\u2026</span>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--foreground)" }}>{turn.text}</p>
              {turn.isPlaying && (
                <div className="mt-2 flex items-center gap-2">
                  <WaveformBars active mode="speak" bars={5} maxHeight={12} barWidth={2} gap={2} />
                  <span className="text-[10px]" style={{ color: c.solid }}>Speaking\u2026</span>
                </div>
              )}
              {turn.model && !turn.isPlaying && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--surface-overlay)", color: "var(--foreground-muted)" }}>
                    {turn.model.includes("claude") ? "Claude · Bedrock" : turn.model.split("/").pop()}
                  </span>
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
            style={{ width: active ? "16px" : "6px", height: "6px", background: done ? c : active ? c : "var(--border)", opacity: done ? 0.5 : 1 }}
          />
        );
      })}
    </div>
  );
}

// ── Mode Toggle ───────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div
      className="inline-flex rounded-xl p-0.5"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
    >
      {(["chat", "debate"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className="rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200"
          style={{
            background: mode === m ? (m === "debate" ? "color-mix(in srgb, var(--warning) 15%, var(--surface-raised))" : "var(--surface-active)") : "transparent",
            color: mode === m ? (m === "debate" ? "var(--warning)" : "var(--foreground)") : "var(--foreground-muted)",
          }}
        >
          {m === "chat" ? "Chat" : "Debate"}
        </button>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  // Mode
  const [mode, setMode] = useState<Mode>("chat");

  // Shared state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  // Debate state
  const [debatePhase, setDebatePhase] = useState<DebatePhase>("idle");
  const [debateSession, setDebateSession] = useState<DebateSessionResponse | null>(null);
  const [debateTurns, setDebateTurns] = useState<TurnDisplay[]>([]);
  const [numTurns, setNumTurns] = useState(6);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [activeAgent, setActiveAgent] = useState<"a" | "b" | null>(null);
  const [debates, setDebates] = useState<DebateSession[]>([]);
  const stoppedRef = useRef(false);

  const hasMessages = messages.length > 0;
  const debateActive = debatePhase !== "idle";

  // Determine if we show starting state
  const showStarting = mode === "chat" ? !hasMessages : !debateActive;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, debateTurns]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const refreshConversations = useCallback(async () => {
    try { const data = await listConversations(30); setConversations(data.conversations); } catch { /* ok */ }
  }, []);

  const refreshDebates = useCallback(async () => {
    try { const data = await listDebateSessions(10); setDebates(data.sessions); } catch { /* ok */ }
  }, []);

  useEffect(() => { refreshConversations(); refreshDebates(); }, [refreshConversations, refreshDebates]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const data = await getConversationMessages(id);
      setMessages(data.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        model: m.model ?? undefined,
        tokens: m.input_tokens != null && m.output_tokens != null ? { input: m.input_tokens, output: m.output_tokens } : undefined,
        latencyMs: m.latency_ms ?? undefined,
      })));
      setConversationId(id);
      setMode("chat");
    } catch { /* ok */ }
  }, []);

  // ── Shared helpers ────────────────────────────────────────────────────────

  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    setVoiceState("idle");
  }, []);

  const handleNew = useCallback(() => {
    if (mode === "chat") {
      setMessages([]); setConversationId(null);
    } else {
      stoppedRef.current = true; stopAudio();
      setDebatePhase("idle"); setDebateSession(null); setDebateTurns([]); setCurrentTurn(0); setActiveAgent(null);
    }
    setInputValue(""); setError(null); setVoiceState("idle");
  }, [mode, stopAudio]);

  // ── Chat send ─────────────────────────────────────────────────────────────

  const handleChatSend = useCallback(
    async (text?: string) => {
      const finalText = (text ?? inputValue).trim();
      if (!finalText || isLoading) return;

      setMessages((prev) => [...prev, { role: "user", content: finalText }]);
      setInputValue(""); setIsLoading(true); setVoiceState("think"); setError(null);

      try {
        const data: ChatResponse = await sendChatMessage(finalText, conversationId);
        setConversationId(data.conversation_id);
        setMessages((prev) => [...prev, {
          role: "assistant", content: data.response, model: data.model,
          modelProvider: data.model_provider, tokens: data.tokens, latencyMs: data.latency_ms,
        }]);
        refreshConversations();
        try {
          const stream = await getTextToSpeechStream(data.response);
          await playStreamingTTS(stream, () => setVoiceState("speak"), () => setVoiceState("idle"), audioRef);
        } catch { setVoiceState("idle"); }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setError(msg);
        setMessages((prev) => [...prev, { role: "assistant", content: `Sorry, I encountered an error: ${msg}` }]);
        setVoiceState("idle");
      } finally { setIsLoading(false); }
    },
    [conversationId, refreshConversations, inputValue, isLoading],
  );

  // ── Debate handlers ───────────────────────────────────────────────────────

  const runDebate = useCallback(async (sess: DebateSessionResponse) => {
    setDebatePhase("running");
    stoppedRef.current = false;

    for (let turn = 1; turn <= sess.num_turns; turn++) {
      if (stoppedRef.current) break;
      const agent = turn % 2 === 1 ? "a" as const : "b" as const;
      const agentName = agent === "a" ? sess.agent_a.name : sess.agent_b.name;
      setCurrentTurn(turn); setActiveAgent(agent);

      setDebateTurns((prev) => [...prev, { turnNumber: turn, agent, agentName, text: "", isThinking: true, isPlaying: false }]);

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
            setDebateTurns((prev) =>
              prev.map((t, i) => i === prev.length - 1
                ? { ...t, text: turnText, isThinking: false, model: turnModel, latencyMs: turnLatency, tokensOut: turnTokens }
                : t
              )
            );
          }
        });
      } catch (e) {
        if (!stoppedRef.current) { setError(e instanceof Error ? e.message : "Turn generation failed"); setDebatePhase("error"); }
        return;
      }

      if (stoppedRef.current) break;

      if (turnText) {
        setDebateTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, isPlaying: true } : t)));
        try {
          const audioStream = await getTextToSpeechStream(turnText, turnVoice);
          await playStreamingTTS(
            audioStream,
            () => {},
            () => { setDebateTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, isPlaying: false } : t))); },
            audioRef,
          );
        } catch {
          setDebateTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, isPlaying: false } : t)));
        }
      }
      setActiveAgent(null);
    }

    if (!stoppedRef.current) { setDebatePhase("complete"); setActiveAgent(null); refreshDebates(); }
  }, [refreshDebates]);

  const handleDebateStart = useCallback(async () => {
    const t = inputValue.trim();
    if (!t) return;
    setDebatePhase("setup"); setError(null);

    try {
      const sess = await startDebate(t, numTurns);
      setDebateSession(sess);
      setInputValue("");
      setDebateTurns([]); setCurrentTurn(0);
      runDebate(sess);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start debate");
      setDebatePhase("error");
    }
  }, [inputValue, numTurns, runDebate]);

  const handleDebateStop = useCallback(() => {
    stoppedRef.current = true; stopAudio(); setActiveAgent(null); setDebatePhase("complete");
    setDebateTurns((prev) => prev.map((t) => (t.isThinking ? { ...t, isThinking: false, text: "[Stopped]" } : { ...t, isPlaying: false })));
  }, [stopAudio]);

  // ── Starters ──────────────────────────────────────────────────────────────

  const CHAT_STARTERS = [
    "Is api-gateway healthy?",
    "Blast radius if postgres fails?",
    "Any P1 incidents right now?",
    "Summarize this week\u2019s alerts",
  ];

  const DEBATE_STARTERS = [
    "Should AI replace human creativity?",
    "Is remote work better than office?",
    "Microservices vs monolith?",
    "Open source vs proprietary?",
  ];

  // ── Handle send (dispatches to chat or debate) ────────────────────────────

  const handleSend = useCallback((text?: string) => {
    if (mode === "chat") handleChatSend(text);
    else handleDebateStart();
  }, [mode, handleChatSend, handleDebateStart]);

  const handleModeSwitch = useCallback((m: Mode) => {
    if (m === mode) return;
    stopAudio();
    setMode(m);
    setError(null);
  }, [mode, stopAudio]);

  // ── Sidebar toggle button ─────────────────────────────────────────────────

  const sidebarToggle = (
    <button
      onClick={() => setSidebarOpen((v) => !v)}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
      style={{ color: "var(--foreground-muted)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // STARTING STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (showStarting) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        <style>{`@keyframes ov-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        {sidebarOpen && (
          <Sidebar
            conversations={conversations} debates={debates} activeConvId={conversationId}
            onSelectConv={loadConversation} onNew={handleNew} mode={mode} onSetMode={handleModeSwitch}
          />
        )}
        <div className="flex flex-1 flex-col min-w-0" style={{ background: "var(--surface)" }}>
          <div className="px-4 py-2 shrink-0">{sidebarToggle}</div>

          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
            <div className="w-full max-w-2xl text-center" style={{ animation: "ov-fade-up 0.4s ease both" }}>
              <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--foreground)", letterSpacing: "-0.03em" }}>
                OpsVoice
              </h1>
              <p className="mt-2 text-sm" style={{ color: "var(--foreground-muted)" }}>
                {mode === "chat"
                  ? "Ask about incidents, services, latency, or anything in your infrastructure."
                  : "Enter a topic and two AI voices will debate it \u2014 streamed live to your speakers."}
              </p>

              {/* Mode toggle */}
              <div className="mt-6 mb-6">
                <ModeToggle mode={mode} onChange={handleModeSwitch} />
              </div>

              {/* Input area */}
              {mode === "chat" ? (
                <UnifiedInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSend={() => handleSend()}
                  onVoiceTranscript={(t) => handleChatSend(t)}
                  isLoading={isLoading}
                  voiceState={voiceState}
                  onStop={() => { setIsLoading(false); stopAudio(); }}
                  placeholder="Ask about your infrastructure\u2026"
                  centered
                />
              ) : (
                <div className="mx-auto max-w-2xl">
                  <div
                    className="flex items-center gap-2 rounded-2xl p-2"
                    style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                  >
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) handleDebateStart(); }}
                      placeholder="e.g. Should AI replace human creativity?"
                      disabled={debatePhase === "setup"}
                      className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                      style={{ color: "var(--foreground)" }}
                      autoFocus
                    />
                    <button
                      onClick={handleDebateStart}
                      disabled={debatePhase === "setup" || !inputValue.trim()}
                      className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-150 shrink-0"
                      style={{
                        background: inputValue.trim() && debatePhase !== "setup" ? "var(--warning)" : "var(--surface-overlay)",
                        color: inputValue.trim() && debatePhase !== "setup" ? "#fff" : "var(--foreground-muted)",
                        cursor: debatePhase === "setup" || !inputValue.trim() ? "not-allowed" : "pointer",
                      }}
                    >
                      {debatePhase === "setup" ? (
                        <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="55" strokeDashoffset="20" /></svg> Crafting&hellip;</>
                      ) : (
                        <><PlayIcon /> Start Debate</>
                      )}
                    </button>
                  </div>
                  {/* Turn selector */}
                  <div className="mt-3 flex items-center gap-4 justify-center">
                    <span className="text-[11px] font-medium" style={{ color: "var(--foreground-muted)" }}>Turns</span>
                    <div className="flex gap-1.5">
                      {[4, 6, 8].map((n) => (
                        <button
                          key={n}
                          onClick={() => setNumTurns(n)}
                          className="rounded-lg px-3 py-1 text-xs font-semibold transition-all"
                          style={{
                            background: numTurns === n ? "var(--warning)" : "var(--surface-raised)",
                            color: numTurns === n ? "#fff" : "var(--foreground-muted)",
                            border: `1px solid ${numTurns === n ? "transparent" : "var(--border)"}`,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
                      {numTurns / 2} exchanges &middot; ~{numTurns * 2}min
                    </span>
                  </div>
                </div>
              )}

              {/* Starters */}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {(mode === "chat" ? CHAT_STARTERS : DEBATE_STARTERS).map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      if (mode === "chat") handleChatSend(prompt);
                      else { setInputValue(prompt); }
                    }}
                    disabled={isLoading || debatePhase === "setup"}
                    className="rounded-full px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40"
                    style={{ color: "var(--foreground-muted)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 rounded-xl px-4 py-2.5 text-xs text-left" style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 8%, var(--surface-raised))", border: "1px solid color-mix(in srgb, var(--error) 20%, transparent)" }}>
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE CHAT STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (mode === "chat") {
    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        {sidebarOpen && (
          <Sidebar
            conversations={conversations} debates={debates} activeConvId={conversationId}
            onSelectConv={loadConversation} onNew={handleNew} mode={mode} onSetMode={handleModeSwitch}
          />
        )}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0" style={{ background: "var(--surface)" }}>
          {/* Top bar */}
          <div className="flex items-center gap-2.5 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            {sidebarToggle}
            <span className="text-xs font-medium" style={{ color: "var(--foreground-muted)" }}>
              {conversationId ? "Conversation" : "New chat"}
            </span>
            {voiceState === "speak" && (
              <button onClick={stopAudio} className="ml-auto rounded-lg px-2.5 py-1 text-[10px] font-medium" style={{ color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>
                Stop audio
              </button>
            )}
          </div>

          {error && (
            <div className="mx-4 mt-3 flex items-center gap-2.5 rounded-xl px-4 py-2.5 animate-fade-in"
              style={{ background: "color-mix(in srgb, var(--error) 8%, var(--surface-raised))", border: "1px solid color-mix(in srgb, var(--error) 20%, transparent)" }}>
              <p className="text-xs flex-1" style={{ color: "var(--error)" }}>{error}</p>
              <button onClick={() => setError(null)} style={{ color: "var(--error)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-5">
              {messages.map((msg, i) => (
                <ChatMessage key={i} role={msg.role} content={msg.content} model={msg.model} modelProvider={msg.modelProvider} tokens={msg.tokens} latencyMs={msg.latencyMs} />
              ))}
              {isLoading && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>
                    <MicIcon size={14} />
                  </div>
                  <div className="py-3 px-1 flex items-center gap-1">
                    {[0, 150, 300].map((d) => (<span key={d} className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", opacity: 0.6, animationDelay: `${d}ms` }} />))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input bar */}
          <div className="px-4 pt-3 pb-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <UnifiedInput
              value={inputValue} onChange={setInputValue}
              onSend={() => handleChatSend()} onVoiceTranscript={handleChatSend}
              isLoading={isLoading} voiceState={voiceState}
              onStop={() => { setIsLoading(false); stopAudio(); }}
              placeholder="Reply\u2026"
            />
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE DEBATE STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const isRunning = debatePhase === "running";
  const isDone = debatePhase === "complete" || debatePhase === "error";

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <style>{`@keyframes ov-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {sidebarOpen && (
        <Sidebar
          conversations={conversations} debates={debates} activeConvId={conversationId}
          onSelectConv={loadConversation} onNew={handleNew} mode={mode} onSetMode={handleModeSwitch}
        />
      )}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0" style={{ background: "var(--surface)" }}>
        {/* Top bar */}
        <div className="flex items-center gap-2.5 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          {sidebarToggle}
          {debateSession && (
            <>
              <span className="text-xs font-semibold" style={{ color: "var(--warning)" }}>Debate</span>
              <span className="text-xs truncate flex-1" style={{ color: "var(--foreground-muted)" }}>{debateSession.topic}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isRunning && (
              <button
                onClick={handleDebateStop}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                style={{ background: "color-mix(in srgb, var(--error) 10%, transparent)", color: "var(--error)", border: "1px solid color-mix(in srgb, var(--error) 25%, transparent)" }}
              >
                <StopIcon size={10} /> Stop
              </button>
            )}
            {isDone && (
              <button
                onClick={handleNew}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                style={{ background: "var(--warning)", color: "#fff" }}
              >
                New Debate
              </button>
            )}
          </div>
        </div>

        {/* Agent cards */}
        {debateSession && (
          <div className="flex gap-3 px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <AgentCard profile={debateSession.agent_a} agent="a" isActive={activeAgent === "a"} />
            <div className="flex flex-col items-center justify-center gap-1 shrink-0">
              <div className="h-4 w-px" style={{ background: "var(--border)" }} />
              <span className="text-[9px] font-bold" style={{ color: "var(--foreground-muted)" }}>VS</span>
              <div className="h-4 w-px" style={{ background: "var(--border)" }} />
            </div>
            <AgentCard profile={debateSession.agent_b} agent="b" isActive={activeAgent === "b"} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 rounded-xl px-4 py-2.5 animate-fade-in"
            style={{ background: "color-mix(in srgb, var(--error) 8%, var(--surface-raised))", border: "1px solid color-mix(in srgb, var(--error) 20%, transparent)" }}>
            <p className="text-xs" style={{ color: "var(--error)" }}>{error}</p>
          </div>
        )}

        {/* Debate turns */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-2xl space-y-5">
            {debateTurns.map((turn) => (
              <TurnBubble key={turn.turnNumber} turn={turn} agentA={debateSession!.agent_a} agentB={debateSession!.agent_b} />
            ))}
            {isRunning && debateTurns.every((t) => !t.isThinking && !t.isPlaying) && currentTurn < (debateSession?.num_turns ?? 0) && (
              <div className="flex justify-center py-2" style={{ animation: "ov-fade-up 0.3s ease both" }}>
                <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
                  <WaveformBars active mode="think" bars={4} maxHeight={10} barWidth={2} gap={2} />
                  <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>Preparing next argument\u2026</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom progress bar */}
        <div className="px-4 py-3 shrink-0 flex items-center justify-between gap-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <TurnDots current={currentTurn} total={debateSession?.num_turns ?? numTurns} />
            <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
              {isDone ? "Debate complete" : `Turn ${currentTurn} of ${debateSession?.num_turns ?? numTurns}`}
            </span>
          </div>
          {isDone && (
            <button
              onClick={() => { setDebateTurns([]); setCurrentTurn(0); if (debateSession) runDebate(debateSession); }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: "var(--surface-raised)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 .49-4.99" />
              </svg>
              Replay
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
