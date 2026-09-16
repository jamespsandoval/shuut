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
      eligibilityStatus: 'eligible',
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
      eligibilityStatus: 'undecided',
      passkeyEnrolled: true,
      passkeyVerified: true,
    },
  }), 'onboardingPending');
});

test('restores a waitlisted account to the terminal waitlist state', () => {
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
  }), 'waitlisted');
});