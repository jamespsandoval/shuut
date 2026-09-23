import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import { useAuth } from '@/hooks/use-auth';

type EventName = 'screen_viewed' | 'post_published' | 'onboarding_completed';
type EventProperties = { screen?: string };
type Choice = { userId: string; allowed: boolean };
type AnalyticsContextValue = {
  allowed: boolean;
  ready: boolean;
  configured: boolean;
  active: boolean;
  setAllowed: (allowed: boolean) => Promise<boolean>;
  capture: (event: EventName, properties?: EventProperties) => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);
const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const host = import.meta.env.VITE_POSTHOG_HOST;
const configured = Boolean(token && host);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn } = useAuth();
  const userId = isSignedIn && user && !user.legalPolicyConsent?.required ? String(user.id) : null;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [active, setActive] = useState(false);
  const started = useRef(false);
  const allowed = Boolean(userId && choice?.userId === userId && choice.allowed);
  const ready = Boolean(userId && choice?.userId === userId);

  useEffect(() => {
    if (!userId) {
      setChoice(null);
      return;
    }
    try {
      setChoice({ userId, allowed: localStorage.getItem(`shuut.analytics.${userId}`) === 'yes' });
    } catch {
      setChoice({ userId, allowed: false });
    }
  }, [userId]);

  useEffect(() => {
    if (!allowed || !userId || !configured) {
      if (started.current) {
        posthog.opt_out_capturing();
        posthog.reset();
      }
      setActive(false);
      return;
    }
    try {
      if (!started.current) {
        posthog.init(token, {
          api_host: host,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          persistence: 'memory',
          person_profiles: 'identified_only',
        });
        started.current = true;
      } else {
        posthog.opt_in_capturing();
      }
      posthog.identify(userId);
      setActive(true);
    } catch {
      setActive(false);
    }
  }, [allowed, userId]);

  const setAllowed = useCallback(async (next: boolean) => {
    if (!userId || (next && !configured)) return false;
    if (!next && started.current) {
      posthog.opt_out_capturing();
      posthog.reset();
      setActive(false);
    }
    try {
      localStorage.setItem(`shuut.analytics.${userId}`, next ? 'yes' : 'no');
      setChoice({ userId, allowed: next });
      return true;
    } catch {
      return false;
    }
  }, [userId]);

  const capture = useCallback((event: EventName, properties?: EventProperties) => {
    if (!allowed || !active) return;
    try {
      posthog.capture(event, properties);
    } catch {
      // Analytics must never interfere with a user action.
    }
  }, [allowed, active]);

  return (
    <AnalyticsContext.Provider value={{ allowed, ready, configured, active, setAllowed, capture }}>
      <PostHogProvider client={posthog}>{children}</PostHogProvider>
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error('useAnalytics must be used inside AnalyticsProvider');
  return context;
}