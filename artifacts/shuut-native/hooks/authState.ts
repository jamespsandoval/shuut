import type { AuthSession } from '@workspace/api-client-react';

export type AuthState = 'loading' | 'unauthenticated' | 'passkeyPending' | 'onboardingPending' | 'ready';
export type PersistedAuthState = Exclude<AuthState, 'loading' | 'unauthenticated'>;

export function isPersistedAuthState(value: string | null): value is PersistedAuthState {
  return value === 'passkeyPending' || value === 'onboardingPending' || value === 'ready';
}

export function resolveAuthSessionState(session: AuthSession): PersistedAuthState {
  if (session.user.passkeyEnrolled && !session.user.passkeyVerified) {
    return 'passkeyPending';
  }
  return session.user.onboardingComplete ? 'ready' : 'onboardingPending';
}