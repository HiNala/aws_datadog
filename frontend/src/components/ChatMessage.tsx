"use client";

import { useState, useCallback } from "react";
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
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  }, [content]);

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
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed bg-accent/20 text-foreground border border-accent/15">
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>
        ) : (
          /* Assistant: clean text, no bubble background */
          <div className="px-1 py-1 text-sm leading-relaxed text-foreground">
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>
        )}

        {/* Action row — only for assistant */}
        {!isUser && (
          <div className="flex items-center gap-1 px-1">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              title="Copy to clipboard"
              className="flex h-6 w-6 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-white/6 hover:text-foreground"
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </button>

            {/* TTS play button (icon-only) */}
            <VoiceButton text={content} />

            {/* Divider */}
            <div className="h-3 w-px bg-white/10 mx-0.5" />

            {/* Metadata */}
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
