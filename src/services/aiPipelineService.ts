import { supabase } from '../supabase/client';
import { AIPipelineResponse, MeetingRecording, MeetingRecordingStatus } from '../types';
import {
  resolveOrUpdateCustomer,
  createTemporaryCustomer,
  isTemporaryCustomer
} from './customerService';

export interface ProcessCallOptions {
  recordingId?: string;
  audioUrl?: string;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Stale lock recovery & Due date sanitization constants & helpers
// ---------------------------------------------------------------------------

/**
 * Maximum time (in milliseconds) a recording can remain in an in-progress state
 * ('processing', 'transcribing', 'customer_resolving', 'analyzing') before being
 * considered orphaned/stale (e.g. due to application crash, power loss, or network drop).
 * 
 * Chosen timeout: 10 minutes (600,000 ms).
 * This provides generous headroom for large audio files to transcribe even on slow CPUs,
 * while ensuring stuck locks are safely recovered and made eligible for user retry.
 */
export const STALE_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

const IN_PROGRESS_STATUS_LIST = [
  'processing',
  'transcribing',
  'analyzing',
  'customer_resolving'
];

/**
 * Checks whether a recording is in an in-progress state and has exceeded
 * the stale processing timeout based on its updated_at (or created_at) timestamp.
 */
export function isRecordingStale(
  recording: { status: string; updated_at?: string | null; created_at?: string | null },
  timeoutMs: number = STALE_PROCESSING_TIMEOUT_MS
): boolean {
  if (!IN_PROGRESS_STATUS_LIST.includes(recording.status)) {
    return false;
  }
  const timestamp = recording.updated_at || recording.created_at;
  if (!timestamp) return false;
  const lastUpdate = new Date(timestamp).getTime();
  if (isNaN(lastUpdate)) return false;
  return Date.now() - lastUpdate > timeoutMs;
}

/**
 * Scans for orphaned/stale in-progress recordings on application startup.
 * Transitions stuck records to 'failed' with descriptive status so the user can
 * retry them. Race-condition safe: uses atomic conditional matching on (id, status, updated_at).
 */
export async function recoverStaleRecordings(timeoutMs: number = STALE_PROCESSING_TIMEOUT_MS): Promise<number> {
  try {
    const cutoffIso = new Date(Date.now() - timeoutMs).toISOString();

    const { data: staleList, error } = await supabase
      .from('meeting_recordings')
      .select('id, status, updated_at')
      .in('status', IN_PROGRESS_STATUS_LIST)
      .lt('updated_at', cutoffIso);

    if (error || !staleList || staleList.length === 0) {
      return 0;
    }

    let recoveredCount = 0;
    for (const rec of staleList) {
      const { data: updated } = await supabase
        .from('meeting_recordings')
        .update({
          status: 'failed',
          last_error: `Processing timed out after ${Math.round(timeoutMs / 60000)} minutes. You can retry processing.`,
          updated_at: new Date().toISOString()
        })
        .eq('id', rec.id)
        .eq('status', rec.status)
        .eq('updated_at', rec.updated_at)
        .select('id');

      if (updated && updated.length > 0) {
        recoveredCount++;
      }
    }

    if (recoveredCount > 0) {
      console.log(`[StaleRecovery] Recovered ${recoveredCount} orphaned recording(s).`);
    }
    return recoveredCount;
  } catch (err) {
    console.error('[StaleRecovery] Failed to recover stale recordings:', err);
    return 0;
  }
}

/**
 * Defensively sanitize and validate an AI-generated task due date.
 * Requirements:
 * - Verify the value is actually a string before calling string methods.
 * - Handle null and undefined.
 * - Handle empty or whitespace-only strings.
 * - Handle the string "null" (case-insensitive).
 * - Do not crash if the AI produces a number, boolean, array, or object.
 * - Preserve valid date strings that are not in the past relative to referenceDate (start of today).
 * - Do not change the existing expected task behavior.
 */
export function sanitizeDueDate(dueDate: unknown, referenceDate: Date = new Date()): string | null {
  if (dueDate === null || dueDate === undefined) {
    return null;
  }
  if (typeof dueDate !== 'string') {
    return null;
  }
  const trimmed = dueDate.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null;
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  if (parsed < today) {
    return null;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Core processing helpers
// ---------------------------------------------------------------------------

/**
 * Update meeting_recordings.status (and optionally extra fields).
 * Used throughout the pipeline to expose granular progress states.
 */
async function setRecordingStatus(
  recordingId: string,
  status: MeetingRecordingStatus | string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await supabase
    .from('meeting_recordings')
    .update({ status, last_error: null, updated_at: new Date().toISOString(), ...extra })
    .eq('id', recordingId);
}

// ---------------------------------------------------------------------------
// processAndSaveCall — the single CRM write function
// ---------------------------------------------------------------------------

/**
 * Run the AI pipeline on an audio file and write all CRM records.
 *
 * @param audioPath   Local filesystem path to audio.
 * @param customerId  Authoritative customer UUID.
 *                    MUST be pre-resolved before calling this function.
 *                    Pass null ONLY to let the pipeline skip CRM writes (used internally).
 * @param options     Optional recordingId / audioUrl for idempotency.
 *
 * RULE: This function always uses the provided customerId for ALL CRM records
 * (call, call_summaries, tasks, deals). Customer resolution happens BEFORE
 * this function is called. This ensures no data mixing.
 */
export const processAndSaveCall = async (
  audioPath: string,
  customerId: string,
  options: ProcessCallOptions = {}
) => {
  try {
    // 1. Get logged in user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      throw new Error('You must be logged in to process calls.');
    }
    const ownerId = session.user.id;

    // 2. Remove any prior call created for this recording so reprocessing is idempotent
    if (options.recordingId) {
      await supabase.from('calls').delete().eq('recording_id', options.recordingId);
    }

    // 3. Insert preliminary call record
    const { data: callData, error: callError } = await supabase
      .from('calls')
      .insert({
        customer_id: customerId,
        owner_id: ownerId,
        audio_url: options.audioUrl || audioPath,
        recording_id: options.recordingId || null,
        status: 'processing',
      })
      .select()
      .single();

    if (callError) {
      throw new Error(`Failed to create call record: ${callError.message}`);
    }

    const callId = callData.id;

    // 4. Trigger the local AI pipeline via Electron IPC (window.ai)
    if (!window.ai || !window.ai.processCall) {
      throw new Error('window.ai bridge is unavailable. Please run the app in Electron desktop mode.');
    }

    // Pass customer_id so the AI skips customer name extraction (it's already resolved)
    const res: AIPipelineResponse = await window.ai.processCall(audioPath, customerId);

    if (res.status !== 'SUCCESS') {
      await supabase
        .from('calls')
        .update({ status: 'done', raw_transcript: { error: res.metadata?.errors } })
        .eq('id', callId);

      throw new Error(`AI processing failed: ${res.metadata?.errors?.join(', ') || res.status}`);
    }

    // 5. Update the call record with the final results
    const { error: updateCallError } = await supabase
      .from('calls')
      .update({
        raw_transcript: res.transcript,
        clean_transcript: res.clean_transcript || null,
        duration_seconds: Math.round(res.metadata.audio_duration_seconds),
        status: 'done'
      })
      .eq('id', callId);

    if (updateCallError) {
      throw new Error(`Failed to update call record: ${updateCallError.message}`);
    }

    // 6. Insert Call Summary
    const productDiscussed = res.analysis.products_discussed && res.analysis.products_discussed.length > 0
      ? res.analysis.products_discussed[0]
      : null;

    const { error: summaryError } = await supabase
      .from('call_summaries')
      .insert({
        call_id: callId,
        summary_text: res.analysis.summary,
        product: productDiscussed,
        sentiment: res.analysis.sentiment
      });

    if (summaryError) {
      console.error('Failed to create call summary:', summaryError);
    }

    // 7. Insert Tasks from Action Items — all use the SAME resolved customerId
    if (res.analysis.action_items && res.analysis.action_items.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const taskInserts = res.analysis.action_items.map(item => {
        const cleanDueDate = sanitizeDueDate(item.due_date, today);

        console.log('[DATABASE INSERT]', {
          title: item.title,
          description: item.description,
          detailed_description: item.detailed_description,
          due_date: cleanDueDate
        });

        return {
          customer_id: customerId, // Always the same resolved customer
          call_id: callId,
          owner_id: ownerId,
          description: item.description,
          due_date: cleanDueDate,
          status: 'pending'
        };
      });

      console.log('[DATABASE INSERT] Inserting tasks payload:', taskInserts);

      const { error: tasksError } = await supabase
        .from('tasks')
        .insert(taskInserts);

      if (tasksError) {
        console.error('Failed to create tasks from action items:', tasksError);
      } else {
        console.log('[DATABASE INSERT] ✓ Successfully inserted tasks into Supabase.');
      }
    }

    return res;

  } catch (error: any) {
    console.error('Error processing and saving call:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// processRecording — handles existing manual recording workflow
// ---------------------------------------------------------------------------

/**
 * Transcribe and summarize a meeting recording.
 * This is used from RecordingsPage when the user clicks Process/Retry.
 *
 * - If recording.customer_id is set: use it directly (manual wins).
 * - If not: AI extracts name → deterministic resolution → proceed.
 *
 * Downloads the audio from Supabase Storage, then delegates to processAndSaveCall.
 */
export const processRecording = async (recording: MeetingRecording) => {
  if (!window.electronAPI?.downloadToTemp) {
    throw new Error('Processing recordings requires the Electron desktop app.');
  }
  if (!window.ai?.processCall) {
    throw new Error('The local AI service is unavailable. Make sure Ollama and the AI service are running.');
  }

  const { data: publicUrlData } = supabase.storage
    .from('meeting-recordings')
    .getPublicUrl(recording.storage_path);
  const audioUrl = publicUrlData?.publicUrl;
  if (!audioUrl) {
    throw new Error('Could not resolve the recording audio URL.');
  }

  await setRecordingStatus(recording.id, 'processing');

  try {
    const localPath = await window.electronAPI.downloadToTemp(audioUrl, `${recording.id}.webm`);

    // Determine whether customer was manually supplied or if this is a temporary customer
    let customerId = recording.customer_id;
    let isManual = false;

    if (customerId) {
      const { data: cust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      if (cust && !isTemporaryCustomer(cust)) {
        isManual = true;
      }
    }

    // ── PATH A: MANUAL CUSTOMER SUPPLIED ──────────────────────────────────────
    // HARD GUARANTEE:
    // If the salesperson manually selected an existing customer from the extension:
    // - AI must NOT extract a customer identity
    // - Customer matching must NOT run
    // - Customer creation must NOT run
    // - Supplied customer_id remains authoritative
    // - All downstream call/transcript/CRM records use that customer_id
    if (isManual && customerId) {
      await setRecordingStatus(recording.id, 'transcribing');
      const res = await processAndSaveCall(localPath, customerId, {
        recordingId: recording.id,
        audioUrl
      });
      await setRecordingStatus(recording.id, 'processed');
      return res;
    }

    // ── PATH B: NO MANUAL CUSTOMER (TEMPORARY CUSTOMER WORKFLOW) ─────────────
    // Step 1: Ensure temporary customer exists BEFORE audio processing begins.
    // If one does not exist yet (e.g. uploaded without pre-creation), create it now!
    if (!customerId) {
      const shortId = recording.id.slice(0, 8);
      const tempCust = await createTemporaryCustomer(shortId);
      customerId = tempCust.id;
      await supabase
        .from('meeting_recordings')
        .update({ customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('id', recording.id);
      recording.customer_id = customerId;
    }

    await setRecordingStatus(recording.id, 'transcribing');

    // Step 2: Run AI pipeline without customer_id so Ollama extracts customer information
    const res: AIPipelineResponse = await window.ai.processCall(localPath, undefined);

    if (res.status !== 'SUCCESS') {
      throw new Error(`AI processing failed: ${res.metadata?.errors?.join(', ') || res.status}`);
    }

    await setRecordingStatus(recording.id, 'customer_resolving', {
      ai_customer_name: res.extracted_customer_name || null
    });

    // Step 3: Resolve or update customer using deterministic matching
    const extractedInfo = res.extracted_customer_info || { name: res.extracted_customer_name };
    const resolution = await resolveOrUpdateCustomer(customerId, extractedInfo, recording.id);

    if (resolution.type === 'ambiguous') {
      // Ambiguous: Cannot safely identify. Keep temporary customer.
      await setRecordingStatus(recording.id, 'needs_customer', {
        ai_customer_name: resolution.extractedName,
        candidate_customer_ids: resolution.candidateIds
      });
      // Save preliminary CRM call record to temporary customer so transcript is preserved
      await _saveProcessedCall(res, localPath, customerId, recording.id, audioUrl);
      throw new Error(
        `Customer assignment required. The transcript mentions "${resolution.extractedName}" but multiple customers match. Please assign a customer manually.`
      );
    }

    if (resolution.type === 'no_name') {
      // No customer info found in transcript: keep temporary customer and prompt for manual assignment
      await setRecordingStatus(recording.id, 'needs_customer');
      await _saveProcessedCall(res, localPath, customerId, recording.id, audioUrl);
      throw new Error('Could not identify a customer from the transcript. Please assign a customer manually.');
    }

    // Resolved! (Either matched_existing or updated_temporary)
    const finalCustomerId = resolution.customerId;

    // Update the recording customer_id
    await supabase
      .from('meeting_recordings')
      .update({ customer_id: finalCustomerId, updated_at: new Date().toISOString() })
      .eq('id', recording.id);

    // Save CRM records under finalCustomerId
    await _saveProcessedCall(res, localPath, finalCustomerId, recording.id, audioUrl);

    await setRecordingStatus(recording.id, 'processed');
    return res;

  } catch (error: any) {
    // Don't overwrite needs_customer with failed — re-fetch current status from DB
    const { data: current } = await supabase
      .from('meeting_recordings')
      .select('status')
      .eq('id', recording.id)
      .single();
    if (current?.status !== 'needs_customer') {
      await setRecordingStatus(recording.id, 'failed', { last_error: error?.message || 'Processing failed' });
    }
    throw error;
  }
};

// ---------------------------------------------------------------------------
// autoProcessRecording — called from the realtime listener for extension uploads
// ---------------------------------------------------------------------------

/**
 * Automatically process a newly uploaded recording.
 * Called when the realtime subscription detects a meeting_recordings row
 * with status='uploaded'. Implements idempotency to prevent duplicate processing.
 *
 * This is the SINGLE pipeline for both browser recordings and uploaded audio files.
 */
export const autoProcessRecording = async (recording: MeetingRecording): Promise<void> => {
  // Idempotency guard — only process if status is exactly 'uploaded'
  // Re-fetch from DB to avoid stale status from realtime payload
  const { data: fresh, error: fetchErr } = await supabase
    .from('meeting_recordings')
    .select('*')
    .eq('id', recording.id)
    .single();

  if (fetchErr || !fresh) {
    console.error('[AutoProcess] Could not fetch recording:', recording.id);
    return;
  }

  // 1. Normal path: newly uploaded recording
  if (fresh.status === 'uploaded') {
    // Atomically claim the recording by transitioning to 'processing'.
    // IMPORTANT: Supabase UPDATE with a condition that matches 0 rows returns
    //   { data: [], error: null } — NOT an error.
    // We must check that exactly one row was updated to know we won the claim.
    const { data: claimData, error: claimErr } = await supabase
      .from('meeting_recordings')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', recording.id)
      .eq('status', 'uploaded') // Conditional — only matches if still 'uploaded'
      .select('id');

    if (claimErr || !claimData || claimData.length === 0) {
      console.log(`[AutoProcess] Could not claim ${recording.id} — already claimed by another instance or status changed.`);
      return;
    }

    console.log(`[AutoProcess] Starting automatic processing for recording ${recording.id}`);

    try {
      await processRecording(fresh as MeetingRecording);
      console.log(`[AutoProcess] ✓ Completed processing for recording ${recording.id}`);
    } catch (err: any) {
      console.error(`[AutoProcess] ✗ Failed processing for recording ${recording.id}:`, err.message);
      // Status is already updated by processRecording's catch block
    }
    return;
  }

  // 2. Stale processing recovery path:
  // If the recording was left in-progress beyond STALE_PROCESSING_TIMEOUT_MS
  // (e.g. application crash or termination), transition it to 'failed' so it
  // becomes eligible for manual retry by the user, without auto-retrying in a loop.
  if (isRecordingStale(fresh)) {
    console.warn(`[AutoProcess] Detected stale in-progress recording ${recording.id} (status: '${fresh.status}', last update: ${fresh.updated_at}). Transitioning to 'failed' for manual retry.`);

    // Atomic claim of stale record: match exact status and updated_at to prevent races
    const { data: recoverData } = await supabase
      .from('meeting_recordings')
      .update({
        status: 'failed',
        last_error: `Previous processing timed out or was interrupted (status was '${fresh.status}'). Click Retry to reprocess.`,
        updated_at: new Date().toISOString()
      })
      .eq('id', recording.id)
      .eq('status', fresh.status)
      .eq('updated_at', fresh.updated_at)
      .select('id');

    if (recoverData && recoverData.length > 0) {
      console.log(`[AutoProcess] ✓ Safely recovered stale recording ${recording.id} — ready for user retry.`);
    }
    return;
  }

  console.log(`[AutoProcess] Skipping ${recording.id} — status is '${fresh.status}' (not 'uploaded' and not stale)`);
};

// ---------------------------------------------------------------------------
// Internal helper — save CRM records from an already-run AI result
// ---------------------------------------------------------------------------

/**
 * Write CRM records from an already-completed AI pipeline result.
 * Used to avoid re-running Whisper/Ollama when we already have the result
 * but needed to resolve customer first.
 */
async function _saveProcessedCall(
  res: AIPipelineResponse,
  audioPath: string,
  customerId: string,
  recordingId: string,
  audioUrl: string
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const ownerId = session.user.id;

  // Idempotency: remove any prior call for this recording
  await supabase.from('calls').delete().eq('recording_id', recordingId);

  const { data: callData, error: callError } = await supabase
    .from('calls')
    .insert({
      customer_id: customerId,
      owner_id: ownerId,
      audio_url: audioUrl || audioPath,
      recording_id: recordingId,
      status: 'done',
      raw_transcript: res.transcript,
      clean_transcript: res.clean_transcript || null,
      duration_seconds: Math.round(res.metadata.audio_duration_seconds)
    })
    .select()
    .single();

  if (callError || !callData) {
    throw new Error(`Failed to create call record: ${callError?.message}`);
  }

  const callId = callData.id;

  const productDiscussed = res.analysis.products_discussed?.[0] || null;

  await supabase.from('call_summaries').insert({
    call_id: callId,
    summary_text: res.analysis.summary,
    product: productDiscussed,
    sentiment: res.analysis.sentiment
  });

  if (res.analysis.action_items?.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskInserts = res.analysis.action_items.map(item => {
      const cleanDueDate = sanitizeDueDate(item.due_date, today);
      return {
        customer_id: customerId,
        call_id: callId,
        owner_id: ownerId,
        description: item.description,
        due_date: cleanDueDate,
        status: 'pending'
      };
    });
    await supabase.from('tasks').insert(taskInserts);
  }
}
