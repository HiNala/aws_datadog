"use client";

import { useState, useCallback, useRef } from "react";
import { getTextToSpeech } from "@/lib/api";

interface VoiceButtonProps {
  text: string;
}

export function VoiceButton({ text }: VoiceButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleClick = useCallback(async () => {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }

    setState("loading");
    try {
      const audioBuffer = await getTextToSpeech(text);
      const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => { setState("idle"); URL.revokeObjectURL(url); };
      audio.onerror = () => { setState("idle"); URL.revokeObjectURL(url); };

      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }, [text, state]);

  const isPlaying = state === "playing";
  const isLoading = state === "loading";

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      title={isPlaying ? "Stop" : "Speak response"}
      className="flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150"
      style={{
        color: isPlaying ? "var(--accent)" : "var(--foreground-muted)",
        background: isPlaying
          ? "color-mix(in srgb, var(--accent) 10%, transparent)"
          : "var(--surface-hover)",
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      {isLoading ? (
        <svg width="11" height="11" viewBox="0 0 24 24" className="animate-spin">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
        </svg>
      ) : isPlaying ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
      {isLoading ? "Loading…" : isPlaying ? "Stop" : "Speak"}
    </button>
  );
}
