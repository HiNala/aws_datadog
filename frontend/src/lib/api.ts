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
  model_provider: string;
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
  total_debates: number;
  total_debate_turns: number;
  debate_input_tokens: number;
  debate_output_tokens: number;
  debate_avg_latency_ms: number | null;
  tts_requests: number;
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
// Streaming TTS (speech-2.8-turbo, ~200ms first audio)
// ---------------------------------------------------------------------------

/**
 * Returns a ReadableStream of raw MP3 bytes.
 * Use with MediaSource API for instant playback.
 */
export async function getTextToSpeechStream(
  text: string,
  voiceId?: string,
  speed?: number,
  pitch?: number,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${API_BASE}/api/tts/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId, speed: speed ?? 1.05, pitch: pitch ?? 0 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `TTS stream failed: ${res.status}`);
  }

  if (!res.body) throw new Error("No response body for TTS stream");
  return res.body;
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
    minimax_tts: KeyTestResult;
    minimax_llm: KeyTestResult;
    datadog: KeyTestResult;
    postgres: KeyTestResult;
  };
  summary: Record<string, string>;
  all_ok: boolean;
}

export async function testKeysLive(): Promise<KeyTestResponse> {
  return apiFetch<KeyTestResponse>("/api/health/keys");
}

// ---------------------------------------------------------------------------
// Dual-Perspective Debate
// ---------------------------------------------------------------------------

export interface AgentProfile {
  name: string;
  perspective: string;
  voice: string;
  color: "indigo" | "amber";
}

export interface DebateSessionResponse {
  session_id: string;
  topic: string;
  agent_a: AgentProfile;
  agent_b: AgentProfile;
  num_turns: number;
}

export interface DebateTurnSSEEvent {
  type: "thinking" | "text" | "done" | "error";
  agent?: "a" | "b";
  agent_name?: string;
  turn?: number;
  text?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  is_final?: boolean;
  next_agent?: "a" | "b" | null;
  voice?: string;
  message?: string;
}

export interface DebateSessionDetail {
  session_id: string;
  topic: string;
  agent_a: AgentProfile;
  agent_b: AgentProfile;
  num_turns: number;
  completed_turns: number;
  turns: {
    turn_number: number;
    agent: "a" | "b";
    text: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
  }[];
  created_at: string | null;
}

export interface DebateVoice {
  id: string;
  label: string;
  gender: "male" | "female" | "neutral";
  style: string;
}

/** Fetch available debate voices with metadata. */
export async function getDebateVoices(): Promise<DebateVoice[]> {
  const res = await apiFetch<{ voices: DebateVoice[] }>("/api/debate/voices");
  return res.voices;
}

/** Start a new debate session and receive agent profiles. */
export async function startDebate(
  topic: string,
  numTurns = 6,
  style = "standard",
  voiceA?: string,
  voiceB?: string,
): Promise<DebateSessionResponse> {
  return apiFetch<DebateSessionResponse>("/api/debate/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, num_turns: numTurns, style, voice_a: voiceA, voice_b: voiceB }),
  });
}

/**
 * Request a single debate turn. Returns an EventSource-compatible ReadableStream
 * of SSE events. Parse each `data: {...}` line as JSON (DebateTurnSSEEvent).
 */
export async function streamDebateTurn(
  sessionId: string,
  turnNumber: number
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${API_BASE}/api/debate/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turn_number: turnNumber }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Debate turn failed: ${res.status}`);
  }

  if (!res.body) throw new Error("No response body for debate turn stream");
  return res.body;
}

/** Retrieve full session detail with all completed turns. */
export async function getDebateSession(
  sessionId: string
): Promise<DebateSessionDetail> {
  return apiFetch<DebateSessionDetail>(`/api/debate/${sessionId}`);
}

/** Delete a conversation and all its messages. */
export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Delete failed: ${res.status}`);
  }
}

/** List recent debate sessions. */
export async function listDebateSessions(limit = 10): Promise<{
  sessions: {
    session_id: string;
    topic: string;
    agent_a_name: string;
    agent_b_name: string;
    num_turns: number;
    created_at: string | null;
  }[];
  total: number;
}> {
  return apiFetch(`/api/debate/sessions/list?limit=${limit}`);
}
