"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import { sendChatMessage, type ChatResponse } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  tokens?: { input: number; output: number };
  latencyMs?: number;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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
    [conversationId]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
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
              <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground-muted">
                Ask about your infrastructure, services, and incidents.
                Responses are powered by Claude on AWS Bedrock with full
                Datadog observability tracing.
              </p>
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
  );
}
