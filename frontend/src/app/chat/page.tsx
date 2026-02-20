"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
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
  type ChatResponse,
  type ConversationSummary,
} from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  tokens?: { input: number; output: number };
  latencyMs?: number;
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

      {/* Datadog links */}
      <div className="px-2.5 pb-3 pt-2 border-t border-glass-border space-y-0.5">
        <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-foreground-muted opacity-40">
          Observability
        </p>
        {[
          {
            href: "https://app.datadoghq.com/llm/traces",
            label: "LLM Traces",
            sub: "Datadog",
            dot: "#9b4dca",
          },
          {
            href: "https://app.datadoghq.com/dashboard/lists",
            label: "Dashboards",
            sub: "Datadog",
            dot: "#9b4dca",
          },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-medium text-foreground-muted transition-all hover:bg-white/5 hover:text-foreground group"
          >
            <span
              className="h-2 w-2 rounded-full shrink-0 opacity-80"
              style={{ background: link.dot, boxShadow: `0 0 5px ${link.dot}80` }}
            />
            <span className="flex-1 truncate">{link.label}</span>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-30 group-hover:opacity-60 transition-opacity">
              <path d="M7 17l10-10" /><path d="M7 7h10v10" />
            </svg>
          </a>
        ))}
      </div>
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
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await listConversations(30);
      setConversations(data.conversations);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const data = await getConversationMessages(id);
      const msgs: Message[] = data.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        model: m.model ?? undefined,
        tokens:
          m.input_tokens != null && m.output_tokens != null
            ? { input: m.input_tokens, output: m.output_tokens }
            : undefined,
        latencyMs: m.latency_ms ?? undefined,
      }));
      setMessages(msgs);
      setConversationId(id);
    } catch {
      // non-critical
    }
  }, []);

  const handleNew = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
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
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            model: data.model,
            tokens: data.tokens,
            latencyMs: data.latency_ms,
          },
        ]);
        refreshConversations();
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
    [conversationId, refreshConversations, inputValue, isLoading]
  );

  const STARTERS = [
    "Is api-gateway healthy?",
    "What's the blast radius if postgres-main fails?",
    "Any P1 incidents right now?",
    "Summarize this week's alerts",
  ];

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
            className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-white/6 hover:text-foreground"
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
            {messages.length === 0 && (
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
                <div className="rounded-2xl rounded-tl-sm border border-glass-border bg-glass-bg px-4 py-3 backdrop-blur-xl">
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
        <div className="border-t border-glass-border bg-surface/85 px-4 py-3.5 backdrop-blur-xl shrink-0">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-end gap-3">
              {/* Floating voice bubble */}
              <div className="shrink-0 pb-1">
                <VoiceBubble
                  size={50}
                  isResponding={isLoading}
                  responseIntensity={isLoading ? 0.85 : 0.35}
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
                    placeholder="Ask about your infrastructure…"
                    disabled={isLoading}
                  />
                  <ChatInputSubmit />
                </ChatInput>
              </div>
            </div>

            <p className="mt-2 text-center text-[10px] text-foreground-muted opacity-50">
              Claude on AWS Bedrock · MiniMax TTS · Datadog LLM Observability
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
