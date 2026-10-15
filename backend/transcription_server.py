import json
import os
from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from pydantic import BaseModel

# ── Configuration ────────────────────────────────────────────────────────────

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
MODEL_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
MODEL_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")  # openai | anthropic | google
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")

_cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="MeetSync transcription service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Whisper model (lazy-loaded, cached) ───────────────────────────────────────


@lru_cache(maxsize=1)
def get_whisper_model() -> WhisperModel:
    return WhisperModel(MODEL_SIZE, device=MODEL_DEVICE, compute_type=MODEL_COMPUTE_TYPE)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict:
    ai_configured = bool(AI_API_KEY)
    return {
        "status": "ok",
        "model": MODEL_SIZE,
        "ai_provider": AI_PROVIDER if ai_configured else "not configured",
        "ai_configured": ai_configured,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="An audio file is required.")

    suffix = Path(file.filename).suffix.lower()
    allowed_suffixes = {".mp3", ".webm", ".wav", ".m4a", ".mp4", ".ogg"}
    if suffix not in allowed_suffixes:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{suffix}'. Accepted: {', '.join(sorted(allowed_suffixes))}",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded audio file is empty.")

    temp_path: str | None = None
    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            temp_path = tmp.name

        segments, info = get_whisper_model().transcribe(
            temp_path,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        segment_list = [
            {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
            for s in segments
        ]
        return {
            "text": " ".join(s["text"] for s in segment_list),
            "language": info.language,
            "language_probability": round(info.language_probability, 4),
            "segments": segment_list,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


# ── MoM generation ────────────────────────────────────────────────────────────

MOM_SCHEMA = {
    "title": "string — meeting title",
    "date": "ISO-8601 date string or null",
    "duration": "human-readable duration string or null",
    "overview": "2-3 sentence overview paragraph",
    "summary": "executive summary paragraph",
    "discussion_points": ["array of discussion topic strings"],
    "decisions": ["array of decision strings"],
    "action_items": [
        {
            "title": "short task title",
            "description": "detailed task description",
            "assignee": "person name or 'Unassigned'",
            "deadline": "deadline string or null",
            "priority": "high | medium | low",
            "source_context": "verbatim quote from transcript",
        }
    ],
    "unresolved_questions": ["array of open question strings"],
}

MOM_SYSTEM_PROMPT = f"""You are a professional meeting secretary. Given a meeting transcript, produce a structured Minutes of Meeting (MoM) document.

Output ONLY a JSON object matching this schema (no markdown fences, no extra text):
{json.dumps(MOM_SCHEMA, indent=2)}

Rules:
- Base every field strictly on what was said in the transcript.
- Do not invent names, deadlines, or decisions.
- If a responsible person cannot be identified, set assignee to "Unassigned".
- If no deadline was stated, set deadline to null.
- Distinguish between confirmed decisions and mere suggestions (only confirmed decisions go in "decisions").
- Extract genuine action items from statements like "I will", "we need to", "X will do Y by Z".
- Do not repeat content — each array item should be distinct.
- Return valid JSON only."""


class MomRequest(BaseModel):
    transcript: str
    meeting_title: str = "Meeting"
    duration_ms: int = 0


@app.post("/generate-mom")
async def generate_mom(req: MomRequest) -> dict:
    if not req.transcript or not req.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is required.")

    if not AI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI provider is not configured. "
                "Set AI_API_KEY (and optionally AI_PROVIDER and AI_MODEL) "
                "in your backend environment variables."
            ),
        )

    user_content = (
        f"Meeting title: {req.meeting_title}\n"
        f"Duration: {req.duration_ms // 60000} minutes\n\n"
        f"TRANSCRIPT:\n{req.transcript}"
    )

    try:
        mom_data = await _call_ai(user_content)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI processing failed: {exc}") from exc

    # Normalize and validate the response
    mom_data = _normalize_mom(mom_data, req.meeting_title)
    return mom_data


async def _call_ai(user_content: str) -> dict:
    """Dispatch to the configured AI provider and return parsed JSON."""

    if AI_PROVIDER == "openai":
        return await _call_openai(user_content)
    elif AI_PROVIDER == "anthropic":
        return await _call_anthropic(user_content)
    elif AI_PROVIDER == "google":
        return await _call_google(user_content)
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Unknown AI_PROVIDER '{AI_PROVIDER}'. Supported: openai, anthropic, google.",
        )


async def _call_openai(user_content: str) -> dict:
    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=500, detail="httpx is required for OpenAI calls. Run: pip install httpx")

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": MOM_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            },
        )

    if resp.status_code != 200:
        body = resp.text[:500]
        raise HTTPException(status_code=502, detail=f"OpenAI error {resp.status_code}: {body}")

    data = resp.json()
    raw = data["choices"][0]["message"]["content"]
    return _parse_json_response(raw)


async def _call_anthropic(user_content: str) -> dict:
    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=500, detail="httpx is required. Run: pip install httpx")

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": AI_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": AI_MODEL or "claude-3-haiku-20240307",
                "max_tokens": 4096,
                "system": MOM_SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user_content}],
            },
        )

    if resp.status_code != 200:
        body = resp.text[:500]
        raise HTTPException(status_code=502, detail=f"Anthropic error {resp.status_code}: {body}")

    data = resp.json()
    raw = data["content"][0]["text"]
    return _parse_json_response(raw)


async def _call_google(user_content: str) -> dict:
    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=500, detail="httpx is required. Run: pip install httpx")

    model = AI_MODEL or "gemini-1.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={AI_API_KEY}"

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "contents": [
                    {
                        "parts": [
                            {"text": MOM_SYSTEM_PROMPT + "\n\n" + user_content}
                        ]
                    }
                ],
                "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
            },
        )

    if resp.status_code != 200:
        body = resp.text[:500]
        raise HTTPException(status_code=502, detail=f"Google AI error {resp.status_code}: {body}")

    data = resp.json()
    raw = data["candidates"][0]["content"]["parts"][0]["text"]
    return _parse_json_response(raw)


def _parse_json_response(raw: str) -> dict:
    """Parse JSON, stripping markdown fences if present."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {exc}") from exc


def _normalize_mom(data: dict, fallback_title: str) -> dict:
    """Ensure required fields exist and have correct types."""
    data.setdefault("title", fallback_title)
    data.setdefault("overview", "")
    data.setdefault("summary", "")
    data.setdefault("discussion_points", [])
    data.setdefault("decisions", [])
    data.setdefault("action_items", [])
    data.setdefault("unresolved_questions", [])

    # Normalize action items
    normalized_actions = []
    for item in data.get("action_items", []):
        if isinstance(item, str):
            item = {"title": item}
        item.setdefault("title", "Untitled task")
        item.setdefault("description", "")
        item.setdefault("assignee", "Unassigned")
        item.setdefault("deadline", None)
        item.setdefault("priority", "medium")
        item.setdefault("source_context", "")
        if item["priority"] not in ("high", "medium", "low"):
            item["priority"] = "medium"
        normalized_actions.append(item)

    data["action_items"] = normalized_actions
    return data
