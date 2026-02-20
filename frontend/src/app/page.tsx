"use client";

import { useEffect, useState } from "react";
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
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok"
      ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]"
      : status === "error"
        ? "bg-error shadow-[0_0_8px_rgba(239,68,68,0.5)]"
        : "bg-warning shadow-[0_0_8px_rgba(234,179,8,0.5)]";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function MetricCard({
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
      <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight ${accent ? "text-accent-light" : "text-foreground"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-foreground-muted">{sub}</p>}
    </GlassCard>
  );
}

function ActivityRow({ conv }: { conv: ConversationSummary }) {
  const ago = (() => {
    const ms = Date.now() - new Date(conv.created_at).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })();

  return (
    <div className="flex items-start gap-3 border-b border-glass-border py-3 last:border-0">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent-light"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {conv.title}
        </p>
        {conv.last_message && (
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            {conv.last_message}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className="text-[10px] text-foreground-muted">{ago}</span>
        <p className="text-[10px] text-foreground-muted">
          {conv.message_count} msg
        </p>
      </div>
    </div>
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
  }, []);

  const services = health?.services;
  const keyLabel =
    health?.aws_key_source === "primary_bearer"
      ? "Primary Bearer"
      : health?.aws_key_source === "backup_absk"
        ? "Backup ABSK"
        : "Not configured";

  const uptimeLabel = (() => {
    if (!health) return "—";
    const s = health.uptime_seconds;
    if (s < 60) return `${Math.floor(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  })();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Observability Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-foreground-muted">
            Real-time service health and LLM metrics — auto-refreshes every 15s
          </p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium ${
            health?.status === "ok"
              ? "border-success/25 bg-success/5 text-success"
              : loading
                ? "border-glass-border bg-glass-bg text-foreground-muted"
                : "border-error/25 bg-error/5 text-error"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              health?.status === "ok"
                ? "bg-success animate-pulse"
                : loading
                  ? "bg-foreground-muted"
                  : "bg-error"
            }`}
          />
          {loading ? "Connecting…" : health?.status === "ok" ? "All systems operational" : "Degraded"}
        </div>
      </div>

      {/* Backend error banner */}
      {error && (
        <GlassCard className="mb-6 border-error/30 bg-error/5 p-4">
          <p className="text-sm font-medium text-error">
            Backend unreachable: {error}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Ensure <code className="rounded bg-white/5 px-1 py-0.5 font-mono">docker-compose up</code> is running
          </p>
        </GlassCard>
      )}

      {/* Service health row */}
      <section className="mb-6 animate-slide-up">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Service Health
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { name: "PostgreSQL", status: services?.database },
            { name: "AWS Bedrock", status: services?.bedrock },
            { name: "MiniMax TTS", status: services?.minimax },
            { name: "Datadog Obs", status: health ? "ok" : "unknown" },
          ].map((svc) => (
            <GlassCard key={svc.name} className="p-4" hover>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {svc.name}
                </span>
                <StatusDot
                  status={loading ? "unknown" : svc.status || "unknown"}
                />
              </div>
              <p className="mt-1.5 text-[11px] capitalize text-foreground-muted">
                {loading ? "Checking…" : svc.status || "Unknown"}
              </p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Two-column layout: metrics left, activity right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Metrics — takes 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* LLM token metrics */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              LLM Token Usage
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                label="Total Messages"
                value={metrics?.total_messages ?? "—"}
                sub="All roles combined"
              />
              <MetricCard
                label="Input Tokens"
                value={
                  metrics
                    ? metrics.total_input_tokens.toLocaleString()
                    : "—"
                }
                sub="Prompt tokens consumed"
                accent
              />
              <MetricCard
                label="Output Tokens"
                value={
                  metrics
                    ? metrics.total_output_tokens.toLocaleString()
                    : "—"
                }
                sub="Completion tokens generated"
                accent
              />
              <MetricCard
                label="Conversations"
                value={metrics?.total_conversations ?? "—"}
                sub="Unique sessions"
              />
            </div>
          </section>

          {/* Latency metrics */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              Latency
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                label="Avg Latency"
                value={
                  metrics?.avg_latency_ms != null
                    ? `${Math.round(metrics.avg_latency_ms)}ms`
                    : "—"
                }
                sub="Mean response time"
              />
              <MetricCard
                label="P95 Latency"
                value={
                  metrics?.p95_latency_ms != null
                    ? `${Math.round(metrics.p95_latency_ms)}ms`
                    : "—"
                }
                sub="95th percentile"
              />
              <MetricCard
                label="Uptime"
                value={uptimeLabel}
                sub="Backend process uptime"
              />
              <MetricCard
                label="AWS Key"
                value={health ? keyLabel : "—"}
                sub={
                  health?.aws_key_source === "primary_bearer"
                    ? "Temp bearer (~12h)"
                    : "Persistent key"
                }
              />
            </div>
          </section>

          {/* Models used */}
          {metrics && metrics.models_used.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Models Active
              </h2>
              <GlassCard className="p-4">
                <div className="flex flex-wrap gap-2">
                  {metrics.models_used.map((m) => (
                    <span
                      key={m}
                      className="rounded-lg bg-accent/10 px-3 py-1 text-xs font-mono font-medium text-accent-light"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </GlassCard>
            </section>
          )}

          {/* Datadog LLM Obs link */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              Datadog LLM Observability
            </h2>
            <GlassCard className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent-light"
                  >
                    <path d="M3 3v18h18" />
                    <path d="m19 9-5 5-4-4-3 3" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Live traces in Datadog
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    Run backend with{" "}
                    <code className="rounded bg-white/5 px-1 font-mono text-[11px] text-accent-light">
                      ddtrace-run
                    </code>{" "}
                    to enable auto-instrumented LLM spans
                  </p>
                </div>
                <a
                  href="https://app.datadoghq.com/llm/traces"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-medium text-accent-light transition-colors hover:bg-accent/25"
                >
                  Open
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 17l10-10" />
                    <path d="M7 7h10v10" />
                  </svg>
                </a>
              </div>
            </GlassCard>
          </section>
        </div>

        {/* Activity log — right column */}
        <div className="lg:col-span-1">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            Recent Activity
          </h2>
          <GlassCard className="p-4">
            {loading ? (
              <div className="space-y-3 py-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-7 w-7 rounded-lg bg-white/5" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 rounded bg-white/5" />
                      <div className="h-2.5 w-1/2 rounded bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mb-3 text-foreground-muted opacity-40"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-xs text-foreground-muted">
                  No conversations yet.
                </p>
                <a
                  href="/chat"
                  className="mt-3 text-xs font-medium text-accent-light hover:underline"
                >
                  Start chatting →
                </a>
              </div>
            ) : (
              <div>
                {conversations.map((c) => (
                  <ActivityRow key={c.id} conv={c} />
                ))}
                <a
                  href="/chat"
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-white/4 py-2 text-xs font-medium text-foreground-muted transition-colors hover:bg-white/7 hover:text-foreground"
                >
                  Open Chat
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
