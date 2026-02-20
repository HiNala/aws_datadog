"use client";

import { VoiceButton } from "./VoiceButton";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  model?: string;
  tokens?: { input: number; output: number };
  latencyMs?: number;
}

export function ChatMessage({ role, content, model, tokens, latencyMs }: ChatMessageProps) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end gap-2.5 animate-slide-up">
        <div
          className="max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={{
            background: "var(--user-bubble)",
            color: "var(--foreground)",
          }}
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 animate-slide-up">
      {/* OpsVoice avatar */}
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </div>

      {/* Message body — no bubble, like Claude */}
      <div className="max-w-[76%] min-w-0">
        <p
          className="text-sm leading-[1.7] whitespace-pre-wrap"
          style={{ color: "var(--foreground)" }}
        >
          {content}
        </p>

        {/* Meta row */}
        <div className="mt-2 flex items-center gap-3">
          <VoiceButton text={content} />
          {model && (
            <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
              {model.split(".").pop() ?? model}
            </span>
          )}
          {latencyMs != null && (
            <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
              {Math.round(latencyMs)}ms
            </span>
          )}
          {tokens && (
            <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
              {(tokens.input + tokens.output).toLocaleString()} tokens
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
