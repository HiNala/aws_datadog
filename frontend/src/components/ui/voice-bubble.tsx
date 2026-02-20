"use client";

import type React from "react";
import { Iridescence } from "./iridescence";
import { useVoiceDetection } from "@/hooks/use-voice-detection";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface VoiceBubbleProps {
  className?: string;
  size?: number;
  isResponding?: boolean;
  responseIntensity?: number;
  onVoiceLevel?: (level: number) => void;
  /** Called with the final transcribed text when speech ends */
  onTranscript?: (text: string) => void;
}

export const VoiceBubble: React.FC<VoiceBubbleProps> = ({
  className,
  size = 72,
  isResponding = false,
  responseIntensity = 0.7,
  onVoiceLevel,
  onTranscript,
}) => {
  const { audioLevel, isListening: micActive, startListening, stopListening } =
    useVoiceDetection({ sensitivity: 0.06, smoothing: 0.88 });

  const {
    isRecording,
    interimTranscript,
    isSupported,
    startRecording,
    stopRecording,
  } = useSpeechRecognition({ onFinal: onTranscript });

  const [conversationState, setConversationState] = useState<
    "idle" | "recording" | "listening" | "responding"
  >("idle");

  // Start mic-level detection when recording starts (for animation)
  useEffect(() => {
    if (isRecording) {
      startListening();
    } else {
      stopListening();
    }
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onVoiceLevel?.(audioLevel);
  }, [audioLevel, onVoiceLevel]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (isResponding) {
        setConversationState("responding");
      } else if (isRecording && audioLevel > 0.1) {
        setConversationState("listening");
      } else if (isRecording) {
        setConversationState("recording");
      } else {
        setConversationState("idle");
      }
    }, 50);
    return () => clearTimeout(t);
  }, [audioLevel, isResponding, isRecording]);

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
    case "recording":
      dynamicSpeed = 0.8;
      dynamicAmplitude = 0.1;
      bubbleScale = 1.05;
      behaviorMode = 1.0;
      haloIntensity = 0.35;
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
    if (!isSupported) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const haloSize = size * 1.5;

  const stateLabel = conversationState === "listening"
    ? "listening"
    : conversationState === "recording"
    ? "ready"
    : conversationState === "responding"
    ? "speaking"
    : "tap to speak";

  const stateColor = conversationState === "listening"
    ? "rgba(129,140,248,0.9)"
    : conversationState === "recording"
    ? "rgba(248,113,113,0.9)"
    : conversationState === "responding"
    ? "rgba(200,130,255,0.9)"
    : "rgba(113,113,122,0.7)";

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
    >
      {/* Interim transcript pill — floats above the bubble */}
      {interimTranscript && (
        <div
          className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-20
                     whitespace-nowrap max-w-[260px] truncate
                     rounded-full px-3 py-1 text-xs text-white/90
                     bg-black/60 backdrop-blur-md border border-white/10
                     shadow-lg pointer-events-none"
        >
          {interimTranscript}
        </div>
      )}

      <button
        onClick={handleToggle}
        disabled={!isSupported}
        title={
          !isSupported
            ? "Speech recognition not supported (use Chrome/Edge)"
            : isRecording
            ? "Recording — click to stop"
            : "Click to speak"
        }
        className="relative flex items-center justify-center focus:outline-none group cursor-pointer disabled:cursor-not-allowed"
        style={{ width: haloSize, height: haloSize }}
      >
        {/* Outer halo glow */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none transition-all duration-500 ease-out"
          style={{
            background: `radial-gradient(circle,
              rgba(100, 150, 255, ${haloIntensity * 0.35}) 0%,
              rgba(150, 100, 255, ${haloIntensity * 0.25}) 35%,
              rgba(255, 100, 200, ${haloIntensity * 0.15}) 65%,
              transparent 85%)`,
            filter: `blur(${6 + haloIntensity * 10}px)`,
            transform: `scale(${1 + haloIntensity * 0.25})`,
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

        {/* Recording pulse ring — red while recording */}
        {isRecording && (
          <div
            className="absolute rounded-full border-2 border-red-400/50 animate-ping pointer-events-none"
            style={{ width: size + 10, height: size + 10 }}
          />
        )}

        {/* Responding pulse ring — indigo */}
        {conversationState === "responding" && (
          <div
            className="absolute rounded-full border-2 border-indigo-400/40 animate-ping pointer-events-none"
            style={{ width: size + 10, height: size + 10 }}
          />
        )}

        {/* State label */}
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          style={{ bottom: -18, left: "50%", transform: "translateX(-50%)" }}
        >
          <span
            className="whitespace-nowrap text-[9px] font-medium tracking-wide uppercase transition-colors duration-300"
            style={{ color: stateColor }}
          >
            {stateLabel}
          </span>
        </div>
      </button>
    </div>
  );
};
