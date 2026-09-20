import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runStartupCrashProbe,
  shouldRunStartupCrashProbe,
  STARTUP_CRASH_PROBE_MESSAGE,
} from './startupCrashProbe.ts';

test('requires both the diagnostics channel and explicit startup probe', () => {
  assert.equal(
    shouldRunStartupCrashProbe({ channel: 'diagnostics', enabled: 'startup' }),
    true,
  );
  assert.equal(
    shouldRunStartupCrashProbe({ channel: 'production', enabled: 'startup' }),
    false,
  );
  assert.equal(
    shouldRunStartupCrashProbe({ channel: 'diagnostics', enabled: undefined }),
    false,
  );
});

test('throws a stable searchable error only for a diagnostics build', () => {
  assert.doesNotThrow(() =>
    runStartupCrashProbe({ channel: 'production', enabled: 'startup' }),
  );
  assert.throws(
    () => runStartupCrashProbe({ channel: 'diagnostics', enabled: 'startup' }),
    new RegExp(STARTUP_CRASH_PROBE_MESSAGE),
  );
});