import { createContext, useContext, ReactNode } from 'react';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';

type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  onboardingComplete: boolean;
  eligibilityStatus: 'undecided' | 'eligible' | 'waitlisted';
  passkeyEnrolled: boolean;
  passkeyVerified: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
  isSignedIn: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isLoading, error } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
    }
  });
  
  return (
    <AuthContext.Provider value={{ 
      user: session?.user ?? null, 
      isLoading, 
      error: error as Error | null,
      isSignedIn: !!session?.user
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
