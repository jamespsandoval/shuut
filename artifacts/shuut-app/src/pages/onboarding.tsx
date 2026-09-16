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
import { Footer } from "@/components/footer";

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

export default function Onboarding() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [handle, setHandle] = useState("");
  const [debouncedHandle, setDebouncedHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<boolean | null>(null);
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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedHandle(handle), 350);
    return () => window.clearTimeout(timer);
  }, [handle]);

  const continueToUsername = (event: React.FormEvent) => {
    event.preventDefault();
    const suggested = usernameFromName(firstName.trim(), lastName.trim());
    if (!firstName.trim() || !lastName.trim() || suggested.length < 2) return;
    setHandle(suggested);
    setError(null);
    setStep(2);
  };

  const decide = (eligible: boolean) => {
    const normalizedHandle = handle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
    setHandle(normalizedHandle);
    setError(null);
    setDecision(eligible);
    completeOnboarding.mutate(
      {
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          handle: normalizedHandle,
          eligible,
        },
      },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }),
        onError: (requestError) => {
          setDecision(null);
          setError(errorMessage(requestError));
        },
      },
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-foreground">
      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-[420px] mx-auto">
        <div className="w-full flex flex-col items-center mb-10">
          <img src={`${basePath}/shuut-logo.png`} alt="SHÜÜT" className="h-[100px] w-auto" />
          <p className="-mt-2 text-[17px] font-semibold text-muted-foreground text-center tracking-tight">
            Say what's on your mind
          </p>
        </div>

        <section className="w-full">
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
                    onChange={(event) => setFirstName(event.target.value)}
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
                    onChange={(event) => setLastName(event.target.value)}
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
            <form onSubmit={(event) => { event.preventDefault(); setError(null); setStep(3); }} className="space-y-5">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(1);
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
                    setHandle(
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, "")
                        .slice(0, 30),
                    )
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
            <div className="space-y-5">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">
                  Are you the founder of a technology startup based in Europe (including the UK)?
                </h1>
                <p className="mt-2 text-[15px] font-medium text-muted-foreground">
                  SHÜÜT is currently available to founders of European and UK technology startups. Your answer is final.
                </p>
              </div>
              {error && (
                <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
              )}
              <div className="space-y-3" role="radiogroup" aria-label="Founder eligibility">
                {[{ label: "Yes, I am", value: true }, { label: "No, I’m not", value: false }].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={decision === option.value}
                    disabled={completeOnboarding.isPending}
                    onClick={() => decide(option.value)}
                    className="flex h-16 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-5 text-left text-[16px] font-bold shadow-sm transition hover:border-primary disabled:opacity-60"
                  >
                    {option.label}
                    {decision === option.value && completeOnboarding.isPending
                      ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      : <span className="h-5 w-5 rounded-full border-2 border-slate-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}