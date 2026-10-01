/**
 * Unit Tests for Protocol-Aware Audio Download Helper (FIX 2)
 *
 * Requirements verified:
 * - Safely parses URLs
 * - Uses http for http://
 * - Uses https for https://
 * - Rejects unsupported protocols cleanly (e.g. ftp:, file:)
 * - Rejects malformed / empty / non-string URLs
 *
 * Run with: node test/test_download_helper.mjs
 */

import assert from 'node:assert';
import http from 'node:http';
import https from 'node:https';
import mainModule from '../main.js';

const { getHttpClientForUrl } = mainModule;

console.log('=== TEST SUITE 1: Valid HTTPS Protocol ===');
{
  const res1 = getHttpClientForUrl('https://example.com/audio/meeting-123.webm');
  assert.strictEqual(res1.client, https, 'Should select https module for https URL');
  assert.strictEqual(res1.parsedUrl.hostname, 'example.com');
  console.log('  ✓ Selects https module for standard HTTPS URL');

  const res2 = getHttpClientForUrl('https://mock-project-ref.supabase.co/storage/v1/object/public/recordings/test.webm?token=xyz');
  assert.strictEqual(res2.client, https, 'Should select https module for Supabase Storage URL');
  console.log('  ✓ Selects https module for Supabase storage URL');
}

console.log('=== TEST SUITE 2: Valid HTTP Protocol ===');
{
  const res1 = getHttpClientForUrl('http://127.0.0.1:54321/storage/v1/object/public/recordings/test.webm');
  assert.strictEqual(res1.client, http, 'Should select http module for local IP URL');
  assert.strictEqual(res1.parsedUrl.port, '54321');
  console.log('  ✓ Selects http module for local Docker/Supabase HTTP URL');

  const res2 = getHttpClientForUrl('http://localhost:8000/sample.mp3');
  assert.strictEqual(res2.client, http, 'Should select http module for localhost URL');
  console.log('  ✓ Selects http module for localhost HTTP URL');
}

console.log('=== TEST SUITE 3: Unsupported Protocols Rejected Cleanly ===');
{
  assert.throws(
    () => getHttpClientForUrl('ftp://ftp.example.com/audio.webm'),
    /Unsupported protocol "ftp:"/,
    'FTP should throw unsupported protocol error'
  );
  console.log('  ✓ FTP protocol cleanly rejected');

  assert.throws(
    () => getHttpClientForUrl('file:///C:/Users/test/recording.webm'),
    /Unsupported protocol "file:"/,
    'FILE should throw unsupported protocol error'
  );
  console.log('  ✓ File protocol cleanly rejected');

  assert.throws(
    () => getHttpClientForUrl('data:audio/webm;base64,AAAA'),
    /Unsupported protocol "data:"/,
    'DATA URI should throw unsupported protocol error'
  );
  console.log('  ✓ Data URI cleanly rejected');
}

console.log('=== TEST SUITE 4: Invalid and Missing Inputs Handled Cleanly ===');
{
  assert.throws(
    () => getHttpClientForUrl(''),
    /A valid URL string is required/,
    'Empty string should be rejected'
  );
  console.log('  ✓ Empty string rejected cleanly');

  assert.throws(
    () => getHttpClientForUrl(null),
    /A valid URL string is required/,
    'null should be rejected'
  );
  console.log('  ✓ null rejected cleanly');

  assert.throws(
    () => getHttpClientForUrl(undefined),
    /A valid URL string is required/,
    'undefined should be rejected'
  );
  console.log('  ✓ undefined rejected cleanly');

  assert.throws(
    () => getHttpClientForUrl('not-a-valid-url'),
    /Invalid URL provided/,
    'Malformed URL should throw'
  );
  console.log('  ✓ Malformed URL rejected cleanly');
}

console.log('\n──────────────────────────────────────────────────');
console.log('All Audio Download Protocol Tests Passed ✓\n');
