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

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
