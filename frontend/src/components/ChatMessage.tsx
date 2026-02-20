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
      {/* Assistant avatar */}
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/20">
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

      <div className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"} max-w-[78%]`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-accent/20 text-foreground rounded-tr-sm border border-accent/15"
              : "border border-glass-border bg-glass-bg text-foreground backdrop-blur-xl rounded-tl-sm"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{content}</p>
        </div>

        {/* Metadata row — only for assistant */}
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            <VoiceButton text={content} />
            <div className="flex items-center gap-2">
              {latencyMs != null && (
                <span className="flex items-center gap-1 text-[10px] text-foreground-muted">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  {Math.round(latencyMs)}ms
                </span>
              )}
              {tokens && (
                <span className="text-[10px] text-foreground-muted">
                  {(tokens.input + tokens.output).toLocaleString()} tok
                </span>
              )}
              {model && (
                <span className="truncate max-w-[120px] text-[10px] text-foreground-muted opacity-60 font-mono">
                  {model.split(".").pop()?.split("-").slice(0, 3).join("-") ?? model}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/6 border border-white/8">
          <svg
            width="13"
            height="13"
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
