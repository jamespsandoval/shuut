import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, AtSign, CheckCircle2, Loader2, UserRound, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  getCheckUsernameAvailabilityQueryKey,
  useCheckUsernameAvailability,
  useCompleteOnboarding,
} from "@workspace/api-client-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";
import { useAnalytics } from "@/lib/analytics";
import { useLocation, Redirect } from "wouter";

function usernameFromName(firstName: string, lastName: string) {
  return `${firstName}_${lastName}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

function errorMessage(error: unknown) {
  const value = error as {
    message?: string;
    error?: string;
    response?: { data?: { error?: string; message?: string } };
  };
  return (
    value?.response?.data?.error ||
    value?.response?.data?.message ||
    value?.error ||
    value?.message ||
    "We could not save your profile. Please try again."
  );
}

type StepName = "name" | "username" | "source";
const DRAFT_KEY = "shuut-onboarding-draft";
function readDraft(): { firstName: string; lastName: string; handle: string; referralSource: string } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}");
    return {
      firstName: typeof saved.firstName === "string" ? saved.firstName : "",
      lastName: typeof saved.lastName === "string" ? saved.lastName : "",
      handle: typeof saved.handle === "string" ? saved.handle : "",
      referralSource: typeof saved.referralSource === "string" ? saved.referralSource : "",
    };
  } catch {
    return { firstName: "", lastName: "", handle: "", referralSource: "" };
  }
}

export default function Onboarding({ stepName }: { stepName: StepName }) {
  const { capture } = useAnalytics();
  const [draft, setDraft] = useState(readDraft);
  const { firstName, lastName, handle, referralSource } = draft;
  const [, navigate] = useLocation();
  const step = stepName === "name" ? 1 : stepName === "username" ? 2 : 3;
  const [debouncedHandle, setDebouncedHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const completeOnboarding = useCompleteOnboarding();
  const validHandle = /^[a-z0-9_]{2,30}$/.test(handle);
  const usernameAvailability = useCheckUsernameAvailability(debouncedHandle, {
    query: {
      queryKey: getCheckUsernameAvailabilityQueryKey(debouncedHandle),
      enabled: step === 2 && /^[a-z0-9_]{2,30}$/.test(debouncedHandle),
      retry: false,
    },
  });
  const usernameConfirmed =
    validHandle &&
    debouncedHandle === handle &&
    usernameAvailability.data?.available === true;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const updateDraft = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    setDraft(next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedHandle(handle), 350);
    return () => window.clearTimeout(timer);
  }, [handle]);

  const continueToUsername = (event: React.FormEvent) => {
    event.preventDefault();
    const suggested = usernameFromName(firstName.trim(), lastName.trim());
    if (!firstName.trim() || !lastName.trim() || suggested.length < 2) return;
    updateDraft({ handle: suggested });
    setError(null);
    navigate("/onboarding/username");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedHandle = handle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
    if (!referralSource.trim() || [...referralSource.trim()].length > 300) return;
    setError(null);
    completeOnboarding.mutate(
      {
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          handle: normalizedHandle,
          referralSource: referralSource.trim(),
          acceptedLegalPolicies: true,
          termsVersion: user?.legalPolicyConsent.terms.currentVersion ?? "",
          communityGuidelinesVersion: user?.legalPolicyConsent.communityGuidelines.currentVersion ?? "",
        },
      },
      {
        onSuccess: () => {
          capture('onboarding_completed');
          sessionStorage.removeItem(DRAFT_KEY);
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        },
        onError: (requestError) => {
          const errorValue = requestError as {
            data?: { code?: string };
          };
          if (errorValue.data?.code === "LEGAL_POLICY_VERSION_MISMATCH") {
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
            setError("The policies changed during registration. Please review the latest Terms of Service and Community Guidelines below, then try again.");
            return;
          }
          setError(errorMessage(requestError));
        },
      },
    );
  };

  if (step > 1 && (!firstName.trim() || !lastName.trim())) return <Redirect to="/onboarding/name" />;
  if (step === 3 && !validHandle) return <Redirect to="/onboarding/username" />;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-foreground">
      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-[840px] mx-auto">
        <div className="w-full flex flex-col items-center mb-10">
          <img src={`${basePath}/shuut-logo.png`} alt="SHÜÜT" className="h-[100px] w-auto" />
          <p className="-mt-2 text-[17px] font-semibold text-muted-foreground text-center tracking-tight">
            <span className="block">Say what’s on your mind.</span>
            <span className="block">Listen, too.</span>
          </p>
        </div>

        <section className={`w-full ${step === 3 ? "max-w-[800px]" : "max-w-[560px]"}`}>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Step {step} of 3
          </p>

          {step === 1 ? (
            <form onSubmit={continueToUsername} className="space-y-5">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">What should we call you?</h1>
                <p className="mt-2 text-[15px] font-medium text-muted-foreground">
                  Add the name you want people to see on SHÜÜT.
                </p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <UserRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={firstName}
                     onChange={(event) => updateDraft({ firstName: event.target.value })}
                    placeholder="First name"
                    autoComplete="given-name"
                    maxLength={40}
                    required
                    autoFocus
                    className="h-14 rounded-xl border-slate-300 bg-white pl-11 text-[15px] font-medium shadow-sm"
                  />
                </div>
                <div className="relative">
                  <UserRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={lastName}
                     onChange={(event) => updateDraft({ lastName: event.target.value })}
                    placeholder="Last name"
                    autoComplete="family-name"
                    maxLength={40}
                    required
                    className="h-14 rounded-xl border-slate-300 bg-white pl-11 text-[15px] font-medium shadow-sm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={!firstName.trim() || !lastName.trim()}
                className="h-14 w-full rounded-xl text-[16px] font-bold"
              >
                Continue
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </form>
          ) : step === 2 ? (
             <form onSubmit={(event) => { event.preventDefault(); setError(null); navigate("/onboarding/source"); }} className="space-y-5">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                   navigate("/onboarding/name");
                }}
                className="flex items-center text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </button>

              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Choose your username</h1>
                <p className="mt-2 text-[15px] font-medium text-muted-foreground">
                  This is how people can find and mention you. Lowercase letters, numbers and
                  underscores only.
                </p>
              </div>

              {error && (
                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900">
                  <AlertDescription className="text-sm font-medium">{error}</AlertDescription>
                </Alert>
              )}

              <div className="relative">
                <AtSign className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={handle}
                  onChange={(event) =>
                     updateDraft({ handle:
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, "")
                        .slice(0, 30),
                     })
                  }
                  placeholder="your_username"
                  autoComplete="username"
                  minLength={2}
                  maxLength={30}
                  pattern="[a-z0-9_]+"
                  required
                  autoFocus
                  className="h-14 rounded-xl border-slate-300 bg-white pl-11 text-[15px] font-medium shadow-sm"
                />
              </div>

              <div className="min-h-6" aria-live="polite">
                {validHandle && (debouncedHandle !== handle || usernameAvailability.isFetching) ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking username…
                  </p>
                ) : usernameConfirmed ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                    Username available
                  </p>
                ) : validHandle && usernameAvailability.data?.available === false ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-red-600">
                    <XCircle className="h-5 w-5" />
                    Username already taken
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                disabled={completeOnboarding.isPending || !usernameConfirmed}
                className="h-14 w-full rounded-xl text-[16px] font-bold"
              >
                {completeOnboarding.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
          ) : (
             <form onSubmit={submit} className="space-y-5">
               <button type="button" onClick={() => navigate("/onboarding/username")} className="flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground">
                 <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
               </button>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">
                   Where did you learn about this app?
                </h1>
                <p className="mt-2 text-[15px] font-medium text-muted-foreground">
                   Tell us in your own words. Names, event links, and URLs are welcome.
                </p>
              </div>
              {error && (
                 <Alert variant="destructive"><AlertDescription>
                   {error}
                   {error.startsWith("The policies changed") && (
                     <span className="mt-2 block">
                       <a href={`${basePath}/terms`} target="_blank" rel="noreferrer" className="underline">Terms of Service</a>
                       {" · "}
                       <a href={`${basePath}/community`} target="_blank" rel="noreferrer" className="underline">Community Guidelines</a>
                     </span>
                   )}
                 </AlertDescription></Alert>
              )}
               <label htmlFor="referral-source" className="sr-only">Where did you learn about this app?</label>
               <Textarea id="referral-source" value={referralSource} onChange={(event) => updateDraft({ referralSource: [...event.target.value].slice(0, 300).join("") })} required autoFocus placeholder="For example: a friend, a Luma event URL, or anywhere else…" className="min-h-32 w-full rounded-xl border-slate-300 p-4 text-[16px]" />
               <p className="text-right text-sm text-muted-foreground">{[...referralSource].length}/300 characters</p>
               <Button type="submit" disabled={completeOnboarding.isPending || !referralSource.trim()} className="h-14 w-full rounded-xl text-[16px] font-bold">
                 {completeOnboarding.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Finish registration"}
               </Button>
             </form>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}