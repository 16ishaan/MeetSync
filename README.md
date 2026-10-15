# MeetSync

MeetSync is an AI-powered meeting intelligence application that captures audio and transforms raw conversations into structured Minutes of Meeting (MoM), categorized decisions, and actionable task items with PDF export.

---

## Key Features

1. **In-Browser Audio Recording**
   - Seamless dual-capture of microphone and system/browser tab audio via `MediaRecorder` & Web Audio API.
   - Live timer, pause, resume, waveforms, and instant browser playback.
   - Dual-persistence: saved instantly to client-side IndexedDB for zero data loss, with optional auto-sync to Supabase Cloud Storage.

2. **Web Speech Intelligence**
   - Real-time in-browser speech-to-text recognition using native Speech Recognition.
   - Live rolling interim transcription without needing server processing.
   - One-click handoff to structured MoM generation.

3. **Audio File Upload**
   - Drag-and-drop or file selection for existing audio files (`.mp3`, `.wav`, `.webm`, `.ogg`, `.m4a`).
   - Client-side validation and quick upload.

4. **Transcription & AI MoM Generation**
   - Local or remote transcription powered by `faster-whisper` with Voice Activity Detection (VAD).
   - Multi-provider AI support (OpenAI GPT-4o-mini, Anthropic Claude, Google Gemini) to produce structured Minutes of Meeting.
   - Extracts:
     - Executive Summary & Overview
     - Key Discussion Points
     - Finalized Decisions (distinguished from discussion)
     - Action Items with assignees, priorities (high/medium/low), deadlines, and verbatim source context quotes
     - Unresolved Questions

5. **Action Item Tracker**
   - Interactive checkbox completion toggle.
   - Color-coded priority badges and assignee assignment.
   - Real-time persistence and filtering.

6. **Branded PDF Export**
   - One-click publication-ready PDF generator using jsPDF with customized dark/signal-purple brand styling and page numbering.

7. **Meeting History & Saved Recordings**
   - Full search and filtering across meetings and transcripts.
   - Local device storage fallback ensures 100% functionality even without cloud credentials.

---

## Quick Start

### 1. Frontend Setup

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173).

To build for production:

```bash
npm run build
```

---

### 2. Backend Setup (Transcription & AI MoM Service)

The backend is a FastAPI service that performs Whisper transcription and MoM extraction.

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:
   - **macOS / Linux:**
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```
   - **Windows:**
     ```powershell
     python -m venv .venv
     .venv\Scripts\Activate.ps1
     ```

3. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure AI provider environment variables (optional for transcription, required for AI MoM):
   ```bash
   # Choose provider: openai | anthropic | google
   export AI_PROVIDER="openai"
   export AI_API_KEY="sk-..."
   export AI_MODEL="gpt-4o-mini"
   ```

5. Run the server:
   ```bash
   uvicorn transcription_server:app --reload --port 8000
   ```

---

### 3. Supabase Cloud Setup (Optional)

MeetSync works fully locally using IndexedDB. To enable cloud synchronization and Google OAuth:

1. Create a `.env` file in the project root:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_TRANSCRIPTION_API_URL=http://127.0.0.1:8000
   ```

2. Run the SQL migrations in the Supabase SQL Editor:
   - `supabase/recordings.sql`
   - `supabase/meetings.sql`

3. In Supabase Auth -> URL Configuration, add:
   - `http://localhost:5173`
   - `http://localhost:5173/`
   - `http://127.0.0.1:5173`
