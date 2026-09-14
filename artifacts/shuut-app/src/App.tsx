import { type ReactNode, useEffect, useLayoutEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect
} from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

import Home from '@/pages/home';
import PostDetail from '@/pages/post-detail';
import Profile from '@/pages/profile';
import Explore from '@/pages/explore';
import Landing from '@/pages/landing';
import Onboarding from '@/pages/onboarding';
import About from '@/pages/about';
import Community from '@/pages/community';
import Terms from '@/pages/terms';
import Privacy from '@/pages/privacy';
import Cookies from '@/pages/cookies';
import Contact from '@/pages/contact';
import PasskeyGate from '@/pages/passkey-gate';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function HomeRedirect() {
  const { user, isSignedIn, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isSignedIn) {
    if (!user?.onboardingComplete) {
      return <Onboarding />;
    }
    if (!user.passkeyVerified) {
      return <PasskeyGate />;
    }
    return <Redirect to="/feed" />;
  }

  return <Landing />;
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isSignedIn, isLoading } = useAuth();
  
  return (
    <Route {...rest}>
      {(params) => {
        if (isLoading) {
          return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-background">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          );
        }

        if (isSignedIn) {
          if (!user?.onboardingComplete) {
            return <Redirect to="/" />;
          }
          if (!user.passkeyVerified) {
            return <Redirect to="/passkey" />;
          }
          return <Component params={params} />;
        }
        
        return <Redirect to="/" />;
      }}
    </Route>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/about" component={About} />
        <Route path="/community" component={Community} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/cookies" component={Cookies} />
        <Route path="/contact" component={Contact} />
        <Route path="/passkey" component={PasskeyGate} />
        <ProtectedRoute path="/feed" component={Home} />
        <ProtectedRoute path="/explore" component={Explore} />
        <ProtectedRoute path="/p/:postId" component={PostDetail} />
        <ProtectedRoute path="/u/:handle" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ScrollToTop() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    window.history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location]);

  useEffect(() => {
    return () => {
      window.history.scrollRestoration = 'auto';
    };
  }, []);

  return null;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="shuut-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WouterRouter base={basePath}>
            <ScrollToTop />
            <TooltipProvider>
              <Router />
              <Toaster />
            </TooltipProvider>
          </WouterRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;