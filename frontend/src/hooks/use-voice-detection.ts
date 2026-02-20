"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseVoiceDetectionOptions {
  sensitivity?: number;
  smoothing?: number;
}

export function useVoiceDetection({
  sensitivity = 0.08,
  smoothing = 0.85,
}: UseVoiceDetectionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef(0);
  const isInitializingRef = useRef(false);

  const startListening = useCallback(async () => {
    if (isInitializingRef.current || isListening) return;
    isInitializingRef.current = true;

    try {
      setError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access not supported");
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        await audioContextRef.current.close();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastUpdateTime = 0;

      const updateAudioLevel = (currentTime: number) => {
        if (!analyserRef.current) return;

        if (currentTime - lastUpdateTime < 16) {
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
          return;
        }

        lastUpdateTime = currentTime;

        try {
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const normalizedLevel = Math.min(rms / 120, 1);

          const adjustedLevel =
            normalizedLevel > sensitivity ? Math.pow(normalizedLevel, 0.8) : 0;

          smoothedLevelRef.current =
            smoothedLevelRef.current * smoothing + adjustedLevel * (1 - smoothing);

          const boostedLevel = Math.min(smoothedLevelRef.current * 1.1, 1);
          setAudioLevel(boostedLevel);
        } catch (err) {
          console.warn("Audio processing error:", err);
        }

        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };

      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      setIsListening(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to access microphone";
      setError(errorMessage);
      setIsSupported(false);
      setIsListening(false);
    } finally {
      isInitializingRef.current = false;
    }
  }, [sensitivity, smoothing]);

  const stopListening = useCallback(() => {
    setIsListening(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(console.warn);
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setAudioLevel(0);
    smoothedLevelRef.current = 0;
    isInitializingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    audioLevel,
    isSupported,
    error,
    startListening,
    stopListening,
  };
}
