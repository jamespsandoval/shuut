import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthSessionState } from './authState';

test('restores an enrolled but unverified passkey session as pending', () => {
  assert.equal(resolveAuthSessionState({
    user: {
      id: 'member',
      email: 'member@example.test',
      emailVerified: true,
      onboardingComplete: true,
      passkeyEnrolled: true,
      passkeyVerified: false,
    },
  }), 'passkeyPending');
});

test('checks onboarding only after passkey verification', () => {
  assert.equal(resolveAuthSessionState({
    user: {
      id: 'member',
      email: 'member@example.test',
      emailVerified: true,
      onboardingComplete: false,
      passkeyEnrolled: true,
      passkeyVerified: true,
    },
  }), 'onboardingPending');
});