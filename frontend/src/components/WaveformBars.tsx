"use client";

import { useEffect, useRef } from "react";

interface WaveformBarsProps {
  /** Whether animation is active */
  active?: boolean;
  /** "listen" = user speaking, "speak" = agent speaking, "idle" = dormant */
  mode?: "idle" | "listen" | "speak" | "think";
  /** Number of bars */
  bars?: number;
  /** Max bar height in px */
  maxHeight?: number;
  /** Bar width in px */
  barWidth?: number;
  /** Gap between bars in px */
  gap?: number;
  className?: string;
}

/** Heights profile (normalized 0-1) — bell curve shape */
const PROFILE = [0.25, 0.45, 0.65, 0.82, 0.95, 1.0, 0.95, 0.82, 0.65, 0.45, 0.25];

export function WaveformBars({
  active = false,
  mode = "idle",
  bars = 11,
  maxHeight = 48,
  barWidth = 3,
  gap = 3,
  className = "",
}: WaveformBarsProps) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const profile = PROFILE.slice(0, bars);

    const animate = (ts: number) => {
      timeRef.current = ts;

      profile.forEach((baseH, i) => {
        const el = barsRef.current[i];
        if (!el) return;

        let height: number;
        if (!active || mode === "idle") {
          height = 4;
        } else if (mode === "think") {
          // slow gentle pulse
          const wave = Math.sin(ts / 600 + i * 0.4);
          height = 4 + (maxHeight * baseH * 0.3) * ((wave + 1) / 2);
        } else {
          // "listen" or "speak" — lively, each bar offset by phase
          const speed = mode === "listen" ? 280 : 200;
          const wave = Math.sin(ts / speed + i * 0.55);
          const energy = mode === "listen" ? 0.85 : 0.7;
          height = 4 + maxHeight * baseH * energy * ((wave + 1) / 2);
        }

        el.style.height = `${Math.max(4, height)}px`;
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [active, mode, bars, maxHeight]);

  const accentColor =
    mode === "listen"
      ? "var(--accent)"
      : mode === "speak"
        ? "var(--success)"
        : mode === "think"
          ? "var(--warning)"
          : "var(--border)";

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ gap: `${gap}px`, height: `${maxHeight + 8}px` }}
    >
      {PROFILE.slice(0, bars).map((_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          style={{
            width: barWidth,
            height: 4,
            borderRadius: barWidth / 2,
            background: accentColor,
            transition: "background-color 0.3s ease",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}
