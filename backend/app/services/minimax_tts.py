import logging

import httpx

logger = logging.getLogger("opsvoice.minimax_tts")

TTS_URL = "https://api.minimax.io/v1/t2a_v2"
DEFAULT_MODEL = "speech-2.8-hd"


class MiniMaxTTS:
    """Converts text to speech using MiniMax speech-2.8-hd."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def synthesize(
        self,
        text: str,
        voice_id: str = "English_expressive_narrator",
        emotion: str | None = None,
    ) -> bytes:
        """Return MP3 audio bytes for the given text."""
        payload: dict = {
            "model": DEFAULT_MODEL,
            "text": text,
            "stream": False,
            "language_boost": "English",
            "output_format": "hex",
            "voice_setting": {
                "voice_id": voice_id,
                "speed": 1.0,
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

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        logger.info("MiniMax TTS: synthesizing %d chars, voice=%s", len(text), voice_id)

        with httpx.Client(timeout=30.0) as client:
            resp = client.post(TTS_URL, json=payload, headers=headers)

        if resp.status_code != 200:
            logger.error("MiniMax error %d: %s", resp.status_code, resp.text[:500])
            raise RuntimeError(f"MiniMax TTS returned {resp.status_code}")

        data = resp.json()

        base_resp = data.get("base_resp", {})
        if base_resp.get("status_code", 0) != 0:
            raise RuntimeError(f"MiniMax TTS error: {base_resp.get('status_msg')}")

        hex_audio = data["data"]["audio"]
        audio_bytes = bytes.fromhex(hex_audio)

        extra = data.get("extra_info", {})
        logger.info(
            "MiniMax TTS: %d chars → %d bytes, %dms audio",
            extra.get("usage_characters", len(text)),
            len(audio_bytes),
            extra.get("audio_length", 0),
        )

        return audio_bytes
