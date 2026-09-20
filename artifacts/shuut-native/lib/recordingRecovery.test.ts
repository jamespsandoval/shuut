import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOVERY_MAX_AGE_MS, shouldPreserveInterruptedRecording, validateRecovery } from './recordingRecovery';

test('validates recovery descriptors and expires old entries', () => {
  const now = 10_000;
  const value = { uri: 'file:///voice.m4a', duration: 4.6, interruptionMessage: 'Interrupted', timestamp: now };
  assert.deepEqual(validateRecovery(value, now), { ...value, duration: 5 });
  assert.equal(validateRecovery({ ...value, duration: 0 }, now)?.duration, 1);
  assert.equal(validateRecovery({ ...value, timestamp: now - RECOVERY_MAX_AGE_MS - 1 }, now), null);
  assert.equal(validateRecovery({ ...value, duration: -1 }, now), null);
  assert.equal(validateRecovery({ ...value, timestamp: now + 60_001 }, now), null);
  assert.equal(validateRecovery({ ...value, uri: '' }, now), null);
});

test('only preserves an interrupted active recording with a file', () => {
  assert.equal(shouldPreserveInterruptedRecording(true, 'file:///voice.m4a'), true);
  assert.equal(shouldPreserveInterruptedRecording(true, null), false);
  assert.equal(shouldPreserveInterruptedRecording(false, 'file:///voice.m4a'), false);
});