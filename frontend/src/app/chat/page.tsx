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
  getDebateVoices,
  type ChatResponse,
  type ConversationSummary,
  type DebateSessionResponse,
  type AgentProfile,
  type DebateVoice,
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
type DebatePhase = "idle" | "setup" | "running" | "complete" | "error";

interface TurnDisplay {
  turnNumber: number;
  agent: "a" | "b";
  agentName: string;
  text: string;
  isThinking: boolean;
  isPlaying: boolean;
  model?: string;
  latencyMs?: number;
}

interface DebateHistoryItem {
  session_id: string;
  topic: string;
  agent_a_name: string;
  agent_b_name: string;
  num_turns: number;
  created_at: string | null;
}

// ── Robust TTS Playback ───────────────────────────────────────────────────────

async function playAudio(
  text: string,
  voiceId: string | undefined,
  onStart: () => void,
  onEnd: () => void,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
): Promise<void> {
  let stream: ReadableStream<Uint8Array>;
  try { stream = await getTextToSpeechStream(text, voiceId); }
  catch (e) { console.warn("[TTS] fetch failed:", e); onEnd(); return; }

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } catch (e) { console.warn("[TTS] read error:", e); onEnd(); return; }

  if (chunks.length === 0) { onEnd(); return; }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  if (totalLen < 200) {
    const merged = new Uint8Array(totalLen);
    let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
    if (merged[0] === 0x7b) { console.warn("[TTS] JSON error response, skipping"); onEnd(); return; }
  }

  const blob = new Blob(chunks, { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioRef.current = audio;
  onStart();
  return new Promise<void>((resolve) => {
    audio.onended = () => { URL.revokeObjectURL(url); onEnd(); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); onEnd(); resolve(); };
    audio.play().catch(() => { URL.revokeObjectURL(url); onEnd(); resolve(); });
  });
}

// ── SSE Parser ────────────────────────────────────────────────────────────────

async function parseSSE(stream: ReadableStream<Uint8Array>, onEvent: (e: Record<string, unknown>) => void): Promise<void> {
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
        if (raw) { try { onEvent(JSON.parse(raw)); } catch { /* skip */ } }
      }
    }
  }
}

// ── Agent Colors ──────────────────────────────────────────────────────────────

const A_COLOR = { solid: "var(--accent)", bg: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "color-mix(in srgb, var(--accent) 28%, transparent)" };
const B_COLOR = { solid: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 10%, transparent)", border: "color-mix(in srgb, var(--warning) 28%, transparent)" };
const agentColor = (a: "a" | "b") => (a === "a" ? A_COLOR : B_COLOR);

// ── Icons ─────────────────────────────────────────────────────────────────────

