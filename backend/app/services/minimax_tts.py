import logging
from collections.abc import Iterator

import httpx

logger = logging.getLogger("opsvoice.minimax_tts")

TTS_URL = "https://api.minimax.io/v1/t2a_v2"
TTS_URL_UW = "https://api-uw.minimax.io/v1/t2a_v2"  # lower latency

# Batch (high quality demo) vs turbo (real-time voice)
MODEL_HD = "speech-2.8-hd"
MODEL_TURBO = "speech-2.8-turbo"

# Voices tuned for different scenarios
# All confirmed-working MiniMax Speech-2.8 voice IDs (tested Feb 2026)
VOICES = {
    # Female voices
    "Wise_Woman":           "Wise_Woman",           # warm, authoritative
    "Calm_Woman":           "Calm_Woman",           # composed, clear
    "Friendly_Person":      "Friendly_Person",      # warm, approachable
    "Inspirational_girl":   "Inspirational_girl",   # upbeat, motivating
    "Lively_Girl":          "Lively_Girl",          # energetic, bright
    "Lovely_Girl":          "Lovely_Girl",          # soft, expressive
    "Abbess":               "Abbess",               # formal, measured
    "Sweet_Girl_2":         "Sweet_Girl_2",         # gentle, clear
    "Exuberant_Girl":       "Exuberant_Girl",       # enthusiastic, bold
    # Male voices
    "Deep_Voice_Man":       "Deep_Voice_Man",       # deep, commanding
    "Patient_Man":          "Patient_Man",          # calm, deliberate
    "Casual_Guy":           "Casual_Guy",           # relaxed, natural
    "Young_Knight":         "Young_Knight",         # earnest, idealistic
    "Determined_Man":       "Determined_Man",       # resolute, direct
    "Decent_Boy":           "Decent_Boy",           # honest, steady
    "Imposing_Manner":      "Imposing_Manner",      # forceful, bold
    "Elegant_Man":          "Elegant_Man",          # refined, articulate
    # Legacy narrator
    "narrator":             "English_expressive_narrator",
    "default":              "English_expressive_narrator",
}

# Curated list for debate — picked for strong contrast and audio clarity
DEBATE_VOICES = [
    {"id": "English_expressive_narrator", "label": "Expressive Narrator", "gender": "neutral", "style": "professional"},
    {"id": "Wise_Woman",                  "label": "Wise Woman",          "gender": "female",  "style": "authoritative"},
    {"id": "Deep_Voice_Man",              "label": "Deep Voice",          "gender": "male",    "style": "commanding"},
    {"id": "Calm_Woman",                  "label": "Calm Woman",          "gender": "female",  "style": "composed"},
    {"id": "Determined_Man",              "label": "Determined Man",      "gender": "male",    "style": "resolute"},
    {"id": "Imposing_Manner",             "label": "Imposing",            "gender": "male",    "style": "forceful"},
    {"id": "Friendly_Person",             "label": "Friendly",            "gender": "neutral", "style": "warm"},
    {"id": "Patient_Man",                 "label": "Patient Man",         "gender": "male",    "style": "deliberate"},
    {"id": "Lively_Girl",                 "label": "Lively",              "gender": "female",  "style": "energetic"},
    {"id": "Casual_Guy",                  "label": "Casual Guy",          "gender": "male",    "style": "relaxed"},
    {"id": "Young_Knight",                "label": "Young Knight",        "gender": "male",    "style": "earnest"},
    {"id": "Abbess",                      "label": "Abbess",              "gender": "female",  "style": "formal"},
]


