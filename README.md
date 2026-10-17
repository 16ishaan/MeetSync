# MeetSync — meetings into minutes

Capture a meeting, review its transcript, generate editable Minutes of Meeting (MOM), and download a formatted PDF. The existing Orb, TextPressure, specular button, particles, glow, tilt, and menu animations are preserved.

## Workflow

1. Sign in with the existing Supabase Google authentication.
2. Record tab + microphone audio, use live microphone speech recognition, upload an MP3, or paste your transcript directly.
3. Choose **Use transcript for MOM** after transcription. Add the title, meeting date, and attendees.
4. Choose **Generate MOM**. Review and edit the summary, discussion, decisions, action items (task, owner, deadline), and next steps.
5. Choose **Download MOM as PDF**. The PDF contains your latest edits, repeated action table headers, and page numbers.

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

The backend must be running for audio transcription, MOM generation, and PDF downloads. Live browser speech transcription does not require Whisper. Whisper loads lazily on the first audio transcription and may download model files then; choose `WHISPER_MODEL=tiny` for a lighter CPU model. Default: base / CPU / int8.

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
- Audio is saved on-device and, when configured and signed in, in the existing private Supabase bucket. Text is sent to your configured backend; optional AI runs at `OLLAMA_URL`. PDF generation is on the backend and does not persist documents there.
- PDF export embeds the Bitstream Vera fonts bundled with ReportLab. Unsupported characters are rejected with a readable error rather than rendered as boxes. Use English text for reliable PDF output; Indic script export is not supported by this font.
- The FastAPI service is intended for **local development** and binds to loopback. It has no server authentication or rate limiting. Before internet deployment, add authenticated endpoints, request/rate limits, HTTPS, and an explicit `CORS_ORIGINS` allowlist. Browser sign-in alone does not protect API endpoints.

## API and validation

- `GET /health` — service status (does not preload Whisper).
- `POST /transcribe` — multipart `file`, returns transcript and segments.
- `POST /minutes` — JSON `transcript`, `title`, `date`, `attendees`; returns editable MOM.
- `POST /minutes/pdf` — reviewed MOM JSON; returns PDF bytes.

```powershell
npm run build
node --test tests/speechRecognition.test.js
python -m pip install httpx
python -m unittest discover -s backend -p "test_*.py" -v
```

Tests cover grounded extraction, metadata preservation, missing assignments, input validation, AI fallback, PDF export, and speech result lifecycle. Live microphone permissions, Google OAuth, actual Whisper inference, and optional Ollama inference require local integration testing.
