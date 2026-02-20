"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  checkHealth,
  getMetrics,
  listConversations,
  type HealthResponse,
  type MetricsResponse,
  type ConversationSummary,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: "bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]",
    error: "bg-error shadow-[0_0_6px_rgba(239,68,68,0.6)]",
    unknown: "bg-foreground-muted animate-pulse",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${map[status] ?? map.unknown}`}
    />
  );
}

function Metric({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <GlassCard className="p-5" hover>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
        {label}
      </p>
      <p
        className={`mt-2.5 text-2xl font-bold tracking-tight tabular-nums ${
          accent ? "text-accent-light" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[11px] text-foreground-muted">{sub}</p>
      )}
    </GlassCard>
  );
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ActivityRow({ conv }: { conv: ConversationSummary }) {
  return (
    <Link
      href="/chat"
      className="group flex items-start gap-3 border-b border-glass-border py-3 last:border-0 transition-colors hover:bg-white/2"
    >
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 group-hover:bg-accent/15 transition-colors">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-light">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{conv.title}</p>
        {conv.last_message && (
          <p className="mt-0.5 truncate text-[11px] text-foreground-muted leading-relaxed">
            {conv.last_message}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-foreground-muted">{timeAgo(conv.created_at)}</p>
        <p className="mt-0.5 text-[10px] text-foreground-muted opacity-60">
          {conv.message_count} msg
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = async () => {
    try {
      const [h, m, c] = await Promise.all([
        checkHealth(),
        getMetrics().catch(() => null),
        listConversations(10).catch(() => ({ conversations: [], total: 0 })),
      ]);
      setHealth(h);
      setMetrics(m);
      setConversations(c.conversations);
      setError(null);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const services = health?.services;
  const isOk = health?.status === "ok";

  const keyLabel =
    health?.aws_key_source === "primary_bearer"
      ? "Bearer token"
      : health?.aws_key_source === "backup_absk"
        ? "ABSK key"
        : "Not set";

  const uptimeLabel = (() => {
    if (!health) return "—";
    const s = health.uptime_seconds;
    if (s < 60) return `${Math.floor(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  })();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* ── Header ── */}
      <div className="mb-8 flex items-start justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Observability
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Real-time health and LLM metrics
            {lastRefresh && (
              <span className="ml-2 opacity-50">
                · refreshed {timeAgo(lastRefresh.toISOString())}
              </span>
            )}
          </p>
        </div>

        {/* System status pill */}
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            loading
              ? "border-glass-border bg-glass-bg text-foreground-muted"
              : isOk
                ? "border-success/20 bg-success/8 text-success"
                : "border-error/20 bg-error/8 text-error"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              loading ? "bg-foreground-muted animate-pulse" : isOk ? "bg-success animate-pulse" : "bg-error"
            }`}
          />
          {loading ? "Connecting…" : isOk ? "All systems operational" : "Degraded"}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <GlassCard className="mb-6 border-error/25 bg-error/5 p-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-error">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <p className="text-sm font-medium text-error">Backend unreachable</p>
              <p className="mt-0.5 text-xs text-foreground-muted">{error}</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── Service health ── */}
      <section className="mb-6 animate-slide-up">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
          Services
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { name: "PostgreSQL", status: services?.database, icon: "🗄️" },
            { name: "AWS Bedrock", status: services?.bedrock, icon: "☁️" },
            { name: "MiniMax TTS", status: services?.minimax, icon: "🎙️" },
            { name: "Datadog", status: health ? "ok" : "unknown", icon: "📊" },
          ].map((svc) => {
            const st = loading ? "unknown" : svc.status ?? "unknown";
            return (
              <GlassCard key={svc.name} className="p-3.5" hover>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{svc.icon}</span>
                  <StatusDot status={st} />
                </div>
                <p className="mt-2 text-xs font-semibold text-foreground">{svc.name}</p>
                <p className={`mt-0.5 text-[10px] capitalize font-medium ${
                  st === "ok" ? "text-success" : st === "error" ? "text-error" : "text-foreground-muted"
                }`}>
                  {loading ? "Checking…" : st}
                </p>
              </GlassCard>
            );
          })}
        </div>
      </section>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2/3 — metrics */}
        <div className="lg:col-span-2 space-y-6">
          {/* Token usage */}
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              LLM Token Usage
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Metric
                label="Messages"
                value={metrics?.total_messages ?? "—"}
                sub="All roles"
              />
              <Metric
                label="Input Tokens"
                value={metrics ? metrics.total_input_tokens.toLocaleString() : "—"}
                sub="Prompt tokens"
                accent
              />
              <Metric
                label="Output Tokens"
                value={metrics ? metrics.total_output_tokens.toLocaleString() : "—"}
                sub="Completion tokens"
                accent
              />
              <Metric
                label="Conversations"
                value={metrics?.total_conversations ?? "—"}
                sub="Unique sessions"
              />
            </div>
          </section>

          {/* Latency */}
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              Performance
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Metric
                label="Avg Latency"
                value={metrics?.avg_latency_ms != null ? `${Math.round(metrics.avg_latency_ms)}ms` : "—"}
                sub="Mean response"
              />
              <Metric
                label="P95 Latency"
                value={metrics?.p95_latency_ms != null ? `${Math.round(metrics.p95_latency_ms)}ms` : "—"}
                sub="95th percentile"
              />
              <Metric label="Uptime" value={uptimeLabel} sub="Process uptime" />
              <Metric label="AWS Auth" value={health ? keyLabel : "—"} sub={
                health?.aws_key_source === "primary_bearer" ? "Temp (~12h)" : "Persistent"
              } />
            </div>
          </section>

          {/* Models active */}
          {metrics && metrics.models_used.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
                Active Models
              </h2>
              <GlassCard className="p-4">
                <div className="flex flex-wrap gap-2">
                  {metrics.models_used.map((m) => (
                    <span
                      key={m}
                      className="rounded-lg bg-accent/10 border border-accent/15 px-3 py-1.5 text-[11px] font-mono font-medium text-accent-light"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </GlassCard>
            </section>
          )}

          {/* Datadog card */}
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              Datadog LLM Observability
            </h2>
            <GlassCard className="p-4">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "rgba(99,44,166,0.15)", border: "1px solid rgba(99,44,166,0.25)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                    <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Live LLM traces</p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    Every chat request is traced with input/output and latency spans
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <a
                    href="https://app.datadoghq.com/llm/traces"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-accent/12 px-3 py-1.5 text-xs font-medium text-accent-light transition-colors hover:bg-accent/20"
                  >
                    LLM Traces
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 17l10-10" /><path d="M7 7h10v10" /></svg>
                  </a>
                  <a
                    href="https://app.datadoghq.com/dashboard/lists"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-white/4 px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-white/7 hover:text-foreground"
                  >
                    Dashboards
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 17l10-10" /><path d="M7 7h10v10" /></svg>
                  </a>
                </div>
              </div>
            </GlassCard>
          </section>
        </div>

        {/* Right 1/3 — recent activity */}
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              Recent Sessions
            </h2>
            <Link
              href="/chat"
              className="text-[11px] font-medium text-accent-light hover:underline"
            >
              New chat →
            </Link>
          </div>

          <GlassCard className="p-4">
            {loading ? (
              <div className="space-y-3 py-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="h-7 w-7 rounded-lg bg-white/5 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2.5 w-3/4 rounded-sm bg-white/5" />
                      <div className="h-2 w-1/2 rounded-sm bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/4">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted opacity-50">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-xs font-medium text-foreground-muted">No sessions yet</p>
                <Link href="/chat" className="mt-3 text-xs font-semibold text-accent-light hover:underline">
                  Start your first conversation →
                </Link>
              </div>
            ) : (
              <>
                {conversations.map((c) => (
                  <ActivityRow key={c.id} conv={c} />
                ))}
                <Link
                  href="/chat"
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/4 py-2 text-xs font-medium text-foreground-muted transition-colors hover:bg-white/7 hover:text-foreground"
                >
                  View all in Chat
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              </>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
