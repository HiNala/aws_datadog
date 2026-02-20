"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { checkHealth, type HealthResponse } from "@/lib/api";

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
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <GlassCard className="p-5" hover>
      <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-foreground-muted">{sub}</p>
      )}
    </GlassCard>
  );
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const data = await checkHealth();
      setHealth(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const services = health?.services;
  const keySource =
    health?.aws_key_source === "primary_bearer"
      ? "Primary (Hackathon Bearer)"
      : health?.aws_key_source === "backup_absk"
        ? "Backup (ABSK Key)"
        : "Not configured";

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Observability Dashboard
        </h1>
        <p className="mt-2 text-foreground-muted">
          Real-time service health and LLM metrics for OpsVoice
        </p>
      </div>

      {error && (
        <GlassCard className="mb-6 border-error/30 bg-error/5 p-4">
          <p className="text-sm text-error">
            Backend unreachable: {error}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Make sure the backend is running on port 8000
          </p>
        </GlassCard>
      )}

      <section className="mb-8 animate-slide-up">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground-muted">
          Service Health
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: "PostgreSQL", status: services?.database },
            { name: "AWS Bedrock", status: services?.bedrock },
            { name: "MiniMax TTS", status: services?.minimax },
            {
              name: "Datadog",
              status: health ? "ok" : "unknown",
            },
          ].map((svc) => (
            <GlassCard key={svc.name} className="p-5" hover>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {svc.name}
                </span>
                <StatusDot status={loading ? "unknown" : svc.status || "unknown"} />
              </div>
              <p className="mt-2 text-xs capitalize text-foreground-muted">
                {loading ? "Checking..." : svc.status || "Unknown"}
              </p>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="mb-8" style={{ animationDelay: "0.1s" }}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground-muted">
          Metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Uptime"
            value={
              health
                ? `${Math.floor(health.uptime_seconds / 60)}m`
                : "—"
            }
            sub="Backend process uptime"
          />
          <MetricCard
            label="Messages"
            value={health?.recent_messages ?? "—"}
            sub="Total chat messages stored"
          />
          <MetricCard
            label="AWS Key"
            value={health ? keySource : "—"}
            sub={
              health?.aws_key_source === "primary_bearer"
                ? "Temp hackathon token (~12h)"
                : "Persistent API key"
            }
          />
          <MetricCard
            label="System Status"
            value={health?.status === "ok" ? "Healthy" : health?.status ?? "—"}
            sub={
              health?.status === "ok"
                ? "All core services operational"
                : "One or more services degraded"
            }
          />
        </div>
      </section>

      <section style={{ animationDelay: "0.2s" }}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground-muted">
          Datadog LLM Observability
        </h2>
        <GlassCard className="p-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
              <svg
                width="24"
                height="24"
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
            <h3 className="text-lg font-semibold text-foreground">
              Live Dashboard
            </h3>
            <p className="mt-2 max-w-md text-sm text-foreground-muted">
              Once Datadog API keys are configured, LLM traces will appear in
              your Datadog LLM Observability dashboard. Run the backend with{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-accent-light">
                ddtrace-run
              </code>{" "}
              to enable auto-instrumentation.
            </p>
            <a
              href="https://app.datadoghq.com/llm/traces"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent-light transition-colors hover:bg-accent/25"
            >
              Open Datadog LLM Obs
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l10-10"/><path d="M7 7h10v10"/></svg>
            </a>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
