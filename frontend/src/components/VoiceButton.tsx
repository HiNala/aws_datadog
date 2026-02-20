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

      audio.onended = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };

      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }, [text, state]);

  const isIdle = state === "idle";
  const isLoading = state === "loading";
  const isPlaying = state === "playing";

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      title={isPlaying ? "Stop" : "Play response aloud"}
      className={`flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ${
        isPlaying
          ? "bg-accent/20 text-accent-light border border-accent/25"
          : "bg-white/5 text-foreground-muted hover:bg-white/8 hover:text-foreground border border-transparent"
      } disabled:cursor-wait disabled:opacity-50`}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Loading</span>
        </>
      ) : isPlaying ? (
        <>
          {/* Animated waveform bars */}
          <span className="flex items-end gap-px h-3">
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-0.5 rounded-full bg-accent-light animate-pulse"
                style={{
                  height: `${[60, 100, 75][i - 1]}%`,
                  animationDelay: `${(i - 1) * 0.15}s`,
                }}
              />
            ))}
          </span>
          <span>Stop</span>
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          <span>Speak</span>
        </>
      )}
    </button>
  );
}
