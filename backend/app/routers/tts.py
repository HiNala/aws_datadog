import logging
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

from app.config import get_settings
from app.models import TTSRequest
from app.services.minimax_tts import MiniMaxTTS
from app.services.datadog_obs import task_span, annotate

logger = logging.getLogger("opsvoice.tts")
router = APIRouter(prefix="/api", tags=["tts"])

_tts: MiniMaxTTS | None = None


def _get_tts() -> MiniMaxTTS:
    global _tts
    if _tts is None:
        settings = get_settings()
        if not settings.minimax_api_key:
            raise HTTPException(status_code=503, detail="MiniMax API key not configured")
        _tts = MiniMaxTTS(settings.minimax_api_key)
    return _tts


# ── Batch TTS (full audio, best quality) ─────────────────────────────────

@router.post("/tts")
def text_to_speech(req: TTSRequest):
    """Return complete MP3 audio using speech-2.8-hd."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if len(req.text) > 10_000:
        raise HTTPException(status_code=400, detail="Text exceeds 10,000 char limit")

    tts = _get_tts()
    try:
        t0 = time.time()
        with task_span("tts-batch-synthesize"):
            annotate(tags={"voice_id": req.voice_id, "text_len": str(len(req.text)), "feature": "tts"})
            audio_bytes = tts.synthesize(
                text=req.text,
                voice_id=req.voice_id,
                emotion=req.emotion,
            )
            latency = round((time.time() - t0) * 1000, 1)
            annotate(metrics={"tts_latency_ms": latency, "audio_bytes": float(len(audio_bytes))})
    except Exception as e:
        logger.error("TTS batch failed: %s", e)
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")

    logger.info("TTS: %d chars → %d bytes (%.0fms)", len(req.text), len(audio_bytes), latency)
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=response.mp3"},
    )


# ── Streaming TTS (speech-2.8-turbo, <250ms first audio) ──────────────────

@router.post("/tts/stream")
def text_to_speech_stream(req: TTSRequest):
    """
    Stream MP3 audio in real-time using speech-2.8-turbo.
    Browser can start playback as soon as the first chunk arrives (~200-250ms).
    Use this endpoint for the voice agent page.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if len(req.text) > 5_000:
        raise HTTPException(status_code=400, detail="Text too long for streaming")

    tts = _get_tts()
    logger.info("TTS stream: voice=%s, speed=%.2f, pitch=%d, %d chars", req.voice_id, req.speed, req.pitch, len(req.text))

    def generate():
        try:
            with task_span("tts-stream-synthesize"):
                annotate(tags={"voice_id": req.voice_id, "speed": str(req.speed), "pitch": str(req.pitch), "text_len": str(len(req.text)), "feature": "tts-stream"})
                chunk_count = 0
                for chunk in tts.synthesize_stream(
                    text=req.text,
                    voice_id=req.voice_id,
                    speed=req.speed,
                    pitch=req.pitch,
                ):
                    chunk_count += 1
                    yield chunk
                annotate(metrics={"tts_stream_chunks": float(chunk_count)})
        except Exception as e:
            logger.error("TTS stream failed: %s", e)

    return StreamingResponse(
        generate(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )
