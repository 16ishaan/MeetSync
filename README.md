# MeetSync — meetings into minutes

Capture a meeting, review its transcript, generate editable Minutes of Meeting (MOM), and download a formatted PDF. The existing Orb, TextPressure, specular button, particles, glow, tilt, and menu animations are preserved.

## Browser-only mode (default)

**No Python server is needed for MOM generation or PDF download.** Run `npm install` and `npm run dev`, then paste a transcript or use Live Speech, click **Generate MOM**, review, and **Download MOM as PDF**.

Default generation runs English extractive rules entirely in the browser; it is explicitly labeled as a draft, not an AI summary. Missing owners and deadlines are not guessed. PDF export also runs locally and preserves the device font rendering, including supported non-Latin scripts. Pages are raster images rather than selectable/searchable text. Glyph availability depends on the fonts installed on the device.

To opt into the optional AI backend, set `VITE_MOM_USE_BACKEND=true` in the frontend `.env` and restart Vite. Backend failures fall back to browser generation instead of blocking the workflow. Audio-file and recorded-audio Whisper transcription still require the Python service; live microphone transcription uses the browser speech service.

## Workflow

### Speakers and who does what

Live Speech now offers two modes:

- **Live text with optional speaker name:** enter a name before Start. Stop, change the name, and start again when the speaker changes. These labels are manual.
- **Live text + detect voices after Stop:** records the microphone alongside the browser transcript. Stop, optionally enter the known number of speakers (1–20), choose **Detect speakers**, listen to the recording, and rename the detected Speaker 1 / Speaker 2 groups. The updated transcript, download, and MOM import all use these names. Detection runs after the recording, not in real time. Clear before another speaker recording.

Voice separation uses local sherpa-onnx with pyannote segmentation and NeMo TitaNet embeddings, plus faster-whisper word timestamps. It does not infer real identities or who is listening. People who do not speak cannot be detected. Overlapping or unmatched speech may be labelled Unknown speaker; voice groups and transcription need review. The browser may still send live speech to its speech service. **Detect speakers** sends the recording only to `VITE_TRANSCRIPTION_API_URL` (the local backend by default); temporary server audio is deleted afterward. No enrolled voiceprints are stored.

The **Who does what** preview extracts explicit English assignments locally, without a paid API or text model. For example:

```text
Ishaan: hello everyone today jigisha will do the review for the product and risheek will do the backend testing

Jigisha: do the review for the product
Risheek: do the backend testing
```

The owner is the person assigned the task, not necessarily the speaker. “I will…” uses the named speaker label. Unclear pronouns remain Not specified. Attendee names preserve spelling. Separate explicit clauses and joint single-name owners are supported; ambiguous references and complex sentences need manual review in the editable MOM. This rule-based extraction is English-only. Optional Ollama generation also receives instructions to distinguish speakers from assignees.

### Speaker detection setup

The existing Python backend is required only for automatic voice detection, not for manual labels or task extraction. Install once from the repository root:

```powershell
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-speakers.txt
.\backend\.venv\Scripts\python.exe backend/setup_speakers.py
```

Models download from the official [sherpa-onnx releases](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html) into ignored `backend/models/`. No paid API key or Hugging Face account is needed. Retain the downloaded segmentation license. Whisper downloads its selected model into `backend/models/whisper/` on first use. Start the backend as described below, then check `GET /speakers/status`. Optional server variables `SPEAKER_SEGMENTATION_MODEL` and `SPEAKER_EMBEDDING_MODEL` select other installed compatible model paths. Speaker recordings are limited to 15 minutes / 30 MB. CPU processing can take time; canceling the browser request preserves the live text but an already-running server inference may finish in the background.

1. Sign in with the existing Supabase Google authentication.
2. Record tab + microphone audio, use live microphone speech recognition, upload an MP3, or paste your transcript directly.
3. Choose **Use transcript for MOM** after transcription. Add the title, meeting date, and attendees.
4. Choose **Generate MOM**. Review and edit the summary, discussion, decisions, action items (task, owner, deadline), and next steps.
5. Choose **Download MOM as PDF**. The PDF contains your latest edits in an ivory-and-gold layout with a serif title, attendee initials, numbered decisions, shaded action cards, deadline badges, and page numbers. Long content wraps and continues onto additional A4 pages. Dates and owners are taken from the reviewed draft.

**Try sample** loads demonstration text without recording anything. **Save browser draft** and **Restore draft** retain one draft per signed-in user in this browser, not in cloud storage. Clearing a meeting also deletes its saved draft. This browser storage is not encrypted; do not use a shared browser for sensitive meetings.

## Run on Windows

Use two PowerShell terminals in the repository folder.

### Frontend

```powershell
npm install
npm run dev
```

Open the Local URL Vite prints, usually http://localhost:5173. Keep the terminal open.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn transcription_server:app --host 127.0.0.1 --port 8000
```

If PowerShell blocks activation, run `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` and `.\.venv\Scripts\python.exe -m uvicorn transcription_server:app --host 127.0.0.1 --port 8000` instead. No policy change is needed.

The backend must be running for Whisper audio transcription and optional AI generation. Browser MOM generation and PDF downloads do not use it. Live browser speech transcription does not require Whisper. Whisper loads lazily on the first audio transcription and may download model files then; choose `WHISPER_MODEL=tiny` for a lighter CPU model. Default: base / CPU / int8.

## Environment

Create `.env` in the repository root (never commit credentials):

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_TRANSCRIPTION_API_URL=http://127.0.0.1:8000
```

Only the public Supabase anon/publishable key belongs in Vite. Never use a service-role key. Enable Google in Supabase Auth and allow `http://localhost:5173/` and `http://127.0.0.1:5173/` as redirect URLs. Run `supabase/recordings.sql` in the Supabase SQL editor to set up private audio storage and recording row policies.

### MOM engines

**Without a model:** the backend produces an explicitly labeled **extractive draft**, selecting source sentences and English keyword matches. It does not perform semantic AI summarization. Owners and deadlines stay “Not specified” until reviewed. Other languages can be transcribed and edited, but automatic rule-based classification is English-only. Decisions and tasks must always be checked against the original transcript.

**Optional local AI:** install [Ollama](https://ollama.com), run a model, then set its name in the backend terminal before starting the server:

```powershell
ollama pull llama3.2:3b
$env:OLLAMA_MODEL="llama3.2:3b"
python -m uvicorn transcription_server:app --host 127.0.0.1 --port 8000
```

This uses the local Ollama structured-output API; no paid API key is needed. Optional `OLLAMA_URL` defaults to `http://127.0.0.1:11434`. Server environment variables are read from the terminal, not automatically from the frontend `.env`. Failed or invalid AI output falls back to an explicitly labeled extractive draft. Review AI output for errors. Long transcripts and model performance depend on available memory and model context capacity.

## Limits and privacy

- Audio: MP3 uploads in the UI; backend supports MP3, WebM, WAV, M4A, MP4, OGG, up to 100 MB. Transcript input is limited to 60,000 characters. Automatic section lists are limited to 50 entries; review long meetings for omissions.
- Live speech captures the microphone, not other tabs; the browser may send audio to its speech service. Use a compatible browser on HTTPS or localhost and allow the microphone.
- Tab recording captures tab audio plus microphone. Enable **Share tab audio** in the browser picker. Obtain participant consent as appropriate before recording.
- Audio is saved on-device and, when configured and signed in, in the existing private Supabase bucket. Text is sent to your configured backend; optional AI runs at `OLLAMA_URL`. PDF downloads are generated in the browser; they do not send minutes to the backend.
- The optional legacy backend PDF endpoint uses Bitstream Vera and has limited script coverage. The default browser PDF download renders through installed device fonts instead.
- The FastAPI service is intended for **local development** and binds to loopback. It has no server authentication or rate limiting. Before internet deployment, add authenticated endpoints, request/rate limits, HTTPS, and an explicit `CORS_ORIGINS` allowlist. Browser sign-in alone does not protect API endpoints.

## API and validation

- `GET /health` — service status (does not preload Whisper).
- `POST /transcribe` — multipart `file`, returns transcript and segments.
- `GET /speakers/status` — whether local speaker dependencies and model files are present.
- `POST /transcribe/speakers` — multipart `file` and optional `num_speakers` (`-1` for auto, or 1–20), returns speaker-labelled, timestamped segments from local models. Maximum 15 minutes / 30 MB.
- `POST /minutes` — JSON `transcript`, `title`, `date`, `attendees`; returns editable MOM.
- `POST /minutes/pdf` — reviewed MOM JSON; returns PDF bytes.

```powershell
npm run build
node --test tests/speechRecognition.test.js
python -m pip install httpx
python -m unittest discover -s backend -p "test_*.py" -v
```

Tests cover grounded extraction, metadata preservation, missing assignments, input validation, AI fallback, PDF export, and speech result lifecycle. Live microphone permissions, Google OAuth, actual Whisper inference, and optional Ollama inference require local integration testing.
