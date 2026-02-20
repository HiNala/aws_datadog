"use client";

import { VoiceButton } from "./VoiceButton";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  model?: string;
  tokens?: { input: number; output: number };
  latencyMs?: number;
}

export function ChatMessage({
  role,
  content,
  model,
  tokens,
  latencyMs,
}: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex gap-3 animate-slide-up ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15">
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
      )}

      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-accent/15 text-foreground"
              : "border border-glass-border bg-glass-bg text-foreground backdrop-blur-xl"
          }`}
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </div>

        {!isUser && (
          <div className="mt-2 flex items-center gap-3">
            <VoiceButton text={content} />
            {model && (
              <span className="text-[10px] text-foreground-muted">
                {model}
              </span>
            )}
            {latencyMs != null && (
              <span className="text-[10px] text-foreground-muted">
                {Math.round(latencyMs)}ms
              </span>
            )}
            {tokens && (
              <span className="text-[10px] text-foreground-muted">
                {tokens.input + tokens.output} tokens
              </span>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/8">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-foreground-muted"
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      )}
    </div>
  );
}
