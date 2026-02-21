"use client";

import { useState, useCallback, useRef } from "react";
import { getTextToSpeechStream } from "@/lib/api";
import { MarkdownContent } from "./MarkdownContent";

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

// ── Streaming VoiceButton ─────────────────────────────────────────────────────

function VoiceButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleClick = useCallback(async () => {
    // Stop playback
    if (state === "playing" || state === "loading") {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      setState("idle");
      return;
    }

    setState("loading");
    try {
      const stream = await getTextToSpeechStream(text);
      const chunks: Uint8Array[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      if (chunks.length === 0) { setState("idle"); return; }
      const blob = new Blob(chunks, { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setState("idle"); };
      audio.onerror = () => { URL.revokeObjectURL(url); setState("idle"); };
      setState("playing");
      await audio.play();
    } catch {
      setState("idle");
    }
  }, [text, state]);

  return (
    <button
      onClick={handleClick}
      aria-label={state === "playing" ? "Stop audio" : state === "loading" ? "Loading audio" : "Play response aloud"}
      title={state === "playing" ? "Stop audio" : state === "loading" ? "Loading audio…" : "Play response aloud"}
      className="flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-150"
      style={{ color: state === "playing" ? "var(--accent-light)" : "var(--foreground-muted)" }}
      onMouseEnter={(e) => { if (state === "idle") (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; }}
      onMouseLeave={(e) => { if (state === "idle") (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)"; }}
    >
      {state === "loading" ? (
        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : state === "playing" ? (
        <span className="flex items-end gap-px h-3">
          {[60, 100, 75].map((h, i) => (
            <span key={i} className="w-0.5 rounded-full animate-pulse" style={{ height: `${h}%`, background: "var(--accent)", animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
    </button>
  );
}

// ── ChatMessage ───────────────────────────────────────────────────────────────

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
    } catch { /* clipboard not available */ }
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
      {/* OpusVoice avatar */}
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
        aria-hidden="true"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </div>

      {/* Message body */}
      <div className="max-w-[76%] min-w-0">
        <MarkdownContent content={content} />

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <VoiceButton text={content} />
          {/* Copy button */}
          <button
            onClick={handleCopy}
            aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
            title={copied ? "Copied!" : "Copy to clipboard"}
            className="flex h-5 w-5 items-center justify-center rounded transition-colors"
            style={{ color: copied ? "var(--success)" : "var(--foreground-muted)" }}
            onMouseEnter={(e) => { if (!copied) (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; }}
            onMouseLeave={(e) => { if (!copied) (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)"; }}
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
