"use client";

import { useMemo } from "react";

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: fenced code blocks, inline code, bold, italic, headers (h1-h3),
 * unordered lists, ordered lists, and horizontal rules.
 * No external dependencies.
 */

interface MarkdownContentProps {
  content: string;
}

// ── Token types ───────────────────────────────────────────────────────────────

type Block =
  | { type: "code_block"; lang: string; code: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "hr" }
  | { type: "paragraph"; text: string };

// ── Block parser ──────────────────────────────────────────────────────────────

function parseBlocks(raw: string): Block[] {
  const lines = raw.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ──────────────────────────────────────────────────
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code_block", lang, code: codeLines.join("\n") });
      continue;
    }

    // ── Heading ────────────────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: headingMatch[2] });
      i++;
      continue;
    }

    // ── Horizontal rule ────────────────────────────────────────────────────
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // ── Unordered list ─────────────────────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // ── Ordered list ───────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // ── Blank line (skip) ──────────────────────────────────────────────────
    if (line.trim() === "") {
      i++;
      continue;
    }

    // ── Paragraph (collect consecutive non-blank lines) ────────────────────
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ── Inline renderer ───────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  // Split on inline code, bold, italic patterns
  const parts: React.ReactNode[] = [];
  // Match: `code`, **bold**, *italic*, __bold__, _italic_
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Plain text before match
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      // Inline code
      parts.push(
        <code
          key={match.index}
          className="rounded px-1 py-0.5 text-[0.82em] font-mono"
          style={{ background: "var(--surface-overlay)", color: "var(--foreground)" }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        <strong key={match.index} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") || token.startsWith("_")) {
      parts.push(
        <em key={match.index} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }

    last = match.index + token.length;
  }

  // Remaining plain text
  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length > 0 ? parts : [text];
}

// ── Copy button for code blocks ───────────────────────────────────────────────

import { useState, useCallback } from "react";

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ok */ }
  }, [code]);

  return (
    <div
      className="my-3 rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--surface-raised)" }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: "var(--surface-overlay)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[10px] font-mono font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
          {lang || "code"}
        </span>
        <button
          onClick={handleCopy}
          aria-label="Copy code to clipboard"
          className="flex items-center gap-1 text-[10px] font-medium transition-colors"
          style={{ color: copied ? "var(--success)" : "var(--foreground-muted)" }}
        >
          {copied ? (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Copied
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[13px] leading-relaxed font-mono" style={{ color: "var(--foreground)", margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  // If content has no markdown markers, render as plain text for performance
  const hasMarkdown = /[`*#_\-]|^\d+\./.test(content);
  if (!hasMarkdown) {
    return (
      <p className="text-sm leading-[1.7] whitespace-pre-wrap" style={{ color: "var(--foreground)" }}>
        {content}
      </p>
    );
  }

  return (
    <div className="text-sm leading-[1.7] min-w-0" style={{ color: "var(--foreground)" }}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "code_block":
            return <CodeBlock key={idx} lang={block.lang} code={block.code} />;

          case "heading": {
            const sizes = { 1: "text-base font-bold mt-3 mb-1", 2: "text-sm font-bold mt-2.5 mb-1", 3: "text-sm font-semibold mt-2 mb-0.5" };
            return (
              <p key={idx} className={sizes[block.level]}>
                {renderInline(block.text)}
              </p>
            );
          }

          case "ul":
            return (
              <ul key={idx} className="my-2 space-y-1 pl-4" style={{ listStyleType: "disc" }}>
                {block.items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed">
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={idx} className="my-2 space-y-1 pl-4" style={{ listStyleType: "decimal" }}>
                {block.items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed">
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            );

          case "hr":
            return <hr key={idx} className="my-3" style={{ borderColor: "var(--border)" }} />;

          case "paragraph":
            return (
              <p key={idx} className="text-sm leading-[1.7] whitespace-pre-wrap mb-2 last:mb-0">
                {renderInline(block.text)}
              </p>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
