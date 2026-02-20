"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChatInput,
  ChatInputTextArea,
  ChatInputSubmit,
} from "@/components/ui/chat-input";
import { VoiceBubble } from "@/components/ui/voice-bubble";
import { ChatMessage } from "@/components/ChatMessage";
import {
  sendChatMessage,
  listConversations,
  getConversationMessages,
  getTextToSpeech,
  testKeysLive,
  type ChatResponse,
  type ConversationSummary,
  type KeyTestResponse,
} from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  modelProvider?: string;
  tokens?: { input: number; output: number };
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// API Key Status Panel (discrete dropdown in sidebar footer)
// ---------------------------------------------------------------------------
function ApiKeyPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KeyTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await testKeysLive();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setLoading(false);
    }
  };

  const dot = (status: string) => {
    const color =
      status === "ok" ? "var(--success)" : status === "warning" ? "var(--warning)" : "var(--error)";
    return (
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
    );
  };

  const SERVICES = [
    { key: "bedrock", label: "AWS Bedrock" },
    { key: "minimax_llm", label: "MiniMax M2.5" },
    { key: "minimax_tts", label: "MiniMax TTS" },
    { key: "datadog", label: "Datadog" },
    { key: "postgres", label: "PostgreSQL" },
  ] as const;

  const overallOk = result?.all_ok;
  const overallColor = overallOk ? "var(--success)" : result ? "var(--error)" : "var(--foreground-muted)";

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-all"
        style={{ color: "var(--foreground-muted)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: overallColor }}
        />
        <span className="flex-1 text-[11px] font-medium">API Status</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="px-3 pb-3">
          {/* Service rows */}
          <div className="mb-2 space-y-1.5">
            {SERVICES.map(({ key, label }) => {
              const svc = result?.results[key as keyof typeof result.results];
              const status = svc?.status ?? "unknown";
              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--foreground-muted)" }}>
                    {dot(status)}
                    {label}
                  </span>
                  <div className="text-right">
                    {svc?.latency_ms && (
                      <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
                        {svc.latency_ms}ms
                      </span>
                    )}
                    {svc?.method && (
                      <span className="ml-1 text-[10px]" style={{ color: "var(--accent)" }}>
                        [{svc.method}]
                      </span>
                    )}
                    {svc?.error && (
                      <span className="ml-1 text-[10px]" style={{ color: "var(--error)" }}>
                        {svc.error.slice(0, 22)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="mb-2 text-[10px]" style={{ color: "var(--error)" }}>{error}</p>
          )}

          <button
            onClick={run}
            disabled={loading}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all"
            style={{
              background: "var(--surface-raised)",
              color: loading ? "var(--foreground-muted)" : "var(--accent)",
              border: "1px solid var(--border)",
            }}
          >
            {loading ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                </svg>
                Testing…
              </>
            ) : (
              "Run Test"
            )}
          </button>

          {result && (
            <p className="mt-1.5 text-center text-[10px]" style={{ color: overallOk ? "var(--success)" : "var(--error)" }}>
              {overallOk ? "All systems go ✓" : "Issues detected"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-glass-border bg-surface/60 backdrop-blur-xl">
      {/* New chat */}
      <div className="p-2.5">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-xl border border-glass-border bg-glass-bg px-3 py-2 text-xs font-semibold text-foreground-muted transition-all hover:border-accent/20 hover:bg-accent/5 hover:text-foreground"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
          New conversation
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-foreground-muted">
            No conversations yet
          </p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((c) => {
              const isActive = activeId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`group w-full rounded-xl px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? "bg-accent/12 border border-accent/20 text-foreground"
                      : "border border-transparent text-foreground-muted hover:bg-white/4 hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-accent-light animate-pulse" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-accent-light">
                        Active
                      </span>
                    </div>
                  )}
                  <p className="truncate text-[11px] font-medium leading-snug">{c.title}</p>
                  {c.last_message && (
                    <p className="mt-0.5 truncate text-[10px] opacity-55 leading-snug">
                      {c.last_message}
                    </p>
                  )}
                  <p className="mt-1 text-[9px] opacity-40">{c.message_count} messages</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ApiKeyPanel />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await listConversations(30);
      setConversations(data.conversations);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const data = await getConversationMessages(id);
      setMessages(data.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        model: m.model ?? undefined,
        tokens: m.input_tokens != null && m.output_tokens != null
          ? { input: m.input_tokens, output: m.output_tokens }
          : undefined,
        latencyMs: m.latency_ms ?? undefined,
      })));
      setConversationId(id);
    } catch {
      // non-critical
    }
  }, []);

  const handleNew = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setCurrentModel(null);
    setError(null);
    // Stop any playing TTS
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      setIsTTSPlaying(false);
    }
  }, []);

  /** Auto-play TTS for an assistant response */
  const playTTS = useCallback(async (text: string) => {
    // Stop previous TTS if any
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
    }
    setIsTTSPlaying(true);
    try {
      const audioBuffer = await getTextToSpeech(text);
      const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudioRef.current = audio;

      audio.onended = () => {
        setIsTTSPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsTTSPlaying(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      // TTS failure is non-fatal — user can still read the response
      setIsTTSPlaying(false);
    }
  }, []);

  const handleSend = useCallback(
    async (text?: string) => {
      const finalText = (text ?? inputValue).trim();
      if (!finalText || isLoading) return;

      setMessages((prev) => [...prev, { role: "user", content: finalText }]);
      setInputValue("");
      setIsLoading(true);
      setError(null);

      try {
        const data: ChatResponse = await sendChatMessage(finalText, conversationId);
        setConversationId(data.conversation_id);
        setCurrentModel(data.model);

        const assistantMsg: Message = {
          role: "assistant",
          content: data.response,
          model: data.model,
          modelProvider: data.model_provider,
          tokens: data.tokens,
          latencyMs: data.latency_ms,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        refreshConversations();

        // Auto-play TTS response
        playTTS(data.response);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setError(msg);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Sorry, I encountered an error: ${msg}` },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, refreshConversations, inputValue, isLoading, playTTS]
  );

  const STARTERS = [
    "Is api-gateway healthy?",
    "What's the blast radius if postgres-main fails?",
    "Any P1 incidents right now?",
    "Summarize this week's alerts",
  ];

  const hasMessages = messages.length > 0;

  // Friendly short model label for footer
  const modelLabel = currentModel
    ? (currentModel.split(".").pop()?.split("-").slice(0, 3).join("-") ?? currentModel)
    : "Claude on Bedrock";

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      {sidebarOpen && (
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          onSelect={loadConversation}
          onNew={handleNew}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <div className="flex items-center gap-2.5 border-b border-glass-border bg-surface/70 px-4 py-2 backdrop-blur-xl shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--foreground-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <span className="text-xs font-semibold text-foreground-muted">
            {conversationId ? "Conversation" : "New conversation"}
          </span>

          {conversationId && (
            <span className="font-mono text-[9px] text-foreground-muted opacity-40">
              {conversationId.slice(0, 8)}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-success/15 bg-success/6 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-semibold text-success">Live</span>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-3 flex items-center gap-2.5 rounded-xl border border-error/25 bg-error/8 px-4 py-2.5 animate-fade-in">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-error">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs text-error flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-error/60 hover:text-error">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-2xl space-y-5">
            {/* Empty state */}
            {!hasMessages && (
              <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
                {/* Hero bubble */}
                <div className="relative mb-7">
                  <div
                    className="rounded-full"
                    style={{
                      width: 96,
                      height: 96,
                      background:
                        "radial-gradient(circle at 38% 32%, rgba(129,140,248,1) 0%, rgba(99,102,241,0.85) 30%, rgba(168,85,247,0.7) 60%, rgba(236,72,153,0.5) 85%, transparent 100%)",
                      boxShadow:
                        "inset 0 0 24px rgba(255,255,255,0.28), 0 0 48px rgba(99,102,241,0.35), 0 0 100px rgba(168,85,247,0.12)",
                    }}
                  />
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)",
                      filter: "blur(18px)",
                      transform: "scale(1.6)",
                    }}
                  />
                </div>

                <h2 className="text-xl font-bold tracking-tight text-foreground">OpsVoice</h2>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-foreground-muted">
                  Your AI operations assistant. Speak or type — ask about incidents,
                  services, latency, or anything in your infrastructure.
                </p>

                {/* Stack badges */}
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {[
                    { label: "Claude on Bedrock", c: "#FF9900" },
                    { label: "MiniMax TTS", c: "#818cf8" },
                    { label: "Datadog LLM Obs", c: "#9b4dca" },
                  ].map((b) => (
                    <span
                      key={b.label}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                      style={{
                        background: `${b.c}14`,
                        border: `1px solid ${b.c}30`,
                        color: b.c,
                      }}
                    >
                      <span className="h-1 w-1 rounded-full" style={{ background: b.c }} />
                      {b.label}
                    </span>
                  ))}
                </div>

                {/* Starters */}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {STARTERS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      disabled={isLoading}
                      className="rounded-xl border border-glass-border bg-glass-bg px-3.5 py-1.5 text-xs font-medium text-foreground-muted transition-all hover:border-accent/20 hover:bg-accent/5 hover:text-foreground disabled:opacity-40"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                role={msg.role}
                content={msg.content}
                model={msg.model}
                modelProvider={msg.modelProvider}
                tokens={msg.tokens}
                latencyMs={msg.latencyMs}
              />
            ))}

            {/* Thinking indicator */}
            {isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-light">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </div>
                <div className="py-3 px-1">
                  <div className="flex items-center gap-1">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-glass-border bg-surface/85 px-4 pt-3 pb-2 backdrop-blur-xl shrink-0">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-end gap-3">
              {/* Voice bubble */}
              <div className="shrink-0 pb-1">
                <VoiceBubble
                  size={50}
                  isResponding={isLoading || isTTSPlaying}
                  responseIntensity={isLoading || isTTSPlaying ? 0.85 : 0.35}
                  onTranscript={handleSend}
                  className="select-none"
                />
              </div>

              {/* Text input */}
              <div className="flex-1 min-w-0">
                <ChatInput
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onSubmit={() => handleSend()}
                  loading={isLoading}
                  onStop={() => setIsLoading(false)}
                >
                  <ChatInputTextArea
                    placeholder={hasMessages ? "Reply…" : "Ask about your infrastructure…"}
                    disabled={isLoading}
                  />
                  <ChatInputSubmit />
                </ChatInput>
              </div>
            </div>

            {/* Input footer: model name left, waveform indicator right */}
            <div className="mt-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] text-foreground-muted opacity-50 font-mono truncate max-w-[200px]">
                {modelLabel}
              </span>
              {/* Waveform bars — animate when TTS playing */}
              <span className="flex items-end gap-px h-3 opacity-40">
                {[55, 100, 70, 85, 45].map((h, i) => (
                  <span
                    key={i}
                    className={`w-0.5 rounded-full bg-foreground-muted ${isTTSPlaying ? "animate-pulse" : ""}`}
                    style={{
                      height: `${h}%`,
                      animationDelay: isTTSPlaying ? `${i * 0.1}s` : undefined,
                    }}
                  />
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
