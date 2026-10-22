import os
from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from minutes import Minutes, MinutesRequest, generate_minutes
from pdf_export import render_minutes_pdf
from speakers import speaker_status, detect_speakers

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
MODEL_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
MODEL_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI(title="MeetSync meeting intelligence")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")],
    # Vite chooses another port when 5173 is busy. Only allow loopback hosts.
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1)(?::[0-9]+)?$",
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_model():
    from faster_whisper import WhisperModel
    return WhisperModel(
        MODEL_SIZE,
        device=MODEL_DEVICE,
        compute_type=MODEL_COMPUTE_TYPE,
        download_root=str(Path(__file__).parent / 'models' / 'whisper'),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_SIZE}


@app.get('/speakers/status')
def speakers_status():
    return speaker_status()


@app.post('/transcribe/speakers')
async def transcribe_speakers(file: UploadFile = File(...), num_speakers: int = Form(default=-1, ge=-1, le=20)):
    if num_speakers == 0:
        raise HTTPException(status_code=422, detail='Choose auto-detect or 1–20 speakers.')
    if not speaker_status()['available']:
        raise HTTPException(status_code=503, detail=speaker_status()['message'])
    suffix = Path(file.filename or '').suffix.lower()
    if suffix not in {'.mp3', '.webm', '.wav', '.m4a', '.mp4', '.ogg'}:
        raise HTTPException(status_code=400, detail='Unsupported audio format.')
    contents = await file.read(30 * 1024 * 1024 + 1)
    if len(contents) > 30 * 1024 * 1024:
        raise HTTPException(status_code=413, detail='Speaker recordings must be smaller than 30 MB.')
    if not contents:
        raise HTTPException(status_code=400, detail='The recording is empty.')
    temp_path = None
    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as recording:
            recording.write(contents)
            temp_path = recording.name
        return await run_in_threadpool(lambda: detect_speakers(temp_path, get_model(), num_speakers))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        import logging
        logging.getLogger(__name__).exception('Speaker detection failed')
        raise HTTPException(status_code=500, detail='Speaker detection failed. Check the local backend and model setup; your live transcript is still available.') from error
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="An audio file is required.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp3", ".webm", ".wav", ".m4a", ".mp4", ".ogg"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format.")

    contents = await file.read(100 * 1024 * 1024 + 1)
    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio must be smaller than 100 MB.")
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded audio file is empty.")

    temp_path = None
    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name

        return await run_in_threadpool(transcribe_path, temp_path)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {error}") from error
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


def transcribe_path(temp_path):
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


@app.post("/minutes", response_model=Minutes)
def create_minutes(request: MinutesRequest):
    if len(request.transcript.strip()) < 20:
        raise HTTPException(status_code=422, detail="Add at least 20 characters of meeting transcript.")
    return generate_minutes(request)


@app.post("/minutes/pdf")
def export_minutes(minutes: Minutes):
    try:
        content = render_minutes_pdf(minutes)
        return Response(content, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="meetsync-minutes.pdf"'})
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
