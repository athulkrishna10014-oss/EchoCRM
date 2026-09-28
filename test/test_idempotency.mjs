/**
 * Idempotency test for autoProcessRecording() and RealtimeSyncContext trigger.
 *
 * This tests the atomic claim mechanism: when the same recording_id receives
 * multiple INSERT/UPDATE realtime events with status='uploaded', only ONE
 * processing run must succeed. All others must be skipped.
 *
 * Run with: node test/test_idempotency.mjs
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic mirror of the idempotency guard in autoProcessRecording()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates the atomic claim logic:
 *   1. Re-fetch from DB to check current status
 *   2. If not 'uploaded', skip
 *   3. Conditional UPDATE where status='uploaded' → only one concurrent caller wins
 *
 * `db` is a shared state object simulating the DB row.
 * Returns: 'processed' | 'skipped'
 */
async function simulateAutoProcess(db, recordingId, processingLog) {
  // Step 1: Re-fetch current status
  if (db.status !== 'uploaded') {
    processingLog.push({ id: recordingId, action: 'skipped', reason: `status is '${db.status}'` });
    return 'skipped';
  }

  // Step 2: Atomic claim — only succeeds if status is still 'uploaded'
  // In a real DB this is a conditional UPDATE. Here we simulate with a mutex flag.
  if (db._claimed) {
    processingLog.push({ id: recordingId, action: 'skipped', reason: 'already claimed by another caller' });
    return 'skipped';
  }
  db._claimed = true;
  db.status = 'processing';

  // Step 3: Simulate processing
  await new Promise(r => setTimeout(r, 5)); // tiny async gap
  db.status = 'processed';
  processingLog.push({ id: recordingId, action: 'processed' });
  return 'processed';
}

// ─────────────────────────────────────────────────────────────────────────────
// Test runner
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}${detail ? '\n    ' + detail : ''}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Single upload event → exactly one processing run
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 1: Single upload event → one processing run ===');
{
  const db = { id: 'rec-001', status: 'uploaded', _claimed: false };
  const log = [];
  await simulateAutoProcess(db, 'rec-001', log);

  assert('DB status is processed', db.status === 'processed');
  assert('Exactly one log entry', log.length === 1);
  assert('Log entry is processed', log[0].action === 'processed');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Duplicate realtime events (same recording fired twice simultaneously)
// → Only one must process, the second must be skipped
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 2: Duplicate realtime events → one processed, one skipped ===');
{
  const db = { id: 'rec-002', status: 'uploaded', _claimed: false };
  const log = [];

  // Fire both simultaneously
  await Promise.all([
    simulateAutoProcess(db, 'rec-002', log),
    simulateAutoProcess(db, 'rec-002', log)
  ]);

  const processedCount = log.filter(e => e.action === 'processed').length;
  const skippedCount = log.filter(e => e.action === 'skipped').length;

  assert('Exactly one processed', processedCount === 1,
    `processedCount=${processedCount}, log=${JSON.stringify(log)}`);
  assert('Exactly one skipped', skippedCount === 1,
    `skippedCount=${skippedCount}`);
  assert('DB status is processed', db.status === 'processed');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Three concurrent events → exactly one processed, two skipped
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 3: Three concurrent events → one processed, two skipped ===');
{
  const db = { id: 'rec-003', status: 'uploaded', _claimed: false };
  const log = [];

  await Promise.all([
    simulateAutoProcess(db, 'rec-003', log),
    simulateAutoProcess(db, 'rec-003', log),
    simulateAutoProcess(db, 'rec-003', log)
  ]);

  const processedCount = log.filter(e => e.action === 'processed').length;
  const skippedCount = log.filter(e => e.action === 'skipped').length;

  assert('Exactly one processed', processedCount === 1,
    `processedCount=${processedCount}`);
  assert('Exactly two skipped', skippedCount === 2,
    `skippedCount=${skippedCount}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Event for already-processing recording → skipped
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 4: Already-processing → skipped ===');
{
  const db = { id: 'rec-004', status: 'processing', _claimed: true };
  const log = [];
  await simulateAutoProcess(db, 'rec-004', log);

  assert('Skipped (already processing)', log[0]?.action === 'skipped');
  assert('Status remains processing', db.status === 'processing');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Already processed → skipped (no reprocessing)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 5: Already processed → skipped ===');
{
  const db = { id: 'rec-005', status: 'processed', _claimed: true };
  const log = [];
  await simulateAutoProcess(db, 'rec-005', log);

  assert('Skipped (already processed)', log[0]?.action === 'skipped');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: needs_customer recording → skipped (must not re-process)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 6: needs_customer → skipped ===');
{
  const db = { id: 'rec-006', status: 'needs_customer', _claimed: false };
  const log = [];
  await simulateAutoProcess(db, 'rec-006', log);

  assert('Skipped (needs_customer)', log[0]?.action === 'skipped');
  assert('Status unchanged', db.status === 'needs_customer');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✓');
}
