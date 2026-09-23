import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import PostHog, { PostHogProvider } from 'posthog-react-native';
import { useAuth } from './useAuthStore';

type EventName = 'screen_viewed' | 'post_published' | 'onboarding_completed';
type AnalyticsContextValue = {
  active: boolean;
  capture: (event: EventName, properties?: { screen?: string }) => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);
const token = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user, authState } = useAuth();
  const userId = authState === 'ready' && user && !user.legalPolicyConsent.required ? String(user.id) : null;
  const [client, setClient] = useState<PostHog | null>(null);
  const [identifiedUser, setIdentifiedUser] = useState<string | null | undefined>(undefined);
  const active = Boolean(client && identifiedUser === userId);

  useEffect(() => {
    if (!token || !host) return;
    try {
      const instance = new PostHog(token, {
        host,
        persistence: 'memory',
        captureAppLifecycleEvents: false,
        enableSessionReplay: false,
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
      setClient(instance);
      return () => {
        void instance.optOut();
        instance.reset();
      };
    } catch {
      setClient(null);
    }
  }, []);

  useEffect(() => {
    if (!client) return;
    try {
      if (userId) client.identify(userId);
      else client.reset();
      setIdentifiedUser(userId);
    } catch {
      setIdentifiedUser(undefined);
    }
  }, [client, userId]);

  const capture = useCallback((event: EventName, properties?: { screen?: string }) => {
    if (!active || !client) return;
    try {
      client.capture(event, properties);
    } catch {
      // A telemetry error must never affect publication or navigation.
    }
  }, [active, client]);

  return (
    <AnalyticsContext.Provider value={{ active, capture }}>
      {client ? <PostHogProvider client={client} autocapture={false}>{children}</PostHogProvider> : children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error('useAnalytics must be used inside AnalyticsProvider');
  return context;
}