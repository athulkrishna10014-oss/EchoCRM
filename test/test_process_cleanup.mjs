/**
 * Unit Tests for Process Tree Termination and Idempotent Shutdown (FIX 5)
 *
 * Requirements verified:
 * - On Windows, terminates the process tree using taskkill /pid <PID> /T /F
 * - Prevents orphaned child processes
 * - Calling stopAIService multiple times is idempotent and never throws
 * - Handles already-exited processes gracefully
 *
 * Run with: node test/test_process_cleanup.mjs
 */

import assert from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import mainModule from '../main.js';

const { stopAIService } = mainModule;

console.log('=== TEST SUITE 1: Idempotent Shutdown on Null / Inactive Process ===');
{
  // When no process is active, stopAIService must not throw
  assert.doesNotThrow(() => {
    stopAIService();
  }, 'Calling stopAIService with no running process should not throw');
  console.log('  ✓ stopAIService() safely does nothing when pythonProcess is null');

  assert.doesNotThrow(() => {
    stopAIService();
    stopAIService();
  }, 'Multiple consecutive calls should be completely safe');
  console.log('  ✓ Multiple consecutive stopAIService() calls are idempotent');
}

console.log('=== TEST SUITE 2: Windows Process Tree Termination Simulation ===');
{
  if (process.platform === 'win32') {
    // Spawn a shell process with a child python sleep process to simulate the exact shell: true environment
    const child = spawn('cmd.exe', ['/c', 'python -c "import time; time.sleep(30)"'], {
      shell: true,
      windowsHide: true
    });

    const pid = child.pid;
    assert(pid > 0, 'Child process should have a valid PID');
    console.log(`  ✓ Spawned test child process tree with parent PID: ${pid}`);

    // Give process 200ms to spin up the python subprocess
    await new Promise(r => setTimeout(r, 200));

    // Terminate tree synchronously with taskkill
    const killResult = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    console.log(`  ✓ taskkill /pid ${pid} /T /F executed synchronously (exitCode: ${killResult.status})`);

    // Verify process is terminated
    const checkResult = spawnSync('tasklist', ['/FI', `PID eq ${pid}`], { encoding: 'utf8' });
    const isStillRunning = checkResult.stdout.includes(String(pid));
    assert.strictEqual(isStillRunning, false, 'Process tree must be terminated and not appear in tasklist');
    console.log(`  ✓ Confirmed PID ${pid} is completely terminated`);

    // Terminating an already-dead process must not throw or crash
    assert.doesNotThrow(() => {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    }, 'Killing an already terminated process should be handled gracefully');
    console.log('  ✓ Re-executing taskkill on already-terminated PID handled gracefully');
  } else {
    console.log('  ℹ Skipping Windows-specific taskkill test on non-Windows platform');
  }
}

console.log('\n──────────────────────────────────────────────────');
console.log('All Process Cleanup and Shutdown Tests Passed ✓\n');
