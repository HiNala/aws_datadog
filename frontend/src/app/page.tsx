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
    <div className="flex items-start gap-3 py-3 last:border-0" style={{ borderBottom: "1px solid var(--border)" }}>
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
    <div style={{ background: "var(--surface)", minHeight: "calc(100vh - 3.5rem)" }}>
      {/* ── Linear Hero ── */}
      <div
        className="relative overflow-hidden"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Subtle radial glow in hero */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% -10%, color-mix(in srgb, var(--accent) 7%, transparent), transparent)",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 py-10">
          <div className="flex items-center justify-between">
            <div className="animate-fade-in">
              {/* Eyebrow */}
              <p
                className="mb-2 text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--accent)" }}
              >
                OpsVoice &mdash; AI Operations Agent
              </p>
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{ color: "var(--foreground)", letterSpacing: "-0.03em" }}
              >
                Observability Dashboard
              </h1>
              <p className="mt-1.5 text-sm" style={{ color: "var(--foreground-muted)" }}>
                Real-time service health and LLM metrics &mdash; auto-refreshes every 15s
              </p>
            </div>

            {/* System status pill */}
            <div
              className="flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all"
              style={{
                background: health?.status === "ok"
                  ? "color-mix(in srgb, var(--success) 10%, transparent)"
                  : loading
                    ? "var(--surface-hover)"
                    : "color-mix(in srgb, var(--error) 10%, transparent)",
                color: health?.status === "ok"
                  ? "var(--success)"
                  : loading
                    ? "var(--foreground-muted)"
                    : "var(--error)",
                border: `1px solid ${health?.status === "ok"
                  ? "color-mix(in srgb, var(--success) 25%, transparent)"
                  : loading
                    ? "var(--border)"
                    : "color-mix(in srgb, var(--error) 25%, transparent)"}`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: health?.status === "ok"
                    ? "var(--success)"
                    : loading
                      ? "var(--foreground-muted)"
                      : "var(--error)",
                  animation: health?.status === "ok" ? "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" : "none",
                }}
              />
              {loading ? "Connecting…" : health?.status === "ok" ? "All systems operational" : "Degraded"}
            </div>
          </div>

          {/* Quick-action strip */}
          <div className="mt-6 flex gap-3">
            <a
              href="/voice"
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150"
              style={{
                background: "var(--accent)",
                color: "#fff",
                boxShadow: "0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
              Launch Voice Agent
            </a>
            <a
              href="/chat"
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150"
              style={{
                background: "var(--surface-raised)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Open Chat
            </a>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="mx-auto max-w-5xl px-6 py-8">

      {/* Backend error banner */}
      {error && (
        <GlassCard className="mb-6 border-error/30 bg-error/5 p-4">
          <p className="text-sm font-medium text-error">
            Backend unreachable: {error}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Ensure <code className="rounded px-1 py-0.5 font-mono" style={{ background: "var(--surface-overlay)" }}>docker-compose up</code> is running
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

          {/* ── Datadog Observability Panel ── */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
                Datadog Observability
              </h2>
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                  color: "var(--accent)",
                  border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                  <circle cx="4" cy="4" r="4" />
                </svg>
                ddtrace-run active
              </span>
            </div>

            {/* Deep-link cards — 2 col grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "LLM Traces",
                  desc: "Every Claude invocation with token counts and latency",
                  href: "https://app.datadoghq.com/llm/traces",
                  icon: (
                    <path d="M3 3v18h18M19 9l-5 5-4-4-3 3" strokeLinecap="round" strokeLinejoin="round" />
                  ),
                },
                {
                  label: "APM Service Map",
                  desc: "End-to-end distributed traces for opsvoice-backend",
                  href: "https://app.datadoghq.com/apm/services",
                  icon: (
                    <>
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="5" cy="19" r="2" />
                      <circle cx="19" cy="19" r="2" />
                      <path d="m12 7-7 10M12 7l7 10" />
                    </>
                  ),
                },
                {
                  label: "LLM Evaluations",
                  desc: "AI-powered quality scoring (hallucination, relevancy)",
                  href: "https://app.datadoghq.com/llm/evaluations",
                  icon: (
                    <>
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </>
                  ),
                },
                {
                  label: "Error Tracking",
                  desc: "Aggregated backend errors and stack traces",
                  href: "https://app.datadoghq.com/error-tracking",
                  icon: (
                    <>
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </>
                  ),
                },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-xl p-4 transition-all duration-150"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)";
                    (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--accent) 30%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  }}
                >
                  <div className="mb-2.5 flex items-center justify-between">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                        {item.icon}
                      </svg>
                    </div>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--foreground-muted)" }}>
                      <path d="M7 17l10-10M7 7h10v10" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--foreground-muted)" }}>
                    {item.desc}
                  </p>
                </a>
              ))}
            </div>

            {/* Setup banner — shown if DD not yet wired */}
            <div
              className="mt-3 flex items-start gap-3 rounded-xl p-4"
              style={{
                background: "color-mix(in srgb, var(--warning) 6%, var(--surface-raised))",
                border: "1px solid color-mix(in srgb, var(--warning) 20%, transparent)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: "var(--warning)" }}>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                  DD_API_KEY not configured — add your key to enable live traces
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--foreground-muted)" }}>
                  1. Get keys at{" "}
                  <a href="https://app.datadoghq.com/organization-settings/api-keys" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent)" }}>
                    datadoghq.com/org-settings
                  </a>
                  {" "}→ 2. Add to{" "}
                  <code className="rounded px-1" style={{ background: "var(--surface-overlay)", fontFamily: "monospace" }}>.env</code>
                  {" "}→ 3. Run{" "}
                  <code className="rounded px-1" style={{ background: "var(--surface-overlay)", fontFamily: "monospace" }}>
                    docker compose up --build -d
                  </code>
                  {" "}→ 4.{" "}
                  <code className="rounded px-1" style={{ background: "var(--surface-overlay)", fontFamily: "monospace" }}>
                    python scripts/create_dd_dashboard.py
                  </code>
                </p>
              </div>
            </div>
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
                    <div className="h-7 w-7 rounded-lg" style={{ background: "var(--surface-hover)" }} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 rounded" style={{ background: "var(--surface-hover)" }} />
                      <div className="h-2.5 w-1/2 rounded" style={{ background: "var(--surface-hover)" }} />
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
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors"
                  style={{ background: "var(--surface-hover)", color: "var(--foreground-muted)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)"; }}
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