function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
function SendIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>;
}
function StopIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
}
function PlayIcon({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
}

// ── Voice Picker ──────────────────────────────────────────────────────────────

const GENDER_EMOJI: Record<string, string> = { male: "♂", female: "♀", neutral: "◎" };

function VoicePicker({
  voices, value, onChange, accentColor, label,
}: {
  voices: DebateVoice[];
  value: string;
  onChange: (id: string) => void;
  accentColor: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = voices.find((v) => v.id === value);

  return (
    <div className="relative">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: accentColor }}>{label}</p>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all"
        style={{ background: "var(--surface-raised)", border: `1px solid ${open ? accentColor : "var(--border)"}`, color: "var(--foreground)" }}
      >
        <span className="flex items-center gap-2">
          <span style={{ color: accentColor }}>{selected ? GENDER_EMOJI[selected.gender] : "◎"}</span>
          <span>{selected?.label ?? "Select voice"}</span>
          {selected && <span className="rounded-md px-1.5 py-0.5 text-[9px]" style={{ background: "var(--surface-overlay)", color: "var(--foreground-muted)" }}>{selected.style}</span>}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: "var(--foreground-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl overflow-hidden py-1"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.14)" }}>
          <div className="max-h-52 overflow-y-auto">
            {voices.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onChange(v.id); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-all"
                style={{
                  background: v.id === value ? `color-mix(in srgb, ${accentColor} 10%, transparent)` : "transparent",
                  color: v.id === value ? accentColor : "var(--foreground)",
                }}
              >
                <span className="w-4 text-center text-[11px]" style={{ color: v.id === value ? accentColor : "var(--foreground-muted)" }}>
                  {GENDER_EMOJI[v.gender]}
                </span>
                <span className="flex-1 font-medium">{v.label}</span>
                <span className="text-[9px]" style={{ color: "var(--foreground-muted)" }}>{v.style}</span>
                {v.id === value && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: accentColor }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ conversations, debates, activeConvId, onSelectConv, onNew, mode, onSetMode }: {
  conversations: ConversationSummary[]; debates: DebateHistoryItem[]; activeConvId: string | null;
  onSelectConv: (id: string) => void; onNew: () => void; mode: Mode; onSetMode: (m: Mode) => void;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
      <div className="p-2.5">
        <button onClick={onNew} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all"
          style={{ color: "var(--foreground-muted)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
          New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>Chats</p>
        {conversations.length === 0
          ? <p className="px-3 py-3 text-center text-[10px]" style={{ color: "var(--foreground-muted)" }}>No chats yet</p>
          : <div className="space-y-0.5">{conversations.map((c) => {
              const active = mode === "chat" && activeConvId === c.id;
              return (
                <button key={c.id} onClick={() => { onSetMode("chat"); onSelectConv(c.id); }}
                  className="w-full rounded-lg px-3 py-2 text-left transition-all"
                  style={{ background: active ? "var(--surface-active)" : "transparent", color: active ? "var(--foreground)" : "var(--foreground-muted)" }}>
                  <p className="truncate text-[11px] font-medium">{c.title}</p>
                  <p className="mt-0.5 text-[9px] opacity-50">{c.message_count} msg</p>
                </button>
              );
            })}</div>
        }
        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--warning)" }}>Debates</p>
        {debates.length === 0
          ? <p className="px-3 py-3 text-center text-[10px]" style={{ color: "var(--foreground-muted)" }}>No debates yet</p>
          : <div className="space-y-0.5">{debates.map((d) => (
              <button key={d.session_id} onClick={() => onSetMode("debate")}
                className="w-full rounded-lg px-3 py-2 text-left transition-all" style={{ color: "var(--foreground-muted)" }}>
                <p className="truncate text-[11px] font-medium">{d.topic}</p>
                <p className="mt-0.5 text-[9px] opacity-50">{d.agent_a_name} vs {d.agent_b_name}</p>
              </button>
            ))}</div>
        }
      </div>
    </aside>
  );
}

// ── Unified Chat Input ────────────────────────────────────────────────────────

function UnifiedInput({ value, onChange, onSend, onVoiceTranscript, isLoading, voiceState, onStop, placeholder, centered }: {
  value: string; onChange: (v: string) => void; onSend: () => void; onVoiceTranscript: (t: string) => void;
  isLoading: boolean; voiceState: VoiceState; onStop: () => void; placeholder: string; centered?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHoldRef = useRef(false);
  const { isRecording, interimTranscript, startRecording, stopRecording } = useSpeechRecognition({ onFinal: onVoiceTranscript });

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
    if (!hasText) holdTimerRef.current = setTimeout(() => { wasHoldRef.current = true; startRecording(); }, 200);
  };
  const handlePointerUp = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (isRecording) { stopRecording(); return; }
    if (!wasHoldRef.current && !hasText && !busy) { startRecording(); return; }
    if (!wasHoldRef.current && hasText && !busy) onSend();
    wasHoldRef.current = false;
  };
  const handlePointerLeave = () => { if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; } };

  let btnBg: string, btnColor: string;
  if (busy) { btnBg = "var(--error)"; btnColor = "#fff"; }
  else if (isRecording) { btnBg = "var(--error)"; btnColor = "#fff"; }
  else if (hasText) { btnBg = "var(--accent)"; btnColor = "#fff"; }
  else { btnBg = "var(--surface-hover)"; btnColor = "var(--foreground-muted)"; }

  return (
    <div className={centered ? "w-full max-w-2xl mx-auto" : "mx-auto max-w-2xl"}>
      {isRecording && (
        <div className="mb-2 flex items-center gap-2 px-1 animate-fade-in">
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--error)" }} />
          <span className="text-sm" style={{ color: "var(--foreground-muted)" }}>{interimTranscript ? `\u201C${interimTranscript}\u201D` : "Listening\u2026"}</span>
        </div>
      )}
      <div className="relative rounded-2xl transition-all duration-200"
        style={{ background: "var(--surface-raised)", border: `1px solid ${isRecording ? "var(--accent)" : "var(--border)"}`, boxShadow: isRecording ? "0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)" : "0 1px 3px rgba(0,0,0,0.04)" }}>
        <textarea ref={textareaRef} value={isRecording ? "" : value} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={isRecording ? (interimTranscript || "Listening\u2026") : placeholder} disabled={busy} rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-12 text-sm leading-relaxed outline-none"
          style={{ color: "var(--foreground)", minHeight: "56px", maxHeight: "200px" }} />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <div className="flex items-center gap-2 px-2">
            {voiceState === "speak" && <div className="flex items-center gap-1.5 animate-fade-in"><WaveformBars active mode="speak" bars={5} maxHeight={12} barWidth={2} gap={2} /><span className="text-[10px] font-medium" style={{ color: "var(--success)" }}>Speaking</span></div>}
            {voiceState === "think" && <div className="flex items-center gap-1.5 animate-fade-in"><div className="flex gap-0.5">{[0,150,300].map((d) => <span key={d} className="h-1 w-1 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: `${d}ms` }} />)}</div><span className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>Thinking</span></div>}
          </div>
          <button onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerLeave={handlePointerLeave} onClick={busy ? onStop : undefined}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 select-none touch-none"
            style={{ background: btnBg, color: btnColor, boxShadow: isRecording ? "0 0 12px color-mix(in srgb, var(--error) 40%, transparent)" : "none" }}
            title={busy ? "Stop" : isRecording ? "Release to stop" : hasText ? "Send" : "Hold to speak"}>
            {busy ? <StopIcon /> : isRecording ? <MicIcon size={16} /> : hasText ? <SendIcon size={16} /> : <MicIcon size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Turn Card (debate split view) ─────────────────────────────────────────────

function TurnCard({ turn, agent, delayIndex }: { turn: TurnDisplay; agent: "a" | "b"; delayIndex: number }) {
  const c = agentColor(agent);
  return (
    <div className="rounded-xl p-4 transition-all duration-300"
      style={{
        background: turn.isPlaying ? c.bg : "var(--surface-raised)",
        border: `1px solid ${turn.isPlaying ? c.border : "var(--border)"}`,
        boxShadow: turn.isPlaying ? `0 0 20px color-mix(in srgb, ${c.solid} 20%, transparent)` : "none",
        animation: `ov-fade-up 0.4s ${delayIndex * 50}ms ease both`,
      }}>
      {turn.isThinking ? (
        <div className="flex items-center gap-2 py-2">
          <WaveformBars active mode="think" bars={5} maxHeight={14} barWidth={2} gap={2} />
          <span className="text-xs italic" style={{ color: "var(--foreground-muted)" }}>Crafting argument&hellip;</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: c.solid }}>Turn {turn.turnNumber}</span>
            {turn.latencyMs && <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>{Math.round(turn.latencyMs)}ms</span>}
            {turn.isPlaying && <WaveformBars active mode="speak" bars={4} maxHeight={12} barWidth={2} gap={2} />}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--foreground)" }}>{turn.text}</p>
          {turn.model && !turn.isPlaying && (
            <div className="mt-2.5">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--surface-overlay)", color: "var(--foreground-muted)" }}>
                {turn.model.includes("claude") ? "Claude · Bedrock" : turn.model.split("/").pop()}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Split Debate View ─────────────────────────────────────────────────────────

function DebateSplitView({ session, turns, activeAgent, debatePhase }: {
  session: DebateSessionResponse; turns: TurnDisplay[];
  activeAgent: "a" | "b" | null; debatePhase: DebatePhase;
}) {
  const colARef = useRef<HTMLDivElement>(null);
  const colBRef = useRef<HTMLDivElement>(null);
  const turnsA = turns.filter((t) => t.agent === "a");
  const turnsB = turns.filter((t) => t.agent === "b");
  const isRunning = debatePhase === "running";

  // Auto-scroll the active column whenever that agent's turns update
  useEffect(() => {
    if (activeAgent === "a") colARef.current?.scrollTo({ top: colARef.current.scrollHeight, behavior: "smooth" });
    if (activeAgent === "b") colBRef.current?.scrollTo({ top: colBRef.current.scrollHeight, behavior: "smooth" });
  }, [turnsA.length, turnsB.length, activeAgent]);

  return (
    <div className="flex-1 grid grid-cols-2 overflow-hidden min-h-0">
      {/* ── Column A ── */}
      <div className="flex flex-col min-h-0" style={{ borderRight: "1px solid var(--border)" }}>
        <div className="shrink-0 px-4 py-3 transition-all duration-300"
          style={{ background: activeAgent === "a" && isRunning ? A_COLOR.bg : "var(--surface)", borderBottom: `2px solid ${activeAgent === "a" && isRunning ? A_COLOR.solid : "var(--border)"}` }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
              style={{ background: A_COLOR.bg, color: A_COLOR.solid, border: `1px solid ${A_COLOR.border}` }}>
              {session.agent_a.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate" style={{ color: "var(--foreground)" }}>{session.agent_a.name}</p>
              <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: "var(--foreground-muted)" }}>{session.agent_a.perspective}</p>
            </div>
            {activeAgent === "a" && isRunning && (
              <div className="shrink-0"><WaveformBars active mode="speak" bars={4} maxHeight={16} barWidth={2} gap={2} /></div>
            )}
          </div>
        </div>
        <div ref={colARef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {turnsA.map((t, i) => <TurnCard key={t.turnNumber} turn={t} agent="a" delayIndex={i} />)}
          {turnsA.length === 0 && <p className="text-xs text-center py-10" style={{ color: "var(--foreground-muted)" }}>Awaiting opening statement&hellip;</p>}
        </div>
      </div>

      {/* ── Column B ── */}
      <div className="flex flex-col min-h-0">
        <div className="shrink-0 px-4 py-3 transition-all duration-300"
          style={{ background: activeAgent === "b" && isRunning ? B_COLOR.bg : "var(--surface)", borderBottom: `2px solid ${activeAgent === "b" && isRunning ? B_COLOR.solid : "var(--border)"}` }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
              style={{ background: B_COLOR.bg, color: B_COLOR.solid, border: `1px solid ${B_COLOR.border}` }}>
              {session.agent_b.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate" style={{ color: "var(--foreground)" }}>{session.agent_b.name}</p>
              <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: "var(--foreground-muted)" }}>{session.agent_b.perspective}</p>
            </div>
            {activeAgent === "b" && isRunning && (
              <div className="shrink-0"><WaveformBars active mode="speak" bars={4} maxHeight={16} barWidth={2} gap={2} /></div>
            )}
          </div>
        </div>
        <div ref={colBRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {turnsB.map((t, i) => <TurnCard key={t.turnNumber} turn={t} agent="b" delayIndex={i} />)}
          {turnsB.length === 0 && turnsA.length > 0 && <p className="text-xs text-center py-10" style={{ color: "var(--foreground-muted)" }}>Preparing response&hellip;</p>}
          {turnsB.length === 0 && turnsA.length === 0 && <p className="text-xs text-center py-10" style={{ color: "var(--foreground-muted)" }}>Awaiting debate start&hellip;</p>}
        </div>
      </div>
    </div>
  );
}

// ── Turn Progress ─────────────────────────────────────────────────────────────

function TurnDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const c = n % 2 === 1 ? "var(--accent)" : "var(--warning)";
        return (
          <span key={n} className="rounded-full transition-all duration-300"
            style={{ width: n === current ? "16px" : "6px", height: "6px", background: n <= current ? c : "var(--border)", opacity: n < current ? 0.5 : 1 }} />
        );
      })}
    </div>
  );
}

// ── Mode Toggle ───────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded-xl p-0.5" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
      {(["chat", "debate"] as Mode[]).map((m) => (
        <button key={m} onClick={() => onChange(m)} className="rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200"
          style={{
            background: mode === m ? (m === "debate" ? "color-mix(in srgb, var(--warning) 15%, var(--surface-raised))" : "var(--surface-active)") : "transparent",
            color: mode === m ? (m === "debate" ? "var(--warning)" : "var(--foreground)") : "var(--foreground-muted)",
          }}>
          {m === "chat" ? "Chat" : "Debate"}
        </button>
      ))}
    </div>
  );
}

// ── Topic categories ──────────────────────────────────────────────────────────

const DEBATE_STARTERS = [
  { label: "AI & Tech", topics: ["Should AI replace developers?", "Is open source better than proprietary software?", "Does social media do more harm than good?"] },
  { label: "Work & Society", topics: ["Is remote work better than office work?", "Should the 4-day work week be standard?", "Is UBI the future of economics?"] },
  { label: "Infrastructure", topics: ["Microservices vs monolith?", "Cloud-native vs on-prem?", "Is Kubernetes worth the complexity?"] },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ChatPage() {
  const [mode, setMode] = useState<Mode>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  // Debate
  const [debatePhase, setDebatePhase] = useState<DebatePhase>("idle");
  const [debateSession, setDebateSession] = useState<DebateSessionResponse | null>(null);
  const [debateTurns, setDebateTurns] = useState<TurnDisplay[]>([]);
  const [numTurns, setNumTurns] = useState(6);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [activeAgent, setActiveAgent] = useState<"a" | "b" | null>(null);
  const [debates, setDebates] = useState<DebateHistoryItem[]>([]);
  const [voices, setVoices] = useState<DebateVoice[]>([]);
  const [voiceA, setVoiceA] = useState("English_expressive_narrator");
  const [voiceB, setVoiceB] = useState("Deep_Voice_Man");
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const stoppedRef = useRef(false);

  const hasMessages = messages.length > 0;
  const debateActive = debatePhase !== "idle";
  const showStarting = mode === "chat" ? !hasMessages : !debateActive;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const refreshConversations = useCallback(async () => {
    try { const d = await listConversations(30); setConversations(d.conversations); } catch { /* ok */ }
  }, []);
  const refreshDebates = useCallback(async () => {
    try { const d = await listDebateSessions(10); setDebates(d.sessions); } catch { /* ok */ }
  }, []);
  useEffect(() => {
    refreshConversations(); refreshDebates();
    getDebateVoices().then(setVoices).catch(() => setVoices([]));
  }, [refreshConversations, refreshDebates]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const d = await getConversationMessages(id);
      setMessages(d.messages.map((m) => ({
        role: m.role as "user" | "assistant", content: m.content, model: m.model ?? undefined,
        tokens: m.input_tokens != null && m.output_tokens != null ? { input: m.input_tokens, output: m.output_tokens } : undefined,
        latencyMs: m.latency_ms ?? undefined,
      })));
      setConversationId(id); setMode("chat");
    } catch { /* ok */ }
  }, []);

  // ── Shared helpers ────────────────────────────────────────────────────────

  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    setVoiceState("idle");
  }, []);

  const handleNew = useCallback(() => {
    if (mode === "chat") { setMessages([]); setConversationId(null); }
    else { stoppedRef.current = true; stopAudio(); setDebatePhase("idle"); setDebateSession(null); setDebateTurns([]); setCurrentTurn(0); setActiveAgent(null); }
    setInputValue(""); setError(null); setVoiceState("idle");
  }, [mode, stopAudio]);

  const handleModeSwitch = useCallback((m: Mode) => {
    if (m === mode) return; stopAudio(); setMode(m); setError(null);
  }, [mode, stopAudio]);

  // ── Chat ──────────────────────────────────────────────────────────────────

  const handleChatSend = useCallback(async (text?: string) => {
    const msg = (text ?? inputValue).trim();
    if (!msg || isLoading) return;
    setMessages((p) => [...p, { role: "user", content: msg }]);
    setInputValue(""); setIsLoading(true); setVoiceState("think"); setError(null);
    try {
      const d: ChatResponse = await sendChatMessage(msg, conversationId);
      setConversationId(d.conversation_id);
      setMessages((p) => [...p, { role: "assistant", content: d.response, model: d.model, modelProvider: d.model_provider, tokens: d.tokens, latencyMs: d.latency_ms }]);
      refreshConversations();
      await playAudio(d.response, undefined, () => setVoiceState("speak"), () => setVoiceState("idle"), audioRef);
    } catch (e) {
      const msg2 = e instanceof Error ? e.message : "Something went wrong";
      setError(msg2);
      setMessages((p) => [...p, { role: "assistant", content: `Sorry, I encountered an error: ${msg2}` }]);
      setVoiceState("idle");
    } finally { setIsLoading(false); }
  }, [conversationId, refreshConversations, inputValue, isLoading]);

  // ── Debate ────────────────────────────────────────────────────────────────

  const runDebate = useCallback(async (sess: DebateSessionResponse) => {
    setDebatePhase("running"); stoppedRef.current = false;
    for (let turn = 1; turn <= sess.num_turns; turn++) {
      if (stoppedRef.current) break;
      const agent = turn % 2 === 1 ? "a" as const : "b" as const;
      setCurrentTurn(turn); setActiveAgent(agent);
      setDebateTurns((p) => [...p, { turnNumber: turn, agent, agentName: agent === "a" ? sess.agent_a.name : sess.agent_b.name, text: "", isThinking: true, isPlaying: false }]);

      let turnText = "", turnVoice = agent === "a" ? sess.agent_a.voice : sess.agent_b.voice;
      let turnModel = "", turnLatency = 0;
      try {
        const sseStream = await streamDebateTurn(sess.session_id, turn);
        await parseSSE(sseStream, (evt) => {
          if (evt.type === "text") {
            turnText = (evt.text as string) || "";
            turnVoice = (evt.voice as string) || turnVoice;
            turnModel = (evt.model as string) || "";
            turnLatency = (evt.latency_ms as number) || 0;
            setDebateTurns((p) => p.map((t, i) => i === p.length - 1 ? { ...t, text: turnText, isThinking: false, model: turnModel, latencyMs: turnLatency } : t));
          }
        });
      } catch (e) {
        if (!stoppedRef.current) { setError(e instanceof Error ? e.message : "Turn failed"); setDebatePhase("error"); }
        return;
      }
      if (stoppedRef.current) break;

      if (turnText) {
        setDebateTurns((p) => p.map((t, i) => i === p.length - 1 ? { ...t, isPlaying: true } : t));
        await playAudio(turnText, turnVoice, () => {}, () => {
          setDebateTurns((p) => p.map((t, i) => i === p.length - 1 ? { ...t, isPlaying: false } : t));
        }, audioRef);
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
      const sess = await startDebate(t, numTurns, voiceA, voiceB);
      setDebateSession(sess); setInputValue(""); setDebateTurns([]); setCurrentTurn(0);
      runDebate(sess);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start debate");
      setDebatePhase("error");
    }
  }, [inputValue, numTurns, voiceA, voiceB, runDebate]);

  const handleDebateStop = useCallback(() => {
    stoppedRef.current = true; stopAudio(); setActiveAgent(null); setDebatePhase("complete");
    setDebateTurns((p) => p.map((t) => t.isThinking ? { ...t, isThinking: false, text: "[Stopped]" } : { ...t, isPlaying: false }));
  }, [stopAudio]);

  const CHAT_STARTERS = ["Is api-gateway healthy?", "Blast radius if postgres fails?", "Any P1 incidents right now?", "Summarize this week\u2019s alerts"];

  const sidebarToggle = (
    <button onClick={() => setSidebarOpen((v) => !v)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-all" style={{ color: "var(--foreground-muted)" }}>
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
        <style>{`@keyframes ov-fade-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
        {sidebarOpen && <Sidebar conversations={conversations} debates={debates} activeConvId={conversationId} onSelectConv={loadConversation} onNew={handleNew} mode={mode} onSetMode={handleModeSwitch} />}
        <div className="flex flex-1 flex-col min-w-0 overflow-y-auto" style={{ background: "var(--surface)" }}>
          <div className="px-4 py-2 shrink-0">{sidebarToggle}</div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
            <div className="w-full max-w-2xl" style={{ animation: "ov-fade-up 0.4s ease both" }}>
              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--foreground)", letterSpacing: "-0.03em" }}>OpsVoice</h1>
                <p className="mt-2 text-sm" style={{ color: "var(--foreground-muted)" }}>
                  {mode === "chat" ? "Ask about incidents, services, latency, or anything in your infrastructure." : "Two AI voices, one topic, live audio debate."}
                </p>
                <div className="mt-5"><ModeToggle mode={mode} onChange={handleModeSwitch} /></div>
              </div>

              {/* ── Chat Mode ── */}
              {mode === "chat" && (
                <>
                  <UnifiedInput value={inputValue} onChange={setInputValue} onSend={() => handleChatSend()} onVoiceTranscript={handleChatSend}
                    isLoading={isLoading} voiceState={voiceState} onStop={() => { setIsLoading(false); stopAudio(); }} placeholder="Ask about your infrastructure\u2026" centered />
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {CHAT_STARTERS.map((p) => (
                      <button key={p} onClick={() => handleChatSend(p)} disabled={isLoading}
                        className="rounded-full px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40"
                        style={{ color: "var(--foreground-muted)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── Debate Mode ── */}
              {mode === "debate" && (
                <div className="space-y-4">
                  {/* Topic input */}
                  <div className="flex items-center gap-2 rounded-2xl p-2"
                    style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) handleDebateStart(); }}
                      placeholder="Enter a debate topic\u2026" disabled={debatePhase === "setup"} autoFocus
                      className="flex-1 bg-transparent px-3 py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} />
                    <button onClick={handleDebateStart} disabled={debatePhase === "setup" || !inputValue.trim()}
                      className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all shrink-0"
                      style={{
                        background: inputValue.trim() && debatePhase !== "setup" ? "var(--warning)" : "var(--surface-overlay)",
                        color: inputValue.trim() && debatePhase !== "setup" ? "#fff" : "var(--foreground-muted)",
                        cursor: debatePhase === "setup" || !inputValue.trim() ? "not-allowed" : "pointer",
                      }}>
                      {debatePhase === "setup"
                        ? <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="55" strokeDashoffset="20" /></svg>Crafting&hellip;</>
                        : <><PlayIcon />Start Debate</>}
                    </button>
                  </div>

                  {/* Controls row: turns + voice toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium" style={{ color: "var(--foreground-muted)" }}>Turns</span>
                      <div className="flex gap-1.5">
                        {[4, 6, 8].map((n) => (
                          <button key={n} onClick={() => setNumTurns(n)} className="rounded-lg px-3 py-1 text-xs font-semibold transition-all"
                            style={{ background: numTurns === n ? "var(--warning)" : "var(--surface-raised)", color: numTurns === n ? "#fff" : "var(--foreground-muted)", border: `1px solid ${numTurns === n ? "transparent" : "var(--border)"}` }}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>{numTurns / 2} exchanges</span>
                    </div>
                    <button onClick={() => setShowVoicePicker((x) => !x)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all"
                      style={{ background: showVoicePicker ? "color-mix(in srgb, var(--warning) 12%, transparent)" : "var(--surface-raised)", color: showVoicePicker ? "var(--warning)" : "var(--foreground-muted)", border: `1px solid ${showVoicePicker ? "color-mix(in srgb, var(--warning) 30%, transparent)" : "var(--border)"}` }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                      Voices
                      {showVoicePicker ? " ▲" : " ▼"}
                    </button>
                  </div>

                  {/* Voice pickers (collapsible) */}
                  {showVoicePicker && voices.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 rounded-xl p-4" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", animation: "ov-fade-up 0.2s ease both" }}>
                      <VoicePicker voices={voices} value={voiceA} onChange={setVoiceA} accentColor="var(--accent)" label="Agent A voice" />
                      <VoicePicker voices={voices} value={voiceB} onChange={setVoiceB} accentColor="var(--warning)" label="Agent B voice" />
                    </div>
                  )}

                  {/* Topic suggestions */}
                  <div className="space-y-2">
                    {DEBATE_STARTERS.map((cat) => (
                      <div key={cat.label}>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider px-0.5" style={{ color: "var(--foreground-muted)" }}>{cat.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.topics.map((t) => (
                            <button key={t} onClick={() => setInputValue(t)} disabled={debatePhase === "setup"}
                              className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-all disabled:opacity-40"
                              style={{ color: "var(--foreground-muted)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl px-4 py-2.5 text-xs" style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 8%, var(--surface-raised))", border: "1px solid color-mix(in srgb, var(--error) 20%, transparent)" }}>
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
        {sidebarOpen && <Sidebar conversations={conversations} debates={debates} activeConvId={conversationId} onSelectConv={loadConversation} onNew={handleNew} mode={mode} onSetMode={handleModeSwitch} />}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0" style={{ background: "var(--surface)" }}>
          <div className="flex items-center gap-2.5 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            {sidebarToggle}
            <span className="text-xs font-medium" style={{ color: "var(--foreground-muted)" }}>{conversationId ? "Conversation" : "New chat"}</span>
            {voiceState === "speak" && <button onClick={stopAudio} className="ml-auto rounded-lg px-2.5 py-1 text-[10px] font-medium" style={{ color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>Stop audio</button>}
          </div>
          {error && (
            <div className="mx-4 mt-3 flex items-center gap-2.5 rounded-xl px-4 py-2.5"
              style={{ background: "color-mix(in srgb, var(--error) 8%, var(--surface-raised))", border: "1px solid color-mix(in srgb, var(--error) 20%, transparent)" }}>
              <p className="text-xs flex-1" style={{ color: "var(--error)" }}>{error}</p>
              <button onClick={() => setError(null)} style={{ color: "var(--error)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          )}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-5">
              {messages.map((msg, i) => (
                <ChatMessage key={i} role={msg.role} content={msg.content} model={msg.model} modelProvider={msg.modelProvider} tokens={msg.tokens} latencyMs={msg.latencyMs} />
              ))}
              {isLoading && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}><MicIcon size={14} /></div>
                  <div className="py-3 px-1 flex items-center gap-1">{[0,150,300].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", opacity: 0.6, animationDelay: `${d}ms` }} />)}</div>
                </div>
              )}
            </div>
          </div>
          <div className="px-4 pt-3 pb-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <UnifiedInput value={inputValue} onChange={setInputValue} onSend={() => handleChatSend()} onVoiceTranscript={handleChatSend}
              isLoading={isLoading} voiceState={voiceState} onStop={() => { setIsLoading(false); stopAudio(); }} placeholder="Reply\u2026" />
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE DEBATE STATE — SPLIT LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════

  const isRunning = debatePhase === "running";
  const isDone = debatePhase === "complete" || debatePhase === "error";

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <style>{`@keyframes ov-fade-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {sidebarOpen && <Sidebar conversations={conversations} debates={debates} activeConvId={conversationId} onSelectConv={loadConversation} onNew={handleNew} mode={mode} onSetMode={handleModeSwitch} />}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0" style={{ background: "var(--surface)" }}>
        {/* Top bar */}
        <div className="flex items-center gap-2.5 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          {sidebarToggle}
          <span className="text-xs font-semibold" style={{ color: "var(--warning)" }}>Debate</span>
          {debateSession && <span className="text-xs truncate flex-1" style={{ color: "var(--foreground-muted)" }}>{debateSession.topic}</span>}
          <div className="ml-auto flex items-center gap-2">
            {isRunning && (
              <button onClick={handleDebateStop} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                style={{ background: "color-mix(in srgb, var(--error) 10%, transparent)", color: "var(--error)", border: "1px solid color-mix(in srgb, var(--error) 25%, transparent)" }}>
                <StopIcon size={10} /> Stop
              </button>
            )}
            {isDone && (
              <button onClick={handleNew} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                style={{ background: "var(--warning)", color: "#fff" }}>
                New Debate
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-xl px-4 py-2.5"
            style={{ background: "color-mix(in srgb, var(--error) 8%, var(--surface-raised))", border: "1px solid color-mix(in srgb, var(--error) 20%, transparent)" }}>
            <p className="text-xs" style={{ color: "var(--error)" }}>{error}</p>
          </div>
        )}

        {debateSession && (
          <DebateSplitView session={debateSession} turns={debateTurns} activeAgent={activeAgent} debatePhase={debatePhase} />
        )}

        {/* Bottom progress bar */}
        <div className="px-4 py-3 shrink-0 flex items-center justify-between gap-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <TurnDots current={currentTurn} total={debateSession?.num_turns ?? numTurns} />
            <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
              {isDone ? "Debate complete" : isRunning ? `Turn ${currentTurn} of ${debateSession?.num_turns ?? numTurns}` : "Starting\u2026"}
            </span>
          </div>
          {isDone && (
            <button onClick={() => { setDebateTurns([]); setCurrentTurn(0); if (debateSession) runDebate(debateSession); }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: "var(--surface-raised)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>
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