class MiniMaxTTS:
    """
    MiniMax speech-2.8-hd/turbo text-to-speech.

    synthesize()        → full MP3 bytes (best quality, ~1-2s latency)
    synthesize_stream() → Iterator[bytes] (starts in ~200ms, live feel)
    """

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    # ── Batch (non-streaming) ──────────────────────────────────────────────

    def synthesize(
        self,
        text: str,
        voice_id: str = VOICES["narrator"],
        emotion: str | None = None,
        speed: float = 1.0,
    ) -> bytes:
        """Return full MP3 audio bytes. Uses speech-2.8-hd for max quality."""
        payload: dict = {
            "model": MODEL_HD,
            "text": text,
            "stream": False,
            "language_boost": "English",
            "output_format": "hex",
            "voice_setting": {
                "voice_id": voice_id,
                "speed": speed,
                "vol": 1.0,
                "pitch": 0,
            },
            "audio_setting": {
                "format": "mp3",
                "sample_rate": 32000,
                "bitrate": 128000,
                "channel": 1,
            },
        }
        if emotion:
            payload["voice_setting"]["emotion"] = emotion

        logger.info("TTS batch: %d chars, voice=%s", len(text), voice_id)

        with httpx.Client(timeout=30.0) as client:
            resp = client.post(TTS_URL, json=payload, headers=self._headers())

        if resp.status_code != 200:
            raise RuntimeError(f"MiniMax TTS returned {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        base_resp = data.get("base_resp", {})
        if base_resp.get("status_code", 0) != 0:
            raise RuntimeError(f"MiniMax TTS: {base_resp.get('status_msg')}")

        audio_bytes = bytes.fromhex(data["data"]["audio"])
        extra = data.get("extra_info", {})
        logger.info(
            "TTS batch done: %d bytes, %dms audio",
            len(audio_bytes), extra.get("audio_length", 0),
        )
        return audio_bytes

    # ── Streaming (turbo model, SSE → raw MP3 binary) ──────────────────────

    def synthesize_stream(
        self,
        text: str,
        voice_id: str = VOICES["narrator"],
        speed: float = 1.05,
        pitch: int = 0,
        vol: float = 1.0,
    ) -> Iterator[bytes]:
        """
        Stream raw MP3 chunks. Uses speech-2.8-turbo for <250ms TTFA.

        MiniMax streaming returns SSE lines like:
            data: {"data":{"audio":"<hex-encoded-mp3>"},"trace_id":"...","base_resp":{"status_code":0,...}}
        We parse each SSE event, extract the hex audio, decode to binary,
        and yield raw MP3 bytes that can be piped directly to the browser.
        """
        import json as _json

        payload = {
            "model": MODEL_TURBO,
            "text": text,
            "stream": True,
            "stream_options": {"chunk_size": 100},
            "language_boost": "English",
            "voice_setting": {
                "voice_id": voice_id,
                "speed": speed,
                "vol": vol,
                "pitch": pitch,
            },
            "audio_setting": {
                "format": "mp3",
                "sample_rate": 32000,
                "bitrate": 128000,
                "channel": 1,
            },
        }

        logger.info("TTS stream: %d chars, voice=%s (turbo)", len(text), voice_id)

        total = 0
        chunk_count = 0
        chunk_sizes: list[int] = []
        with httpx.Client(timeout=60.0) as client:
            with client.stream("POST", TTS_URL_UW, json=payload, headers=self._headers()) as response:
                if response.status_code != 200:
                    raise RuntimeError(f"TTS stream returned {response.status_code}")

                buf = ""
                for raw in response.iter_text():
                    buf += raw
                    while "\n" in buf:
                        line, buf = buf.split("\n", 1)
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        json_str = line[5:].strip()
                        if not json_str:
                            continue
                        try:
                            evt = _json.loads(json_str)
                        except _json.JSONDecodeError:
                            continue

                        base_resp = evt.get("base_resp", {})
                        status_code = base_resp.get("status_code", 0)
                        if status_code != 0:
                            msg = base_resp.get("status_msg", "unknown TTS error")
                            raise RuntimeError(f"MiniMax TTS error ({status_code}): {msg}")

                        has_extra = "extra_info" in evt
                        hex_audio = evt.get("data", {}).get("audio", "")
                        if not hex_audio:
                            continue

                        audio_bytes = bytes.fromhex(hex_audio)
                        size = len(audio_bytes)

                        # MiniMax sends a final SSE event with `extra_info` that
                        # contains ALL the audio concatenated. Skip it — we already
                        # yielded every incremental chunk.
                        if has_extra:
                            logger.info(
                                "TTS stream: skipping final summary event (%d bytes, "
                                "already yielded %d bytes in %d chunks)",
                                size, total, chunk_count,
                            )
                            continue

                        chunk_count += 1
                        chunk_sizes.append(size)
                        total += size
                        yield audio_bytes

        logger.info(
            "TTS stream done: %d bytes in %d chunks (sizes: %s)",
            total, chunk_count,
            ", ".join(str(s) for s in chunk_sizes[:10]) + ("..." if len(chunk_sizes) > 10 else ""),
        )
