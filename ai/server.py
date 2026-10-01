import os
import sys
import time
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any

# Add project root to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ai.config.settings import settings
from ai.pipeline.orchestrator import process_call, CallPipeline
from ai.analysis.llm_provider import get_llm_provider, LocalLlamaProvider

app = FastAPI(title="EchoCRM AI Service", version="1.0.0")

# Security: Restrict CORS strictly to local development origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

model_warmed_up: bool = False

@app.on_event("startup")
def startup_event():
    global model_warmed_up
    provider = get_llm_provider()
    if isinstance(provider, LocalLlamaProvider):
        try:
            start_time = time.time()
            provider.generate("Warmup prompt")
            elapsed = time.time() - start_time
            model_warmed_up = True
            print(f"[Startup] ✓ Llama model warmed up in {elapsed:.2f}s")
        except Exception as e:
            model_warmed_up = False
            print(f"[Startup] ✗ Llama model warm-up failed: {str(e)}")
    else:
        model_warmed_up = False

class ProcessCallRequest(BaseModel):
    audio_path: Optional[str] = None
    customer_id: Optional[str] = None  # Pre-supplied customer UUID; skips AI customer identification when set

@app.get("/health")
def health_check():
    """Health check endpoint to verify Python AI service availability."""
    provider = get_llm_provider()
    return {
        "status": "ok",
        "service": "echocrm-ai",
        "whisper_model": settings.WHISPER_MODEL_SIZE,
        "llm_provider": provider.get_provider_name(),
        "llm_model": provider.get_model_name(),
        "model_warmed_up": model_warmed_up
    }


@app.post("/process-call")
def handle_process_call(request: ProcessCallRequest) -> Dict[str, Any]:
    """
    Processes local audio call recording via Whisper + Ollama LLM.
    Returns transcript, structured CRM analysis, and execution metadata.
    100% Local-First, no internet dependency.
    """
    audio_path = request.audio_path
    
    # Default to sample audio if no path provided or relative name passed
    if not audio_path:
        audio_path = os.path.join("test", "sample-audio", "Standard recording 18.mp3")
    elif not os.path.isabs(audio_path) and not os.path.exists(audio_path):
        alt_path = os.path.join("test", "sample-audio", audio_path)
        if os.path.exists(alt_path):
            audio_path = alt_path

    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail=f"Audio file not found at path: {audio_path}")

    ext = os.path.splitext(audio_path)[1].lower()
    if ext not in settings.SUPPORTED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Supported formats: {', '.join(settings.SUPPORTED_AUDIO_EXTENSIONS)}"
        )

    try:
        result = process_call(audio_path, customer_id=request.customer_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Processing exception: {str(e)}")

def main():

    port = int(os.getenv("AI_SERVICE_PORT", "8000"))
    print(f"Starting EchoCRM AI Service on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

if __name__ == "__main__":
    main()
