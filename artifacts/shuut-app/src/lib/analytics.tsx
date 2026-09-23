import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import { useAuth } from '@/hooks/use-auth';

type EventName = 'screen_viewed' | 'post_published' | 'onboarding_completed';
type EventProperties = { screen?: string };
type AnalyticsContextValue = {
  active: boolean;
  capture: (event: EventName, properties?: EventProperties) => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);
const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const host = import.meta.env.VITE_POSTHOG_HOST;
const configured = Boolean(token && host);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn } = useAuth();
  const userId = isSignedIn && user && !user.legalPolicyConsent?.required ? String(user.id) : null;
  const [active, setActive] = useState(false);
  const [identifiedUser, setIdentifiedUser] = useState<string | null | undefined>(undefined);
  const started = useRef(false);

  useEffect(() => {
    if (!configured || started.current) return;
    try {
      posthog.init(token, {
        api_host: host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        persistence: 'memory',
        person_profiles: 'identified_only',
        before_send: (event) => {
          if (!event?.properties) return event;
          for (const key of Object.keys(event.properties)) {
            if (/(url|path|referr|utm|query|search|host)/i.test(key)) {
              delete event.properties[key];
            }
          }
          return event;
        },
      });
      started.current = true;
      setActive(true);
    } catch {
      setActive(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    try {
      if (userId) posthog.identify(userId);
      else posthog.reset();
      setIdentifiedUser(userId);
    } catch {
      setIdentifiedUser(undefined);
    }
  }, [active, userId]);

  const capture = useCallback((event: EventName, properties?: EventProperties) => {
    if (!active || identifiedUser !== userId) return;
    try {
      posthog.capture(event, properties);
    } catch {
      // Analytics must never interfere with a user action.
    }
  }, [active, identifiedUser, userId]);

  return (
    <AnalyticsContext.Provider value={{ active: active && identifiedUser === userId, capture }}>
      <PostHogProvider client={posthog}>{children}</PostHogProvider>
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error('useAnalytics must be used inside AnalyticsProvider');
  return context;
}