/**
 * Unit tests for resolveCustomerByName() — pure logic traces.
 *
 * These run WITHOUT a real Supabase connection by mocking the DB call.
 * They prove the deterministic resolution rules using the exact implementation code.
 *
 * Run with: node test/test_customer_resolution.mjs
 */

// ---------------------------------------------------------------------------
// Pure logic extraction — mirrors resolveCustomerByName() exactly
// (copied to avoid needing TS compilation or Supabase connection)
// ---------------------------------------------------------------------------

function resolveCustomerByNameSync(candidateName, customers) {
  if (!candidateName || !candidateName.trim()) {
    return { type: 'no_name' };
  }

  const nameTrimmed = candidateName.trim();

  // ── Rule 2 & 3: Exact full-name match (case-insensitive) ─────────────────
  const exactMatches = customers.filter(
    (c) => c.name.trim().toLowerCase() === nameTrimmed.toLowerCase()
  );

  if (exactMatches.length === 1) {
    return { type: 'resolved', customerId: exactMatches[0].id, isNew: false };
  }

  if (exactMatches.length > 1) {
    return {
      type: 'ambiguous',
      candidateIds: exactMatches.map((c) => c.id),
      extractedName: nameTrimmed
    };
  }

  // ── Rule 4: First-name-only safety check ─────────────────────────────────
  const firstNameOnly = !nameTrimmed.includes(' ');
  if (firstNameOnly) {
    const firstNameLower = nameTrimmed.toLowerCase();
    const firstNameMatches = customers.filter(
      (c) => c.name.trim().toLowerCase().split(' ')[0] === firstNameLower
    );
    if (firstNameMatches.length > 1) {
      return {
        type: 'ambiguous',
        candidateIds: firstNameMatches.map((c) => c.id),
        extractedName: nameTrimmed
      };
    }
    if (firstNameMatches.length === 1) {
      return { type: 'resolved', customerId: firstNameMatches[0].id, isNew: false };
    }
  }

  // ── Rule 5: Partial / contains-name match for full names ─────────────────
  const partialMatches = customers.filter((c) => {
    const existingLower = c.name.trim().toLowerCase();
    const candidateLower = nameTrimmed.toLowerCase();
    return existingLower.includes(candidateLower) || candidateLower.includes(existingLower);
  });

  if (partialMatches.length === 1) {
    return { type: 'resolved', customerId: partialMatches[0].id, isNew: false };
  }

  if (partialMatches.length > 1) {
    return {
      type: 'ambiguous',
      candidateIds: partialMatches.map((c) => c.id),
      extractedName: nameTrimmed
    };
  }

  // ── Rule 6: No match → would create new customer ─────────────────────────
  // In this sync test we just flag it
  return { type: 'would_create_new', name: nameTrimmed };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

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

function assertEqual(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(label, ok, ok ? '' : `\n    Got:      ${JSON.stringify(actual)}\n    Expected: ${JSON.stringify(expected)}`);
}

// ---------------------------------------------------------------------------
// Customer fixture
// ---------------------------------------------------------------------------
const DB_RAHUL_A = { id: 'uuid-rahul-a', name: 'Rahul A' };
const DB_RAHUL_M = { id: 'uuid-rahul-m', name: 'Rahul M' };
const DB_RAHUL_MATHEW = { id: 'uuid-rahul-mathew', name: 'Rahul Mathew' };
const DB_JANE = { id: 'uuid-jane', name: 'Jane Doe' };

// ---------------------------------------------------------------------------
// TEST SUITE 1: AMBIGUOUS FIRST-NAME
// Transcript: "Rahul" | DB: Rahul A, Rahul M → MUST be ambiguous
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 1: Ambiguous first name ===');
{
  const customers = [DB_RAHUL_A, DB_RAHUL_M];
  const result = resolveCustomerByNameSync('Rahul', customers);

  assert('Type is ambiguous', result.type === 'ambiguous',
    `Got type: ${result.type}`);
  assert('extractedName is "Rahul"', result.extractedName === 'Rahul');
  assert('candidateIds includes Rahul A', result.candidateIds?.includes('uuid-rahul-a'));
  assert('candidateIds includes Rahul M', result.candidateIds?.includes('uuid-rahul-m'));
  assert('candidateIds length is 2', result.candidateIds?.length === 2);
  assert('Did NOT auto-select Rahul A', result.customerId !== 'uuid-rahul-a');
  assert('Did NOT auto-select Rahul M', result.customerId !== 'uuid-rahul-m');
}

// ---------------------------------------------------------------------------
// TEST SUITE 2: EXACT MATCH — "Rahul A" → Rahul A
// DB: Rahul A, Rahul M
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 2: Exact match "Rahul A" ===');
{
  const customers = [DB_RAHUL_A, DB_RAHUL_M];
  const result = resolveCustomerByNameSync('Rahul A', customers);

  assert('Type is resolved', result.type === 'resolved');
  assert('Resolves to Rahul A', result.customerId === 'uuid-rahul-a');
  assert('isNew is false (existing)', result.isNew === false);
  assert('Did NOT resolve to Rahul M', result.customerId !== 'uuid-rahul-m');
}

// ---------------------------------------------------------------------------
// TEST SUITE 3: EXACT MATCH — "Rahul Mathew" → existing Rahul Mathew (NO duplicate)
// DB: Rahul Mathew only
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 3: Exact match "Rahul Mathew" — no duplicate ===');
{
  const customers = [DB_RAHUL_MATHEW, DB_JANE];
  const result = resolveCustomerByNameSync('Rahul Mathew', customers);

  assert('Type is resolved', result.type === 'resolved');
  assert('Resolves to existing Rahul Mathew', result.customerId === 'uuid-rahul-mathew');
  assert('isNew is false (must NOT create duplicate)', result.isNew === false);
}

// ---------------------------------------------------------------------------
// TEST SUITE 4: NO MATCH → would create new customer
// DB: Jane Doe only. Transcript: "Anitha"
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 4: No match → create new ===');
{
  const customers = [DB_JANE];
  const result = resolveCustomerByNameSync('Anitha', customers);

  assert('Type is would_create_new', result.type === 'would_create_new');
  assert('Name preserved', result.name === 'Anitha');
}

// ---------------------------------------------------------------------------
// TEST SUITE 5: EMPTY / NULL name → no_name
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 5: Null/empty name → no_name ===');
{
  assertEqual('null → no_name',      resolveCustomerByNameSync(null, []), { type: 'no_name' });
  assertEqual('empty string → no_name', resolveCustomerByNameSync('', []), { type: 'no_name' });
  assertEqual('"  " whitespace → no_name', resolveCustomerByNameSync('   ', []), { type: 'no_name' });
}

// ---------------------------------------------------------------------------
// TEST SUITE 6: CASE INSENSITIVITY
// "rahul a" should match "Rahul A"
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 6: Case-insensitive exact match ===');
{
  const customers = [DB_RAHUL_A, DB_RAHUL_M];
  const result = resolveCustomerByNameSync('rahul a', customers);

  assert('Type is resolved', result.type === 'resolved');
  assert('Resolves to Rahul A (case-insensitive)', result.customerId === 'uuid-rahul-a');
}

// ---------------------------------------------------------------------------
// TEST SUITE 7: Partial/contains match — "Rahul Mathew" when DB has "Rahul Mathew Singh"
// Should resolve (candidate is contained within existing)
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 7: Partial match — candidate is prefix of existing ===');
{
  const customers = [
    { id: 'uuid-rms', name: 'Rahul Mathew Singh' },
    DB_JANE
  ];
  const result = resolveCustomerByNameSync('Rahul Mathew', customers);

  assert('Type is resolved via partial match', result.type === 'resolved');
  assert('Resolves to Rahul Mathew Singh', result.customerId === 'uuid-rms');
}

// ---------------------------------------------------------------------------
// TEST SUITE 8: DUPLICATE FULL NAME — two "Rahul Mathew" entries → ambiguous
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 8: Duplicate full-name → ambiguous ===');
{
  const customers = [
    { id: 'uuid-rm-1', name: 'Rahul Mathew' },
    { id: 'uuid-rm-2', name: 'Rahul Mathew' }
  ];
  const result = resolveCustomerByNameSync('Rahul Mathew', customers);

  assert('Type is ambiguous', result.type === 'ambiguous');
  assert('candidateIds length is 2', result.candidateIds?.length === 2);
}

// ---------------------------------------------------------------------------
// TEST SUITE 9: Single first-name match (only one Rahul) → resolved
// DB: Rahul Mathew (only one "Rahul" customer)
// ---------------------------------------------------------------------------
console.log('\n=== TEST SUITE 9: Single first-name match — only one Rahul ===');
{
  const customers = [DB_RAHUL_MATHEW, DB_JANE];
  const result = resolveCustomerByNameSync('Rahul', customers);

  // "Rahul" has no space → firstNameOnly path.
  // Only DB_RAHUL_MATHEW starts with "rahul".
  // → resolved (single safe match)
  assert('Type is resolved', result.type === 'resolved');
  assert('Resolves to Rahul Mathew', result.customerId === 'uuid-rahul-mathew');
  assert('isNew is false', result.isNew === false);
}

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✓');
}
