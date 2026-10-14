import os
from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
MODEL_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
MODEL_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI(title="MeetSync transcription service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")],
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_model() -> WhisperModel:
    return WhisperModel(
        MODEL_SIZE,
        device=MODEL_DEVICE,
        compute_type=MODEL_COMPUTE_TYPE,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="An audio file is required.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp3", ".webm", ".wav", ".m4a", ".mp4", ".ogg"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded audio file is empty.")

    temp_path = None
    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name

        segments, info = get_model().transcribe(
            temp_path,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        segment_list = [
            {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip(),
            }
            for segment in segments
        ]
        return {
            "text": " ".join(segment["text"] for segment in segment_list),
            "language": info.language,
            "language_probability": info.language_probability,
            "segments": segment_list,
        }
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {error}") from error
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
