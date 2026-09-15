import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { setAuthTokenGetter, getCurrentUser, MobileAuthSession } from "@workspace/api-client-react";
import {
  type AuthState,
  type PersistedAuthState,
  isPersistedAuthState,
  resolveAuthSessionState,
} from "./authState";

const TOKEN_KEY = "shuut_auth_token";
const AUTH_STATE_KEY = "shuut_auth_state";

interface AuthContextType {
  token: string | null;
  authState: AuthState;
  signIn: (session: MobileAuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  completePasskeyHandoff: () => Promise<void>;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    // Setup the token getter for api-client-react
    setAuthTokenGetter(() => SecureStore.getItemAsync(TOKEN_KEY));
    
    const rehydrate = async () => {
      try {
        const [savedToken, savedState] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(AUTH_STATE_KEY),
        ]);
        if (!savedToken) {
          setAuthState('unauthenticated');
          return;
        }
        
        setToken(savedToken);
        
        try {
          const session = await getCurrentUser();
          const nextState = resolveAuthSessionState(session);
          await SecureStore.setItemAsync(AUTH_STATE_KEY, nextState);
          setAuthState(nextState);
        } catch (err: any) {
          if (err?.status === 403 || err?.code === 'passkey_required') {
            setAuthState('passkeyPending');
          } else if (err?.status === 401) {
            await Promise.all([
              SecureStore.deleteItemAsync(TOKEN_KEY),
              SecureStore.deleteItemAsync(AUTH_STATE_KEY),
            ]);
            setToken(null);
            setAuthState('unauthenticated');
          } else {
            // Never promote an unknown or pending session during an outage.
            setAuthState(isPersistedAuthState(savedState) ? savedState : 'unauthenticated');
          }
        }
      } catch (err) {
        setAuthState('unauthenticated');
      }
    };

    rehydrate();
  }, []);

  const signIn = async (session: MobileAuthSession) => {
    const nextState: PersistedAuthState = session.passkeyRequired
      ? 'passkeyPending'
      : session.user.onboardingComplete
        ? 'ready'
        : 'onboardingPending';
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, session.accessToken),
      SecureStore.setItemAsync(AUTH_STATE_KEY, nextState),
    ]);
    setToken(session.accessToken);
    setAuthState(nextState);
  };

  const completePasskeyHandoff = async () => {
    setAuthState('loading');
    try {
      const session = await getCurrentUser();
      const nextState = resolveAuthSessionState(session);
      await SecureStore.setItemAsync(AUTH_STATE_KEY, nextState);
      setAuthState(nextState);
    } catch (err) {
      setAuthState('passkeyPending');
    }
  };

  const completeOnboarding = () => {
    void SecureStore.setItemAsync(AUTH_STATE_KEY, 'ready');
    setAuthState('ready');
  };

  const signOut = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(AUTH_STATE_KEY),
    ]);
    setToken(null);
    setAuthState('unauthenticated');
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        authState,
        signIn,
        signOut,
        completePasskeyHandoff,
        completeOnboarding
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
