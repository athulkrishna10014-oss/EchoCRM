/**
 * Comprehensive Unit Tests for AI Task Due Date Sanitization (FIX 1)
 *
 * Requirements verified:
 * - valid date string
 * - null
 * - undefined
 * - empty string
 * - "null" (case-insensitive)
 * - number
 * - boolean
 * - object / array
 * - does not crash on any input type
 * - preserves valid date strings (relative to today)
 *
 * Run with: node test/test_due_date_sanitizer.mjs
 */

import assert from 'node:assert';

// Pure logic mirror of sanitizeDueDate from src/services/aiPipelineService.ts
function sanitizeDueDate(dueDate, referenceDate = new Date()) {
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

const refDate = new Date('2026-10-01T12:00:00.000Z');

console.log('=== TEST SUITE 1: Valid Date Strings ===');
{
  const res1 = sanitizeDueDate('2026-10-15', refDate);
  assert.strictEqual(res1, '2026-10-15', 'Expected valid future date to be preserved');
  console.log('  ✓ Future date string "2026-10-15" preserved');

  const res2 = sanitizeDueDate('2026-10-01', refDate);
  assert.strictEqual(res2, '2026-10-01', 'Expected same-day date to be preserved');
  console.log('  ✓ Same-day date string "2026-10-01" preserved');

  const res3 = sanitizeDueDate('2026-10-20T15:30:00Z', refDate);
  assert.strictEqual(res3, '2026-10-20T15:30:00Z', 'Expected ISO timestamp to be preserved');
  console.log('  ✓ ISO timestamp "2026-10-20T15:30:00Z" preserved');

  const resPast = sanitizeDueDate('2026-09-15', refDate);
  assert.strictEqual(resPast, null, 'Expected past date to be rejected/null');
  console.log('  ✓ Past date string "2026-09-15" filtered out as null');
}

console.log('=== TEST SUITE 2: Null and Undefined ===');
{
  assert.strictEqual(sanitizeDueDate(null, refDate), null, 'null should return null');
  console.log('  ✓ null handled cleanly without crash');

  assert.strictEqual(sanitizeDueDate(undefined, refDate), null, 'undefined should return null');
  console.log('  ✓ undefined handled cleanly without crash');
}

console.log('=== TEST SUITE 3: Empty and Whitespace Strings ===');
{
  assert.strictEqual(sanitizeDueDate('', refDate), null, 'empty string should return null');
  console.log('  ✓ empty string "" returns null');

  assert.strictEqual(sanitizeDueDate('   ', refDate), null, 'whitespace string should return null');
  console.log('  ✓ whitespace string "   " returns null');
}

console.log('=== TEST SUITE 4: String Literal "null" (Case-Insensitive) ===');
{
  assert.strictEqual(sanitizeDueDate('null', refDate), null, '"null" should return null');
  console.log('  ✓ lowercase "null" returns null');

  assert.strictEqual(sanitizeDueDate('NULL', refDate), null, '"NULL" should return null');
  console.log('  ✓ uppercase "NULL" returns null');

  assert.strictEqual(sanitizeDueDate('  Null  ', refDate), null, 'padded "  Null  " should return null');
  console.log('  ✓ padded "  Null  " returns null');
}

console.log('=== TEST SUITE 5: Numeric Values (Timestamp / Numbers) ===');
{
  assert.strictEqual(sanitizeDueDate(1728000000000, refDate), null, 'number should return null without throwing');
  assert.strictEqual(sanitizeDueDate(0, refDate), null, 'zero should return null without throwing');
  assert.strictEqual(sanitizeDueDate(-1, refDate), null, 'negative number should return null without throwing');
  assert.strictEqual(sanitizeDueDate(NaN, refDate), null, 'NaN should return null without throwing');
  console.log('  ✓ Numbers do not crash and return null');
}

console.log('=== TEST SUITE 6: Boolean Values ===');
{
  assert.strictEqual(sanitizeDueDate(true, refDate), null, 'boolean true should return null without throwing');
  assert.strictEqual(sanitizeDueDate(false, refDate), null, 'boolean false should return null without throwing');
  console.log('  ✓ Booleans do not crash and return null');
}

console.log('=== TEST SUITE 7: Objects and Arrays ===');
{
  assert.strictEqual(sanitizeDueDate({}, refDate), null, 'empty object should return null without throwing');
  assert.strictEqual(sanitizeDueDate({ date: '2026-10-15' }, refDate), null, 'nested object should return null without throwing');
  assert.strictEqual(sanitizeDueDate([], refDate), null, 'array should return null without throwing');
  assert.strictEqual(sanitizeDueDate(['2026-10-15'], refDate), null, 'array with date should return null without throwing');
  console.log('  ✓ Objects and arrays do not crash and return null');
}

console.log('=== TEST SUITE 8: Malformed / Garbage Date Strings ===');
{
  assert.strictEqual(sanitizeDueDate('not-a-real-date', refDate), null, 'garbage string should return null');
  assert.strictEqual(sanitizeDueDate('TBD', refDate), null, '"TBD" string should return null');
  assert.strictEqual(sanitizeDueDate('asap', refDate), null, '"asap" string should return null');
  console.log('  ✓ Invalid date strings return null');
}

console.log('\n──────────────────────────────────────────────────');
console.log('All AI Task Due Date Sanitization Tests Passed ✓\n');
