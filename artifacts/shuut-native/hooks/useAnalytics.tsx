import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PostHog, { PostHogProvider } from 'posthog-react-native';
import { useAuth } from './useAuthStore';

type EventName = 'screen_viewed' | 'post_published' | 'onboarding_completed';
type Choice = { userId: string; allowed: boolean };
type AnalyticsContextValue = {
  allowed: boolean;
  ready: boolean;
  configured: boolean;
  active: boolean;
  setAllowed: (allowed: boolean) => Promise<boolean>;
  capture: (event: EventName, properties?: { screen?: string }) => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);
const token = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;
const configured = Boolean(token && host);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user, authState } = useAuth();
  const userId = authState === 'ready' && user && !user.legalPolicyConsent.required ? String(user.id) : null;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [client, setClient] = useState<PostHog | null>(null);
  const clientRef = useRef<PostHog | null>(null);
  const allowed = Boolean(userId && choice?.userId === userId && choice.allowed);
  const ready = Boolean(userId && choice?.userId === userId);
  const active = Boolean(allowed && client);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setChoice(null);
      return;
    }
    void AsyncStorage.getItem(`shuut.analytics.${userId}`)
      .then((value) => {
        if (!cancelled) setChoice({ userId, allowed: value === 'yes' });
      })
      .catch(() => {
        if (!cancelled) setChoice({ userId, allowed: false });
      });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!allowed || !userId || !token || !host) {
      setClient(null);
      return;
    }
    let cancelled = false;
    const instance = new PostHog(token, {
      host,
      persistence: 'memory',
      defaultOptIn: false,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
    });
    clientRef.current = instance;
    void instance.optIn().then(() => {
      if (cancelled) return;
      instance.identify(userId);
      setClient(instance);
    }).catch(() => {
      if (!cancelled) setClient(null);
    });
    return () => {
      cancelled = true;
      void instance.optOut();
      instance.reset();
      if (clientRef.current === instance) clientRef.current = null;
    };
  }, [allowed, userId]);

  const setAllowed = useCallback(async (next: boolean) => {
    if (!userId || (next && !configured)) return false;
    if (!next) {
      void clientRef.current?.optOut();
      clientRef.current?.reset();
      setClient(null);
    }
    try {
      await AsyncStorage.setItem(`shuut.analytics.${userId}`, next ? 'yes' : 'no');
      setChoice({ userId, allowed: next });
      return true;
    } catch {
      return false;
    }
  }, [userId]);

  const capture = useCallback((event: EventName, properties?: { screen?: string }) => {
    if (!allowed || !client) return;
    try {
      client.capture(event, properties);
    } catch {
      // A telemetry error must never affect publication or navigation.
    }
  }, [allowed, client]);

  return (
    <AnalyticsContext.Provider value={{ allowed, ready, configured, active, setAllowed, capture }}>
      {client ? <PostHogProvider client={client} autocapture={false}>{children}</PostHogProvider> : children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error('useAnalytics must be used inside AnalyticsProvider');
  return context;
}