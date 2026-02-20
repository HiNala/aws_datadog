// API_BASE is always "" on the client so requests go through Next.js rewrites (/api/*).
// The rewrites proxy to the backend using the internal BACKEND_URL env var.
const API_BASE = "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatResponse {
  response: string;
  conversation_id: string;
  model: string;
  tokens: { input: number; output: number };
  latency_ms: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  services: {
    database: string;
    bedrock: string;
    minimax: string;
  };
  uptime_seconds: number;
  aws_key_source: string;
  recent_messages: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  message_count: number;
  last_message: string | null;
  created_at: string;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
  total: number;
}

export interface ConversationMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  created_at: string | null;
}

export interface ConversationMessagesResponse {
  conversation_id: string;
  messages: ConversationMessage[];
}

export interface MetricsResponse {
  total_messages: number;
  total_conversations: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  models_used: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendChatMessage(
  message: string,
  conversationId: string | null = null
): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

export async function getTextToSpeech(
  text: string,
  voiceId?: string,
  emotion?: string
): Promise<ArrayBuffer> {
  const res = await fetch(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId, emotion }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `TTS failed: ${res.status}`);
  }

  return res.arrayBuffer();
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function checkHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health");
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function listConversations(
  limit = 20
): Promise<ConversationsResponse> {
  return apiFetch<ConversationsResponse>(
    `/api/conversations?limit=${limit}`
  );
}

export async function getConversationMessages(
  conversationId: string
): Promise<ConversationMessagesResponse> {
  return apiFetch<ConversationMessagesResponse>(
    `/api/conversations/${conversationId}/messages`
  );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function getMetrics(): Promise<MetricsResponse> {
  return apiFetch<MetricsResponse>("/api/metrics");
}

// ---------------------------------------------------------------------------
// Live key test (calls real APIs — takes ~5-10s)
// ---------------------------------------------------------------------------

export interface KeyTestResult {
  status: "ok" | "error" | "warning";
  method?: string;
  region?: string;
  model?: string;
  latency_ms?: number;
  response?: string;
  audio_bytes?: number;
  site?: string;
  app_key?: string;
  error?: string;
}

export interface KeyTestResponse {
  results: {
    bedrock: KeyTestResult;
    minimax: KeyTestResult;
    datadog: KeyTestResult;
    postgres: KeyTestResult;
  };
  summary: Record<string, string>;
  all_ok: boolean;
}

export async function testKeysLive(): Promise<KeyTestResponse> {
  return apiFetch<KeyTestResponse>("/api/health/keys");
}
