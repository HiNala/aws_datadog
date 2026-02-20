"use client";

import { useState, useCallback } from "react";
import { VoiceButton } from "./VoiceButton";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  model?: string;
  modelProvider?: string;
  tokens?: { input: number; output: number };
  latencyMs?: number;
}

function ProviderPill({ provider, model }: { provider: string; model?: string }) {
  const isAWS     = provider === "AWS Bedrock";
  const isMiniMax = provider === "MiniMax";

  const color = isAWS
    ? { bg: "color-mix(in srgb, #f90 10%, transparent)", text: "#b45309" }
    : isMiniMax
      ? { bg: "color-mix(in srgb, var(--accent) 10%, transparent)", text: "var(--accent)" }
      : null;

  if (!color) return null;

  const label = isAWS ? "AWS Bedrock" : `MiniMax M2.5`;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
      style={{ background: color.bg, color: color.text }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: color.text }} />
      {label}
    </span>
  );
}

export function ChatMessage({
  role, content, model, modelProvider, tokens, latencyMs,
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

  if (isUser) {
    return (
      <div className="flex justify-end gap-2.5 animate-slide-up">
        <div
          className="max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={{ background: "var(--user-bubble)", color: "var(--foreground)" }}
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
        style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </div>

      {/* Message body — no bubble, Claude-style */}
      <div className="max-w-[76%] min-w-0">
        <p
          className="text-sm leading-[1.7] whitespace-pre-wrap"
          style={{ color: "var(--foreground)" }}
        >
          {content}
        </p>

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <VoiceButton text={content} />
          {/* Copy button */}
          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className="flex h-5 w-5 items-center justify-center rounded transition-colors"
            style={{ color: copied ? "var(--success)" : "var(--foreground-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = copied ? "var(--success)" : "var(--foreground-muted)"; }}
          >
            {copied ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
            )}
          </button>

          {modelProvider && <ProviderPill provider={modelProvider} model={model} />}
          {latencyMs != null && (
            <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
              {Math.round(latencyMs)}ms
            </span>
          )}
          {tokens && (
            <span className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
              {(tokens.input + tokens.output).toLocaleString()} tok
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
