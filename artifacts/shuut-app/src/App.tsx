import { lazy, Suspense, type ReactNode, useEffect, useLayoutEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect
} from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AnalyticsProvider, useAnalytics } from '@/lib/analytics';
import { Loader2 } from 'lucide-react';

import Landing from '@/pages/landing';

const NotFound = lazy(() => import('@/pages/not-found'));
const Home = lazy(() => import('@/pages/home'));
const PostDetail = lazy(() => import('@/pages/post-detail'));
const Profile = lazy(() => import('@/pages/profile'));
const Explore = lazy(() => import('@/pages/explore'));
const Onboarding = lazy(() => import('@/pages/onboarding'));
const About = lazy(() => import('@/pages/about'));
const Community = lazy(() => import('@/pages/community'));
const Terms = lazy(() => import('@/pages/terms'));
const Privacy = lazy(() => import('@/pages/privacy'));
const Cookies = lazy(() => import('@/pages/cookies'));
const Contact = lazy(() => import('@/pages/contact'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const NotificationsPage = lazy(() => import('@/pages/notifications'));
const Waitlist = lazy(() => import('@/pages/waitlist'));
const LegalConsentGate = lazy(() => import('@/pages/legal-consent-gate'));
const ModerationDashboard = lazy(() => import('@/pages/moderation/dashboard'));
const ModerationCaseView = lazy(() => import('@/pages/moderation/case-view'));
const ModerationAppealView = lazy(() => import('@/pages/moderation/appeal-view'));
const AppealsPage = lazy(() => import('@/pages/appeals/index'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function RootRoute() {
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
      return <Redirect to="/onboarding/name" />;
    }
    if (user.legalPolicyConsent?.required) {
      return <LegalConsentGate />;
    }
    return <Home />;
  }

  return <Landing />;
}

function LegacyFeedRedirect() {
  return <Redirect to={`/${window.location.search}${window.location.hash}`} replace />;
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
            return <Redirect to="/onboarding/name" />;
          }
          if (user?.legalPolicyConsent?.required) {
            return <LegalConsentGate />;
          }
          return <Component params={params} />;
        }
        
        return <Redirect to="/" />;
      }}
    </Route>
  );
}

function OnboardingRoute({ params }: { params: { step: string } }) {
  const { user, isSignedIn, isLoading } = useAuth();
  if (isLoading) return <RouteLoadingFallback />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (user?.onboardingComplete) return <Redirect to="/" />;
  if (!["name", "username", "source"].includes(params.step)) return <Redirect to="/onboarding/name" />;
  return <Onboarding stepName={params.step as "name" | "username" | "source"} />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Switch>
          <Route path="/" component={RootRoute} />
          <Route path="/about" component={About} />
          <Route path="/community" component={Community} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/cookies" component={Cookies} />
          <Route path="/contact" component={Contact} />
          <Route path="/onboarding/:step" component={OnboardingRoute} />
          <Route path="/feed" component={LegacyFeedRedirect} />
          <ProtectedRoute path="/notifications" component={NotificationsPage} />
          <ProtectedRoute path="/explore" component={Explore} />
          <ProtectedRoute path="/p/:postId" component={PostDetail} />
          <ProtectedRoute path="/u/:handle" component={Profile} />
          <ProtectedRoute path="/settings" component={SettingsPage} />
          <ProtectedRoute path="/moderation" component={ModerationDashboard} />
          <ProtectedRoute path="/moderation/appeals" component={ModerationDashboard} />
          <ProtectedRoute path="/moderation/cases/:id" component={ModerationCaseView} />
          <ProtectedRoute path="/moderation/appeals/:id" component={ModerationAppealView} />
          <ProtectedRoute path="/appeals" component={AppealsPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function RouteLoadingFallback() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
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

function AnalyticsRouteTracker() {
  const [location] = useLocation();
  const { isSignedIn, user } = useAuth();
  const { active, capture } = useAnalytics();
  useEffect(() => {
    if (!active) return;
    const firstSegment = location.slice(1).split('/')[0];
    const knownScreens = ['feed', 'settings', 'notifications', 'explore', 'about', 'community', 'terms', 'privacy', 'cookies', 'contact', 'appeals'];
    const screen = location.startsWith('/p/') ? 'post'
      : location.startsWith('/u/') ? 'profile'
      : location.startsWith('/onboarding/') ? 'onboarding'
      : location.startsWith('/moderation') ? 'moderation'
      : location === '/' ? (isSignedIn && user?.onboardingComplete ? 'feed' : 'home')
      : knownScreens.includes(firstSegment) ? firstSegment : 'other';
    capture('screen_viewed', { screen });
    capture('$pageview', { screen });
  }, [location, isSignedIn, user?.onboardingComplete, active, capture]);
  return null;
}

function App() {
  useEffect(() => {
    // Retire browser audio saved by the removed voice-draft recovery feature.
    try {
      const request = indexedDB.deleteDatabase('shuut-voice-draft');
      request.onerror = () => console.warn('Could not clear retired voice draft storage.');
      request.onblocked = () => console.warn('Close other SHÜÜT tabs to clear retired voice draft storage.');
    } catch {
      // IndexedDB may be unavailable in restricted browsing contexts.
    }
  }, []);

  return (
    <ThemeProvider defaultTheme="light" storageKey="shuut-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WouterRouter base={basePath}>
            <AnalyticsProvider>
              <ScrollToTop />
              <AnalyticsRouteTracker />
              <TooltipProvider>
                <Router />
                <Toaster />
              </TooltipProvider>
            </AnalyticsProvider>
          </WouterRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
