import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVoiceConsentGate,
  shouldCancelRecordingForLifecycle,
} from './voiceRecordingGuards';

test('fails closed while consent is loading, unavailable, or errored', () => {
  assert.equal(resolveVoiceConsentGate({ status: null, loading: true, error: false }), 'block');
  assert.equal(resolveVoiceConsentGate({ status: undefined, loading: false, error: false }), 'block');
  assert.equal(resolveVoiceConsentGate({ status: { required: false }, loading: false, error: true }), 'block');
});

test('prompts before the first recording and allows only accepted consent', () => {
  assert.equal(resolveVoiceConsentGate({ status: { required: true }, loading: false, error: false }), 'prompt');
  assert.equal(resolveVoiceConsentGate({ status: { required: false }, loading: false, error: false }), 'allow');
});

test('cancels pending or active recording when leaving the active route', () => {
  assert.equal(shouldCancelRecordingForLifecycle({ appIsActive: false, startPending: true, recording: false }), true);
  assert.equal(shouldCancelRecordingForLifecycle({ appIsActive: false, startPending: false, recording: true }), true);
  assert.equal(shouldCancelRecordingForLifecycle({ appIsActive: true, startPending: true, recording: true }), false);
  assert.equal(shouldCancelRecordingForLifecycle({ appIsActive: false, startPending: false, recording: false }), false);
});