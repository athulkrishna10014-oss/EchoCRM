# EchoCRM

A local-first CRM for real-estate sales teams: capture meetings, transcribe and
summarize them with an offline AI pipeline, and manage customers, tasks and
deals in a desktop app backed by Supabase.

EchoCRM is made of **three runtime components** that work together:

| Component | Path | What it does |
|---|---|---|
| Desktop app | `src/`, `main.js`, `preload.js` | Electron + React + TypeScript + Tailwind client (auth, dashboard, customers, workspace, deal pipeline, search, export, notifications, settings). |
| AI service | `ai/` | Local Python FastAPI service: `faster-whisper` transcription + LLaMA 3.2 3B summarization via Ollama. Started automatically by Electron. |
| Chrome extension | `echocrm-extension/` | Captures Google Meet / Zoom / Teams tab audio, segments speakers, and uploads recordings to Supabase. |

> Everything runs offline except Supabase (data sync) and the optional in-process
> LLM download. No audio leaves the machine for AI processing.

---

## Requirements

- **Windows** (Windows 10 / 11 64-bit)
- **Node.js** 18+ and npm (if building from source)
- **Python 3.10+** (for local AI service)
- **Ollama** — [ollama.com](https://ollama.com)
- **llama3.2:3b** model
- Required environment configuration (`.env` based on `.env.example`)
- **Google Chrome** (optional, for meeting recording extension)

---

## Development

```powershell
# Install project dependencies
npm.cmd install

# Install AI service Python dependencies
pip install -r requirements.txt

# Start Vite dev server + launch Electron + start local AI service
npm.cmd run dev
```

---

## Production Build

To compile TypeScript and bundle the React frontend into `dist/`:

```powershell
npm.cmd run build
```

---

## Windows Packaging

To generate the production Windows installer and standalone executable:

```powershell
npm.cmd run electron:build
```

Packaged distribution outputs in `release/`:
- **Windows Installer**: `release/EchoCRM Setup 1.0.0.exe` (NSIS installer with custom directory selection)
- **Unpacked Standalone**: `release/win-unpacked/` (Contains `EchoCRM.exe` and unpacked AI backend)

---

## AI Setup

EchoCRM uses a 100% offline, local AI processing pipeline:
1. **Ollama Service**:
   - Install Ollama from [ollama.com](https://ollama.com)
   - Pull the required model:
     ```powershell
     ollama pull llama3.2:3b
     ```
   - Ensure Ollama is running locally on `http://127.0.0.1:11434` (`ollama serve`).
2. **Speech-to-Text (Whisper)**:
   - Powered by `faster-whisper` (`base` model by default).
   - Weights are cached locally on first run; no cloud audio transmission.
3. **AI Service Lifecycle**:
   - In both development and packaged production builds, Electron automatically spawns and manages `ai/server.py` on `http://127.0.0.1:8000`.
   - On application shutdown, Electron cleanly terminates the Python AI process.

---

## Environment Configuration

EchoCRM requires connection to a Supabase backend for CRM data persistence.

1. Copy the example configuration template:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Populate `.env` with your project's publishable credentials:
   ```dotenv
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
   ```
3. **Security Notes**:
   - `.env` is ignored by Git and will NOT be packaged into client distributions.
   - Never place secret keys (e.g. Supabase `service_role` key) into client configurations.
   - For the Chrome extension, configure credentials securely via the extension options/settings.

## 5. Supabase backend

The schema lives in `supabase/migrations/`. Apply migrations to the linked project
with the Supabase CLI:

```powershell
npx supabase login
npx supabase db push
```

Tables: `users`, `customers`, `calls`, `call_summaries`, `tasks`, `deals`,
`meeting_recordings` — all protected by row-level security scoped to the owning
user. Realtime is enabled for live sync across the app.

## 6. Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `echocrm-extension/` folder.
4. Open the extension popup and **sign in with the same EchoCRM account** used in
   the desktop app (required for uploads — the storage/table policies are
   owner-scoped).
5. Join a Google Meet / Zoom / Teams meeting in Chrome and click **Start Recording**.
   When you stop, the recording uploads to Supabase automatically.

## 7. Process a meeting recording

In the desktop app:

1. Open **Recordings** (or a customer's **Calls** tab).
2. Assign the recording to a customer.
3. Click **Process** — the audio is downloaded locally, transcribed by Whisper,
   and summarized by the local LLM. The customer's overview, calls, tasks and
   deals populate automatically.

---

## How it works

```
Chrome extension ──upload──▶ Supabase Storage + meeting_recordings
                                        │
Desktop app (Electron/React) ──download─┘
        │ window.ai.processCall
        ▼
Python FastAPI (ai/)  ──▶ faster-whisper ──▶ transcript cleaning ──▶ LLaMA 3.2 (Ollama)
        │                                                              │
        └──────────────── structured JSON ◀────────────────────────────┘
                                        │
                     calls / call_summaries / tasks / deals
```

- The **verbatim** transcript is stored in `calls.raw_transcript` (user-facing).
- A **cleaned** transcript (fillers/disfluencies removed) is stored in
  `calls.clean_transcript` and is the only version sent to the LLM.

See [`ai/README.md`](ai/README.md) for AI-service details and
[`BENCHMARKS.md`](BENCHMARKS.md) for measured processing times.

---

## Features

- Auth, dashboard, customer CRUD, per-customer workspace (Overview / Calls / Tasks / Deals)
- Real-time sync via Supabase Realtime
- Local AI: transcription, summary, sentiment, deal stage, action items → tasks/deals
- Meeting-recording capture (Chrome extension) with one-click processing
- Deal pipeline (kanban) grouped by stage with per-stage totals
- Transcript keyword search and phone-number lookup
- Export a customer's history as CSV or PDF
- Desktop notifications for due/overdue tasks
- Dashboard charts (deals by stage, calls over time)
- Manual correction of AI-generated summaries / deal stages
- Settings page (profile, password, notification preference)

---

## Project layout

```
EchoCRM/
├── ai/                     # Python FastAPI AI service
│   ├── analysis/           # prompts, validator, transcript cleaner, LLM providers
│   ├── pipeline/           # orchestrator: audio → transcript → clean → LLM
│   ├── transcription/      # faster-whisper wrapper
│   ├── config/             # settings
│   └── server.py           # FastAPI app (started by Electron)
├── echocrm-extension/      # Chrome MV3 extension (capture + upload)
├── src/                    # React + TypeScript desktop UI
├── supabase/migrations/    # SQL schema + RLS policies
├── main.js / preload.js    # Electron main process + IPC bridge
├── test/                   # sample audio, pipeline/cleaner/benchmark scripts
└── requirements.txt        # Python dependencies
```

---

## Troubleshooting

- **"window.ai bridge is unavailable"** — you are running the UI in a browser
  instead of Electron. Use `npm run dev` (Electron) for AI features.
- **AI service offline** — ensure `ollama serve` is running and
  `ollama pull llama3.2:3b` completed; check the Electron console for
  `[AI-Service Error]`.
- **Extension uploads fail with 401/403** — sign in via the extension popup; the
  storage and `meeting_recordings` policies require an authenticated owner.
- **Recordings missing after RLS change** — rows created before owner-based RLS
  have `owner_id = NULL`; re-upload or backfill the column.

---

*Built with Llama 3.2 (Meta Llama 3.2 Community License).*
