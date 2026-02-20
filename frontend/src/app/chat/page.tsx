"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatInput } from "@/components/ChatInput";
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
    <aside className="flex w-64 shrink-0 flex-col border-r border-glass-border bg-surface/50 backdrop-blur-xl">
      {/* New chat button */}
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-xl border border-glass-border bg-glass-bg px-3 py-2.5 text-sm font-medium text-foreground-muted transition-all hover:border-accent/25 hover:bg-accent/5 hover:text-foreground"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          New conversation
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-foreground-muted">
            No conversations yet
          </p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition-all ${
                  activeId === c.id
                    ? "bg-accent/10 text-foreground"
                    : "text-foreground-muted hover:bg-white/4 hover:text-foreground"
                }`}
              >
                <p className="truncate text-xs font-medium">{c.title}</p>
                {c.last_message && (
                  <p className="mt-0.5 truncate text-[10px] opacity-60">
                    {c.last_message}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] opacity-40">
                  {c.message_count} messages
                </p>
              </button>
            ))}
          </div>
        )}
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Load conversation list
  const refreshConversations = useCallback(async () => {
    try {
      const data = await listConversations(30);
      setConversations(data.conversations);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Load a specific conversation's messages
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
      // silently ignore
    }
  }, []);

  const handleNew = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const data: ChatResponse = await sendChatMessage(text, conversationId);
        setConversationId(data.conversation_id);

        const assistantMsg: Message = {
          role: "assistant",
          content: data.response,
          model: data.model,
          tokens: data.tokens,
          latencyMs: data.latency_ms,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        refreshConversations();
      } catch (e: unknown) {
        const errorMsg: Message = {
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : "Something went wrong"}`,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, refreshConversations]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      {sidebarOpen && (
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          onSelect={loadConversation}
          onNew={handleNew}
        />
      )}

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center gap-3 border-b border-glass-border bg-surface/60 px-4 py-2.5 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-white/6 hover:text-foreground"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-medium text-foreground-muted">
            {conversationId ? "Conversation" : "New conversation"}
          </span>
          {conversationId && (
            <span className="font-mono text-[10px] text-foreground-muted opacity-50">
              {conversationId.slice(0, 8)}
            </span>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center animate-fade-in">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent-light"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  OpsVoice
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-foreground-muted">
                  Ask about your infrastructure, services, and incidents.
                  Responses are powered by Claude on AWS Bedrock with full
                  Datadog observability tracing.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {[
                    "Is api-gateway healthy?",
                    "What's the blast radius if postgres-main fails?",
                    "Are there any P1 incidents right now?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      disabled={isLoading}
                      className="rounded-xl border border-glass-border bg-glass-bg px-4 py-2 text-xs text-foreground-muted transition-all hover:border-accent/25 hover:bg-accent/5 hover:text-foreground disabled:opacity-40"
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
                tokens={msg.tokens}
                latencyMs={msg.latencyMs}
              />
            ))}

            {isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent-light"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </div>
                <div className="rounded-2xl border border-glass-border bg-glass-bg px-4 py-3 backdrop-blur-xl">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent/50" />
                    <span
                      className="h-2 w-2 animate-pulse rounded-full bg-accent/50"
                      style={{ animationDelay: "0.15s" }}
                    />
                    <span
                      className="h-2 w-2 animate-pulse rounded-full bg-accent/50"
                      style={{ animationDelay: "0.3s" }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="border-t border-glass-border bg-surface/80 px-4 py-4 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl">
            <ChatInput onSend={handleSend} disabled={isLoading} />
            <p className="mt-2 text-center text-[11px] text-foreground-muted">
              Claude on AWS Bedrock &middot; MiniMax TTS &middot; Datadog LLM
              Observability
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
