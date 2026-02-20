"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const hasText = value.trim().length > 0;

  return (
    <div
      className="relative flex items-end gap-3 rounded-2xl p-3.5 transition-all duration-200"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.border = "1px solid var(--border-focus)";
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)";
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          (e.currentTarget as HTMLElement).style.border = "1px solid var(--border)";
          (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
        }
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Ask about your infrastructure..."
        disabled={disabled}
        rows={1}
        className="max-h-[200px] flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-50"
        style={{ color: "var(--foreground)" }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !hasText}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-150"
        style={{
          background: hasText && !disabled ? "var(--accent)" : "var(--surface-hover)",
          color: hasText && !disabled ? "#ffffff" : "var(--foreground-muted)",
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
