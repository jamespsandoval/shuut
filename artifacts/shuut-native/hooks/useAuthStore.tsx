import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { setAuthTokenGetter, getCurrentUser, MobileAuthSession, type AuthUser } from "@workspace/api-client-react";
import {
  type AuthState,
  type PersistedAuthState,
  isPersistedAuthState,
  resolveAuthSessionState,
} from "./authState";

const TOKEN_KEY = "shuut_auth_token";
const AUTH_STATE_KEY = "shuut_auth_state";

const authStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  authState: AuthState;
  signIn: (session: MobileAuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: (user: AuthUser) => void;
  refreshSession: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    // Setup the token getter for api-client-react
    setAuthTokenGetter(() => authStorage.getItem(TOKEN_KEY));
    
    const rehydrate = async () => {
      try {
        const [savedToken, savedState] = await Promise.all([
          authStorage.getItem(TOKEN_KEY),
          authStorage.getItem(AUTH_STATE_KEY),
        ]);
        if (!savedToken) {
          setAuthState('unauthenticated');
          return;
        }
        
        setToken(savedToken);
        
        try {
          const session = await getCurrentUser();
          setUser(session.user);
          const nextState = resolveAuthSessionState(session);
          await authStorage.setItem(AUTH_STATE_KEY, nextState);
          setAuthState(nextState);
        } catch (err: any) {
          if (err?.status === 401) {
            await Promise.all([
              authStorage.deleteItem(TOKEN_KEY),
              authStorage.deleteItem(AUTH_STATE_KEY),
            ]);
            setToken(null);
            setUser(null);
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
    const nextState: PersistedAuthState = session.user.onboardingComplete ? 'ready' : 'onboardingPending';
    await Promise.all([
      authStorage.setItem(TOKEN_KEY, session.accessToken),
      authStorage.setItem(AUTH_STATE_KEY, nextState),
    ]);
    setToken(session.accessToken);
    setUser(session.user);
    setAuthState(nextState);
  };

  const completeOnboarding = (completedUser: AuthUser) => {
    const nextState = resolveAuthSessionState({ user: completedUser });
    void authStorage.setItem(AUTH_STATE_KEY, nextState);
    setUser(completedUser);
    setAuthState(nextState);
  };

  const signOut = async () => {
    await Promise.all([
      authStorage.deleteItem(TOKEN_KEY),
      authStorage.deleteItem(AUTH_STATE_KEY),
    ]);
    setToken(null);
    setUser(null);
    setAuthState('unauthenticated');
  };

  const refreshSession = async () => {
    const session = await getCurrentUser();
    setUser(session.user);
    const nextState = resolveAuthSessionState(session);
    await authStorage.setItem(AUTH_STATE_KEY, nextState);
    setAuthState(nextState);
    return session.user;
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        authState,
        signIn,
        signOut,
        completeOnboarding,
        refreshSession,
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
