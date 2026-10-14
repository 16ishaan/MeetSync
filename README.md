# MeetSync

MeetSync is a polished meeting-to-MOM landing page and product concept built from the provided PRD and TRD.

## Environment setup

Create a `.env` file in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then enable Google sign-in in Supabase Auth and add these redirect URLs:

- http://localhost:5173
- http://localhost:5173/
- http://127.0.0.1:5173

Run `supabase/recordings.sql` in the Supabase SQL editor to create the private
recordings bucket, metadata table, and row-level security policies used by the
in-browser recorder.

## Local transcription

MeetSync uses the open-source [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
model through a small local FastAPI service. In a second terminal:

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn transcription_server:app --reload --port 8000
```

The first transcription downloads the `base` Whisper model. Set
`WHISPER_MODEL=tiny` for a lighter CPU model or `WHISPER_DEVICE=cuda` and
`WHISPER_COMPUTE_TYPE=float16` for an NVIDIA GPU.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
