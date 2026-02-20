"use client";

import type React from "react";
import { Iridescence } from "./iridescence";
import { useVoiceDetection } from "@/hooks/use-voice-detection";
import { cn } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";

interface VoiceBubbleProps {
  className?: string;
  size?: number;
  isResponding?: boolean;
  responseIntensity?: number;
  onVoiceLevel?: (level: number) => void;
}

export const VoiceBubble: React.FC<VoiceBubbleProps> = ({
  className,
  size = 72,
  isResponding = false,
  responseIntensity = 0.7,
  onVoiceLevel,
}) => {
  const { audioLevel, isListening, isSupported, startListening, stopListening } =
    useVoiceDetection({
      sensitivity: 0.06,
      smoothing: 0.88,
    });

  const [conversationState, setConversationState] = useState<
    "idle" | "listening" | "responding"
  >("idle");
  const hasStartedRef = useRef(false);

  // Auto-start listening when component mounts (only once)
  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      const timer = setTimeout(() => {
        startListening();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of voice level for integration with input
  useEffect(() => {
    onVoiceLevel?.(audioLevel);
  }, [audioLevel, onVoiceLevel]);

  // Determine conversation state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isResponding) {
        setConversationState("responding");
      } else if (audioLevel > 0.1) {
        setConversationState("listening");
      } else {
        setConversationState("idle");
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [audioLevel, isResponding]);

  const safeAudioLevel = Math.max(0, Math.min(1, audioLevel || 0));

  let dynamicSpeed: number,
    dynamicAmplitude: number,
    bubbleScale: number,
    behaviorMode: number,
    haloIntensity: number;

  switch (conversationState) {
    case "listening":
      dynamicSpeed = 1.2 + safeAudioLevel * 5.0;
      dynamicAmplitude = 0.15 + safeAudioLevel * 0.8;
      bubbleScale = 1 + safeAudioLevel * 0.35;
      behaviorMode = 1.0;
      haloIntensity = 0.3 + safeAudioLevel * 0.7;
      break;
    case "responding":
      dynamicSpeed = 0.8 + responseIntensity * 2.5;
      dynamicAmplitude = 0.12 + responseIntensity * 0.6;
      bubbleScale = 1 + responseIntensity * 0.25;
      behaviorMode = 2.0;
      haloIntensity = 0.4 + responseIntensity * 0.6;
      break;
    default:
      dynamicSpeed = 0.4;
      dynamicAmplitude = 0.08;
      bubbleScale = 1;
      behaviorMode = 0.0;
      haloIntensity = 0.2;
  }

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const haloSize = size * 1.5;

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      title={
        !isSupported
          ? "Microphone not supported"
          : isListening
          ? "Listening — click to mute"
          : "Click to enable microphone"
      }
    >
      <button
        onClick={handleToggle}
        disabled={!isSupported}
        className="relative flex items-center justify-center focus:outline-none group"
        style={{ width: haloSize, height: haloSize }}
      >
        {/* Outer halo glow */}
        <div
          className="absolute inset-0 rounded-full transition-all duration-500 ease-out pointer-events-none"
          style={{
            background: `radial-gradient(circle,
              rgba(100, 150, 255, ${haloIntensity * 0.35}) 0%,
              rgba(150, 100, 255, ${haloIntensity * 0.25}) 35%,
              rgba(255, 100, 200, ${haloIntensity * 0.15}) 65%,
              transparent 85%)`,
            filter: `blur(${6 + haloIntensity * 10}px)`,
            transform: `scale(${1 + haloIntensity * 0.25})`,
            transition: "all 0.5s ease-out",
          }}
        />

        {/* Main bubble */}
        <div
          className="absolute rounded-full overflow-hidden transition-all duration-300 ease-out"
          style={{
            width: size,
            height: size,
            transform: `scale(${bubbleScale})`,
            boxShadow: `
              inset 0 0 ${12 + haloIntensity * 20}px rgba(255,255,255,0.25),
              inset 0 0 ${24 + haloIntensity * 30}px rgba(100,150,255,0.15),
              0 0 ${20 + haloIntensity * 40}px rgba(150,100,255,${haloIntensity * 0.5}),
              0 ${4 + haloIntensity * 8}px ${16 + haloIntensity * 20}px rgba(0,0,0,0.2)
            `,
            filter: `brightness(${1 + haloIntensity * 0.15}) saturate(${1.1 + haloIntensity * 0.25})`,
          }}
        >
          <Iridescence
            className="w-full h-full"
            color={[1.0, 1.0, 1.0]}
            speed={dynamicSpeed}
            amplitude={dynamicAmplitude}
            audioLevel={safeAudioLevel}
            behaviorMode={behaviorMode}
            responseIntensity={responseIntensity}
            haloIntensity={haloIntensity}
            mouseReact={false}
          />
        </div>

        {/* Mic icon overlay — shown when idle/not supported */}
        {!isListening && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="rounded-full flex items-center justify-center"
              style={{ width: size * 0.4, height: size * 0.4 }}
            >
              <MicOff
                className="text-white/60 group-hover:text-white/90 transition-colors"
                style={{ width: size * 0.22, height: size * 0.22 }}
              />
            </div>
          </div>
        )}

        {/* Active listening ring pulse */}
        {conversationState === "listening" && (
          <div
            className="absolute rounded-full border-2 border-indigo-400/40 animate-ping pointer-events-none"
            style={{ width: size + 8, height: size + 8 }}
          />
        )}

        {/* State label */}
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          style={{ bottom: -18, left: "50%", transform: "translateX(-50%)" }}
        >
          <span
            className="whitespace-nowrap text-[9px] font-medium tracking-wide uppercase"
            style={{
              color:
                conversationState === "listening"
                  ? "rgba(129,140,248,0.9)"
                  : conversationState === "responding"
                  ? "rgba(200,130,255,0.9)"
                  : "rgba(113,113,122,0.7)",
            }}
          >
            {conversationState === "listening"
              ? "listening"
              : conversationState === "responding"
              ? "speaking"
              : isListening
              ? "idle"
              : "muted"}
          </span>
        </div>
      </button>
    </div>
  );
};
