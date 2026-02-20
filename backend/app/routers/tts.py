import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

from app.config import get_settings
from app.models import TTSRequest
from app.services.minimax_tts import MiniMaxTTS

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
        audio_bytes = tts.synthesize(
            text=req.text,
            voice_id=req.voice_id,
            emotion=req.emotion,
        )
    except Exception as e:
        logger.error("TTS batch failed: %s", e)
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")

    logger.info("TTS: %d chars → %d bytes", len(req.text), len(audio_bytes))
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

    def generate():
        try:
            yield from tts.synthesize_stream(
                text=req.text,
                voice_id=req.voice_id,
                speed=1.05,  # slightly faster for voice agent feel
            )
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
