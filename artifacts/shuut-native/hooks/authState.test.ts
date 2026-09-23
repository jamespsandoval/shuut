import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthSessionState } from './authState';

test('restores an enrolled account without requiring passkey verification', () => {
  assert.equal(resolveAuthSessionState({
    user: {
      id: 'member',
      email: 'member@example.test',
      emailVerified: true,
      onboardingComplete: true,
      eligibilityStatus: 'eligible',
      passkeyEnrolled: true,
      passkeyVerified: false,
    },
  }), 'ready');
});

test('checks onboarding independently of legacy passkey fields', () => {
  assert.equal(resolveAuthSessionState({
    user: {
      id: 'member',
      email: 'member@example.test',
      emailVerified: true,
      onboardingComplete: false,
      eligibilityStatus: 'undecided',
      passkeyEnrolled: true,
      passkeyVerified: true,
    },
  }), 'onboardingPending');
});

test('lets a previously waitlisted account finish onboarding', () => {
  assert.equal(resolveAuthSessionState({
    user: {
      id: 'member',
      email: 'member@example.test',
      emailVerified: true,
      onboardingComplete: false,
      eligibilityStatus: 'waitlisted',
      passkeyEnrolled: false,
      passkeyVerified: false,
    },
  }), 'onboardingPending');
});