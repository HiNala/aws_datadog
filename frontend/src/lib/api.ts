const API_BASE =
  typeof window !== "undefined"
    ? ""
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export async function sendChatMessage(
  message: string,
  conversationId: string | null = null
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Chat failed: ${res.status}`);
  }

  return res.json();
}

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

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`);

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }

  return res.json();
}
