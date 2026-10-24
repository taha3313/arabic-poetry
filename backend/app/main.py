from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core import get_settings
from app.schemas import AnalyzeRequest, GenerateRequest
from app.services.generator import GenerationError, generate
from app.services.prosody import METER_KEYS, METERS, analyze_with_tashkeel
from app.services.tashkeel import TashkeelUnavailable

app = FastAPI(title="Bayt | بَيْت", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def check_meter(meter: str):
    if meter not in METER_KEYS:
        raise HTTPException(422, "البحر غير مدعوم")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    settings = get_settings()
    return {
        "meters": METERS,
        "provider": settings.provider,
        "model": settings.model,
        "generation_available": settings.generation_enabled and bool(settings.api_key),
    }


@app.post("/api/analyze")
def analyze_poem(request: AnalyzeRequest):
    check_meter(request.meter)
    try:
        return analyze_with_tashkeel(
            request.verses, request.meter, request.rawi, request.auto_tashkeel
        )
    except TashkeelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/api/generate")
async def generate_poem(request: GenerateRequest):
    check_meter(request.meter)
    settings = get_settings()
    if not settings.generation_enabled:
        raise HTTPException(503, "Generation is disabled on this deployment.")
    try:
        return await generate(request, settings)
    except GenerationError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
