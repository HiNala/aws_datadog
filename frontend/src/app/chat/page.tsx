"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import {
  sendChatMessage,
  listConversations,
  getConversationMessages,
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
    <aside
      className="flex w-60 shrink-0 flex-col"
      style={{
        background: "var(--surface-overlay)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150"
          style={{
            color: "var(--foreground-muted)",
            border: "1px solid var(--border)",
            background: "var(--surface-raised)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
            (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
            (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)";
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs" style={{ color: "var(--foreground-muted)" }}>
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
                  className="w-full rounded-lg px-3 py-2.5 text-left transition-all duration-150"
                  style={{
                    background: isActive ? "var(--surface-active)" : "transparent",
                    color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <p className="truncate text-xs font-medium">{c.title}</p>
                  {c.last_message && (
                    <p className="mt-0.5 truncate text-[10px] opacity-60">{c.last_message}</p>
                  )}
                  <p className="mt-0.5 text-[10px] opacity-40">{c.message_count} messages</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* API Key Status — discrete dropdown at sidebar footer */}
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
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await listConversations(30);
      setConversations(data.conversations);
    } catch { /* silent */ }
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
    } catch { /* silent */ }
  }, []);

  const handleNew = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const handleSend = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);
    try {
      const data: ChatResponse = await sendChatMessage(text, conversationId);
      setConversationId(data.conversation_id);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.response,
        model: data.model,
        modelProvider: data.model_provider,
        tokens: data.tokens,
        latencyMs: data.latency_ms,
      }]);
      refreshConversations();
    } catch (e: unknown) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Error: ${e instanceof Error ? e.message : "Something went wrong"}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, refreshConversations]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]" style={{ background: "var(--surface)" }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          onSelect={loadConversation}
          onNew={handleNew}
        />
      )}

      {/* Chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-raised)",
          }}
        >
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <span className="text-sm font-medium" style={{ color: "var(--foreground-muted)" }}>
            {conversationId ? "Conversation" : "New conversation"}
          </span>

          {conversationId && (
            <span className="font-mono text-[10px] opacity-40" style={{ color: "var(--foreground-muted)" }}>
              {conversationId.slice(0, 8)}
            </span>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-2xl space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-28 text-center animate-fade-in">
                <div
                  className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                  How can I help you?
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: "var(--foreground-muted)" }}>
                  Ask about your infrastructure, services, and incidents. Powered by Claude on AWS Bedrock with MiniMax M2.5 fallback.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {[
                    "Is api-gateway healthy?",
                    "What's the blast radius if postgres fails?",
                    "Any P1 incidents right now?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      disabled={isLoading}
                      className="rounded-xl px-4 py-2 text-xs transition-all duration-150 disabled:opacity-40"
                      style={{
                        color: "var(--foreground-muted)",
                        border: "1px solid var(--border)",
                        background: "var(--surface-raised)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                        (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
                        (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)";
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            {isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </div>
                <div className="flex items-center gap-1.5 py-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 rounded-full animate-pulse"
                      style={{ background: "var(--foreground-muted)", animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div
          className="px-4 py-4"
          style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <div className="mx-auto max-w-2xl">
            <ChatInput onSend={handleSend} disabled={isLoading} />
            <p className="mt-2 text-center text-[11px]" style={{ color: "var(--foreground-muted)" }}>
              Claude on AWS Bedrock &middot; MiniMax TTS &middot; Datadog LLM Observability
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
