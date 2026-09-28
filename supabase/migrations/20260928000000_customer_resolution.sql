-- Customer resolution state for automatically processed recordings.
-- The status column is already TEXT (not enum), so new status values work immediately.
-- We only add a column to store candidate customer IDs when the AI resolves ambiguity.

-- Stores the extracted candidate customer name from the transcript (if no manual customer was supplied)
ALTER TABLE public.meeting_recordings
    ADD COLUMN IF NOT EXISTS ai_customer_name TEXT;

-- Stores JSON array of candidate customer_ids when the name is ambiguous
-- e.g. ["uuid-rahul-a", "uuid-rahul-m"]
ALTER TABLE public.meeting_recordings
    ADD COLUMN IF NOT EXISTS candidate_customer_ids JSONB;

-- Valid status values (informational comment — column is TEXT, not enum):
-- local_saved   → just saved in IndexedDB
-- uploading     → upload in progress to Supabase Storage
-- uploaded      → uploaded, pending automatic processing
-- processing    → Electron picked it up, pipeline starting
-- transcribing  → Whisper running
-- analyzing     → Ollama analysis running
-- customer_resolving → resolving which customer this call belongs to
-- needs_customer → AI could not safely determine customer; manual assignment required
-- processed     → fully completed
-- failed        → pipeline error

-- Grant privileges for new columns (same pattern as existing migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_recordings TO authenticated, service_role;
