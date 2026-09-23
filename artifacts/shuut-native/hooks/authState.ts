import type { AuthSession } from '@workspace/api-client-react';

export type AuthState = 'loading' | 'unauthenticated' | 'onboardingPending' | 'waitlisted' | 'ready';
export type PersistedAuthState = Exclude<AuthState, 'loading' | 'unauthenticated'>;

export function isPersistedAuthState(value: string | null): value is PersistedAuthState {
  return value === 'onboardingPending' || value === 'waitlisted' || value === 'ready';
}

export function resolveAuthSessionState(session: AuthSession): PersistedAuthState {
  return session.user.onboardingComplete ? 'ready' : 'onboardingPending';
}