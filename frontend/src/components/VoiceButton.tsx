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
    if (state === "loading") return;

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
      disabled={state === "loading"}
      title={
        state === "playing"
          ? "Stop audio"
          : state === "loading"
          ? "Loading audio…"
          : "Play response aloud"
      }
      className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-150 ${
        state === "playing"
          ? "text-accent-light hover:bg-accent/15"
          : "text-foreground-muted hover:bg-white/6 hover:text-foreground"
      } disabled:cursor-wait disabled:opacity-50`}
    >
      {state === "loading" ? (
        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : state === "playing" ? (
        /* Animated waveform icon while playing */
        <span className="flex items-end gap-px h-3">
          {[60, 100, 75].map((h, i) => (
            <span
              key={i}
              className="w-0.5 rounded-full bg-accent-light animate-pulse"
              style={{ height: `${h}%`, animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      ) : (
        /* Speaker icon */
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
    </button>
  );
}
