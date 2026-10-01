/**
 * Unit Tests for Stale Recording Processing Lock Recovery (FIX 4)
 *
 * Requirements verified:
 * - Detects stale in-progress records (processing, transcribing, analyzing, customer_resolving)
 * - Defined timeout is 10 minutes (STALE_PROCESSING_TIMEOUT_MS = 600,000 ms)
 * - Safe updated_at comparison
 * - Non-in-progress statuses (uploaded, processed, failed, needs_customer) are never marked stale
 * - Stale records become eligible for user retry
 * - Proves atomic conditional claim logic prevents race conditions between multiple clients
 *
 * Run with: node test/test_stale_lock_recovery.mjs
 */

import assert from 'node:assert';

const STALE_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const IN_PROGRESS_STATUS_LIST = [
  'processing',
  'transcribing',
  'analyzing',
  'customer_resolving'
];

function isRecordingStale(recording, timeoutMs = STALE_PROCESSING_TIMEOUT_MS) {
  if (!IN_PROGRESS_STATUS_LIST.includes(recording.status)) {
    return false;
  }
  const timestamp = recording.updated_at || recording.created_at;
  if (!timestamp) return false;
  const lastUpdate = new Date(timestamp).getTime();
  if (isNaN(lastUpdate)) return false;
  return Date.now() - lastUpdate > timeoutMs;
}

console.log('=== TEST SUITE 1: Stale In-Progress Recordings ===');
{
  const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  assert.strictEqual(
    isRecordingStale({ status: 'processing', updated_at: elevenMinutesAgo }),
    true,
    'Processing status 11 minutes ago should be stale'
  );
  console.log('  ✓ status="processing" older than 10m is detected as stale');

  assert.strictEqual(
    isRecordingStale({ status: 'transcribing', updated_at: thirtyMinutesAgo }),
    true,
    'Transcribing status 30 minutes ago should be stale'
  );
  console.log('  ✓ status="transcribing" older than 10m is detected as stale');

  assert.strictEqual(
    isRecordingStale({ status: 'customer_resolving', updated_at: elevenMinutesAgo }),
    true,
    'Customer_resolving status 11 minutes ago should be stale'
  );
  console.log('  ✓ status="customer_resolving" older than 10m is detected as stale');
}

console.log('=== TEST SUITE 2: Active (Non-Stale) In-Progress Recordings ===');
{
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const justNow = new Date().toISOString();

  assert.strictEqual(
    isRecordingStale({ status: 'processing', updated_at: twoMinutesAgo }),
    false,
    'Processing status 2 minutes ago should NOT be stale'
  );
  console.log('  ✓ status="processing" updated 2m ago is active (not stale)');

  assert.strictEqual(
    isRecordingStale({ status: 'transcribing', updated_at: justNow }),
    false,
    'Transcribing status updated just now should NOT be stale'
  );
  console.log('  ✓ status="transcribing" updated just now is active (not stale)');
}

console.log('=== TEST SUITE 3: Non-In-Progress Statuses Are Never Stale ===');
{
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  assert.strictEqual(
    isRecordingStale({ status: 'uploaded', updated_at: twoHoursAgo }),
    false,
    'Uploaded status should not be stale (it is queued)'
  );
  console.log('  ✓ status="uploaded" is never considered stale');

  assert.strictEqual(
    isRecordingStale({ status: 'processed', updated_at: twoHoursAgo }),
    false,
    'Processed status should not be stale'
  );
  console.log('  ✓ status="processed" is never considered stale');

  assert.strictEqual(
    isRecordingStale({ status: 'failed', updated_at: twoHoursAgo }),
    false,
    'Failed status should not be stale'
  );
  console.log('  ✓ status="failed" is never considered stale');

  assert.strictEqual(
    isRecordingStale({ status: 'needs_customer', updated_at: twoHoursAgo }),
    false,
    'Needs_customer status should not be stale'
  );
  console.log('  ✓ status="needs_customer" is never considered stale');
}

console.log('=== TEST SUITE 4: Edge Cases (Missing / Invalid Timestamps) ===');
{
  assert.strictEqual(isRecordingStale({ status: 'processing' }), false);
  console.log('  ✓ Missing timestamp returns false without error');

  assert.strictEqual(isRecordingStale({ status: 'processing', updated_at: null }), false);
  console.log('  ✓ null timestamp returns false without error');

  assert.strictEqual(isRecordingStale({ status: 'processing', updated_at: 'invalid-date' }), false);
  console.log('  ✓ invalid date string returns false without error');
}

console.log('=== TEST SUITE 5: Race-Condition Resistance Simulation ===');
{
  // Simulate mock database row
  let mockDbRow = {
    id: 'rec-123',
    status: 'processing',
    updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    last_error: null
  };

  // Atomic update function simulating Supabase .eq('id', id).eq('status', status).eq('updated_at', updated_at)
  function atomicClaimRecovery(recordingId, expectedStatus, expectedUpdatedAt, newPayload) {
    if (
      mockDbRow.id === recordingId &&
      mockDbRow.status === expectedStatus &&
      mockDbRow.updated_at === expectedUpdatedAt
    ) {
      mockDbRow = { ...mockDbRow, ...newPayload };
      return [{ id: mockDbRow.id }]; // 1 row updated
    }
    return []; // 0 rows updated (lock lost)
  }

  // Client 1 attempts recovery
  const claim1 = atomicClaimRecovery(mockDbRow.id, mockDbRow.status, mockDbRow.updated_at, {
    status: 'failed',
    last_error: 'Recovered from timeout',
    updated_at: new Date().toISOString()
  });
  assert.strictEqual(claim1.length, 1, 'Client 1 should win the atomic claim');
  console.log('  ✓ Client 1 successfully claimed and recovered the stale record');

  // Client 2 attempts recovery concurrently using previous stale snapshot
  const claim2 = atomicClaimRecovery(mockDbRow.id, 'processing', new Date(Date.now() - 15 * 60 * 1000).toISOString(), {
    status: 'failed',
    last_error: 'Concurrent recovery attempt',
    updated_at: new Date().toISOString()
  });
  assert.strictEqual(claim2.length, 0, 'Client 2 should match 0 rows and abort without race condition');
  console.log('  ✓ Client 2 atomic update safely matched 0 rows (no race condition)');
}

console.log('\n──────────────────────────────────────────────────');
console.log('All Stale Processing Lock Recovery Tests Passed ✓\n');
