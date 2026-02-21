"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  checkHealth,
  getMetrics,
  listConversations,
  listDebateSessions,
  type HealthResponse,
  type MetricsResponse,
  type ConversationSummary,
} from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean | null }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full shrink-0"
      style={{
        background: ok === null ? "var(--foreground-muted)" : ok ? "var(--success)" : "var(--error)",
        boxShadow: ok ? "0 0 6px rgba(34,197,94,0.5)" : ok === false ? "0 0 6px rgba(239,68,68,0.5)" : "none",
      }}
    />
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "\u2014";
  return n.toLocaleString();
}

function Skeleton({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`inline-block animate-pulse rounded ${className}`}
      style={{ background: "var(--surface-overlay)", ...style }}
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const DD_SITE = "us5.datadoghq.com";

interface DebateSession {
  session_id: string;
  topic: string;
  agent_a_name: string;
  agent_b_name: string;
  num_turns: number;
  created_at: string | null;
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [debates, setDebates] = useState<DebateSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const [h, m, c, d] = await Promise.all([
        checkHealth(),
        getMetrics().catch(() => null),
        listConversations(8).catch(() => ({ conversations: [], total: 0 })),
        listDebateSessions(5).catch(() => ({ sessions: [], total: 0 })),
      ]);
      setHealth(h);
      setMetrics(m);
      setConversations(c.conversations);
      setDebates(d.sessions);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const svc = health?.services;
  const svcList = [
    { name: "Bedrock", ok: svc?.bedrock === "ok" },
    { name: "MiniMax TTS", ok: svc?.minimax === "ok" },
    { name: "Postgres", ok: svc?.database === "ok" },
    { name: "Datadog", ok: svc ? svc.datadog === "ok" : null },
  ];

  const uptime = (() => {
    if (!health) return "\u2014";
    const s = health.uptime_seconds;
    if (s < 60) return `${Math.floor(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  })();

  const authLabel = health?.aws_key_source === "primary_bearer" ? "Bearer" : health?.aws_key_source === "backup_absk" ? "ABSK" : "\u2014";

  return (
    <div style={{ background: "var(--surface)", minHeight: "calc(100vh - 3.5rem)" }}>
      {/* ── Header ── */}
      <div style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--foreground)" }}>
                OpusVoice Dashboard
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--foreground-muted)" }}>
                Live health, LLM usage, debate metrics, and Datadog observability
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* System status */}
              <div
                className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
                style={{
                  background: health?.status === "ok" ? "color-mix(in srgb, var(--success) 10%, transparent)" : loading ? "var(--surface-hover)" : "color-mix(in srgb, var(--error) 10%, transparent)",
                  color: health?.status === "ok" ? "var(--success)" : loading ? "var(--foreground-muted)" : "var(--error)",
                  border: `1px solid ${health?.status === "ok" ? "color-mix(in srgb, var(--success) 25%, transparent)" : "var(--border)"}`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{
                  background: health?.status === "ok" ? "var(--success)" : loading ? "var(--foreground-muted)" : "var(--error)",
                }} />
                {loading ? "Connecting\u2026" : health?.status === "ok" ? "All systems operational" : "Degraded"}
              </div>

              {/* Manual refresh */}
              <button
                onClick={refresh}
                aria-label="Refresh dashboard"
                title="Refresh"
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
                style={{ color: "var(--foreground-muted)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 .49-4.99" />
                </svg>
              </button>

              <Link
                href="/chat"
                className="rounded-xl px-4 py-2 text-sm font-medium transition-all"
                style={{ background: "var(--accent)", color: "#fff" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.9"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              >
                Chat &amp; Debate
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Error */}
        {error && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "color-mix(in srgb, var(--error) 8%, var(--surface-raised))", border: "1px solid color-mix(in srgb, var(--error) 25%, transparent)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--error)" }}>Backend unreachable: {error}</p>
          </div>
        )}

        {/* ── Services + Metrics + Datadog row ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Services */}
          <div className="rounded-xl p-5" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--foreground-muted)" }}>
              Services
            </h2>
            <div className="space-y-3">
              {svcList.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--foreground)" }}>{s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs capitalize" style={{
                      color: loading ? "var(--foreground-muted)" : s.ok ? "var(--success)" : "var(--error)"
                    }}>
                      {loading ? "checking" : s.ok ? "healthy" : "down"}
                    </span>
                    <StatusDot ok={loading ? null : s.ok} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>Uptime</span>
              <span className="text-xs font-mono font-medium" style={{ color: "var(--foreground)" }}>{uptime}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>AWS Auth</span>
              <span className="text-xs font-medium" style={{ color: "var(--foreground)" }}>{authLabel}</span>
            </div>
          </div>

          {/* LLM + Debate Metrics */}
          <div className="rounded-xl p-5" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--foreground-muted)" }}>
              LLM Usage
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[
                { label: "Chat Messages", value: fmt(metrics?.total_messages), color: "var(--accent)" },
                { label: "Conversations", value: fmt(metrics?.total_conversations), color: "var(--accent)" },
                { label: "Debates", value: fmt(metrics?.total_debates), color: "#d97706" },
                { label: "Debate Turns", value: fmt(metrics?.total_debate_turns), color: "#d97706" },
              ].map((m) => (
                <div key={m.label} className="rounded-lg p-2.5" style={{ background: "var(--surface)" }}>
                  <p className="text-[10px] font-medium" style={{ color: "var(--foreground-muted)" }}>{m.label}</p>
                  {loading && !metrics
                    ? <Skeleton className="mt-1 h-6 w-10" />
                    : <p className="text-lg font-bold font-mono tabular-nums mt-0.5" style={{ color: m.color }}>{m.value}</p>
                  }
                </div>
              ))}
            </div>
            <div className="space-y-2 mb-3">
              {[
                { label: "Total tokens (in/out)", value: `${fmt((metrics?.total_input_tokens ?? 0) + (metrics?.debate_input_tokens ?? 0))} / ${fmt((metrics?.total_output_tokens ?? 0) + (metrics?.debate_output_tokens ?? 0))}` },
                { label: "TTS requests", value: fmt(metrics?.tts_requests) },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>{m.label}</span>
                  <span className="text-xs font-mono font-medium" style={{ color: "var(--foreground)" }}>{m.value}</span>
                </div>
              ))}
            </div>
            <div className="pt-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>Chat avg latency</span>
                <span className="text-xs font-mono" style={{ color: "var(--foreground)" }}>
                  {metrics?.avg_latency_ms != null ? `${Math.round(metrics.avg_latency_ms)}ms` : "\u2014"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>Chat P95 latency</span>
                <span className="text-xs font-mono" style={{ color: "var(--foreground)" }}>
                  {metrics?.p95_latency_ms != null ? `${Math.round(metrics.p95_latency_ms)}ms` : "\u2014"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>Debate avg latency</span>
                <span className="text-xs font-mono" style={{ color: "#d97706" }}>
                  {metrics?.debate_avg_latency_ms != null ? `${Math.round(metrics.debate_avg_latency_ms)}ms` : "\u2014"}
                </span>
              </div>
            </div>
            {metrics && metrics.models_used.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {metrics.models_used.map((m) => (
                  <span key={m} className="rounded-md px-2 py-0.5 text-[10px] font-mono" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)" }}>
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Datadog */}
          <div className="rounded-xl p-5" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
                Datadog
              </h2>
              <span
                className="flex items-center gap-1.5 text-[10px] font-medium"
                style={{ color: loading ? "var(--foreground-muted)" : svc?.datadog === "ok" ? "var(--success)" : svc?.datadog === "warning" ? "var(--warning)" : "var(--error)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: loading ? "var(--foreground-muted)" : svc?.datadog === "ok" ? "var(--success)" : svc?.datadog === "warning" ? "var(--warning)" : "var(--error)" }} />
                {loading ? "Checking\u2026" : svc?.datadog === "ok" ? "Connected" : svc?.datadog === "warning" ? "Key not set" : "Disconnected"}
              </span>
            </div>
            <div className="space-y-2">
              {[
                { label: "LLM Observability", href: `https://${DD_SITE}/llm/traces?query=service%3Aopusvoice`, desc: "LLM spans, tokens, latency per call" },
                { label: "APM Traces", href: `https://${DD_SITE}/apm/traces?query=service%3Aopusvoice`, desc: "End-to-end request traces" },
                { label: "APM Service Map", href: `https://${DD_SITE}/apm/map?env=production`, desc: "Service dependencies" },
                { label: "Error Tracking", href: `https://${DD_SITE}/error-tracking?query=service%3Aopusvoice`, desc: "Runtime errors & exceptions" },
                { label: "Logs", href: `https://${DD_SITE}/logs?query=service%3Aopusvoice`, desc: "Application log stream" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-all"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--foreground-muted)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{link.label}</p>
                    <p className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>{link.desc}</p>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--foreground-muted)" }} aria-hidden="true">
                    <path d="M7 17l10-10M7 7h10v10" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* ── Recent activity: Debates + Sessions ── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Recent Debates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
                Recent Debates
              </h2>
              <Link href="/chat" className="text-[11px] font-medium" style={{ color: "#d97706" }}>
                New debate &rarr;
              </Link>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
              {debates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>No debates yet</p>
                  <Link href="/chat" className="mt-2 text-xs font-medium" style={{ color: "#d97706" }}>
                    Start your first debate &rarr;
                  </Link>
                </div>
              ) : (
                debates.map((d, i) => (
                  <Link
                    key={d.session_id}
                    href="/chat"
                    className="flex items-center gap-3 px-4 py-3 transition-all"
                    style={{ borderBottom: i < debates.length - 1 ? "1px solid var(--border)" : "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: "var(--foreground)" }}>{d.topic}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--foreground-muted)" }}>
                        {d.agent_a_name} vs {d.agent_b_name} &middot; {d.num_turns} turns
                      </p>
                    </div>
                    {d.created_at && (
                      <p className="shrink-0 text-[10px]" style={{ color: "var(--foreground-muted)" }}>{timeAgo(d.created_at)}</p>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Sessions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
                Recent Sessions
              </h2>
              <Link href="/chat" className="text-[11px] font-medium" style={{ color: "var(--accent)" }}>
                View all &rarr;
              </Link>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>No sessions yet</p>
                  <Link href="/chat" className="mt-2 text-xs font-medium" style={{ color: "var(--accent)" }}>
                    Start a conversation &rarr;
                  </Link>
                </div>
              ) : (
                conversations.map((c, i) => (
                  <Link
                    key={c.id}
                    href="/chat"
                    className="flex items-center gap-3 px-4 py-3 transition-all"
                    style={{ borderBottom: i < conversations.length - 1 ? "1px solid var(--border)" : "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: "var(--foreground)" }}>{c.title}</p>
                      {c.last_message && (
                        <p className="truncate text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>{c.last_message}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>{timeAgo(c.created_at)}</p>
                      <p className="text-[10px] opacity-50" style={{ color: "var(--foreground-muted)" }}>{c.message_count} msg</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
