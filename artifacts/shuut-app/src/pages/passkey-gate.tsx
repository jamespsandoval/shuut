import { useEffect, useState, type ReactNode } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Fingerprint, Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";

function csrfToken(): string | null {
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("shu_csrf="));
  return value ? decodeURIComponent(value.slice("shu_csrf=".length)) : null;
}

async function passkeyRequest(path: string, body?: unknown): Promise<any> {
  const csrf = csrfToken();
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "We could not complete passkey verification.");
  }
  return data;
}

function browserError(error: unknown): string {
  const webAuthnError = error as { code?: string; cause?: unknown } | null;
  if (webAuthnError?.cause && webAuthnError.cause !== error) {
    const causeMessage = browserError(webAuthnError.cause);
    if (causeMessage !== "We could not complete passkey verification. Please try again.") return causeMessage;
  }
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "The passkey request was cancelled or timed out. You can try again.";
    if (error.name === "NotSupportedError" || error.name === "SecurityError") {
      return "This browser or device does not support passkeys here. Try a supported browser or device.";
    }
  }
  if (webAuthnError?.code?.includes("NOT_ALLOWED")) {
    return "The passkey request was cancelled or timed out. You can try again.";
  }
  return error instanceof Error ? error.message : "We could not complete passkey verification. Please try again.";
}

export default function PasskeyGate() {
  const { user, isSignedIn, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ pending: boolean; availableAt: string | null; codeExpiresAt: string | null } | null>(null);
  const [code, setCode] = useState("");
  const enroll = Boolean(user && !user.passkeyEnrolled);

  useEffect(() => {
    if (isLoading || !isSignedIn || !user?.onboardingComplete || enroll) return;
    let active = true;
    fetch("/api/auth/passkey/recovery/status", { credentials: "include" })
      .then(async (response) => {
        if (response.ok && active) setRecovery(await response.json());
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enroll, isLoading, isSignedIn, user?.onboardingComplete]);

  if (isLoading) {
    return <GateShell><Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading" /></GateShell>;
  }
  if (!isSignedIn) return <Redirect to="/" />;
  if (!user?.onboardingComplete) return <Redirect to="/" />;
  if (user.passkeyVerified) return <Redirect to="/feed" />;

  const handlePasskey = async () => {
    setError(null);
    if (!window.PublicKeyCredential || !navigator.credentials) {
      setError("This browser or device does not support passkeys here. Try a supported browser or device.");
      return;
    }
    setIsPending(true);
    try {
      if (enroll) {
        const options = await passkeyRequest("/api/auth/passkey/register/options");
        const response = await startRegistration({ optionsJSON: options });
        await passkeyRequest("/api/auth/passkey/register/verify", response);
      } else {
        const options = await passkeyRequest("/api/auth/passkey/assertion/options");
        const response = await startAuthentication({ optionsJSON: options });
        await passkeyRequest("/api/auth/passkey/assertion/verify", response);
      }
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      await queryClient.refetchQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch (caught) {
      setError(browserError(caught));
    } finally {
      setIsPending(false);
    }
  };

  const requestRecovery = async () => {
    setError(null);
    setIsPending(true);
    try {
      setRecovery(await passkeyRequest("/api/auth/passkey/recovery/request"));
    } catch (caught) {
      setError(browserError(caught));
    } finally {
      setIsPending(false);
    }
  };

  const sendRecoveryCode = async () => {
    setError(null);
    setIsPending(true);
    try {
      setRecovery(await passkeyRequest("/api/auth/passkey/recovery/code"));
    } catch (caught) {
      setError(browserError(caught));
    } finally {
      setIsPending(false);
    }
  };

  const confirmRecovery = async () => {
    setError(null);
    setIsPending(true);
    try {
      await passkeyRequest("/api/auth/passkey/recovery/confirm", { code });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      await queryClient.refetchQueries({ queryKey: getGetCurrentUserQueryKey() });
      setRecovery(null);
      setCode("");
    } catch (caught) {
      setError(browserError(caught));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <GateShell>
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          {enroll ? <Fingerprint className="h-8 w-8" /> : <ShieldCheck className="h-8 w-8" />}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {enroll ? "Set up a passkey" : "Verify your passkey"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {enroll
            ? "Add a passkey to help keep your SHÜÜT account secure. You can use your device screen lock or password manager."
            : "Use your passkey to continue to SHÜÜT from this session or device."}
        </p>
        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-destructive/10 px-4 py-3 text-left text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="mt-7 w-full rounded-full" onClick={handlePasskey} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? "Waiting for passkey…" : enroll ? "Set up passkey" : "Continue with passkey"}
        </Button>
        {!enroll && (
          <div className="mt-6 border-t border-border/60 pt-6 text-left">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">Lost every passkey?</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Recovery takes 24 hours. We notify your email immediately, then require a short-lived confirmation code.
                </p>
              </div>
            </div>
            {!recovery?.pending ? (
              <Button variant="outline" className="mt-4 w-full rounded-full" onClick={requestRecovery} disabled={isPending}>
                Start lost-passkey recovery
              </Button>
            ) : new Date(recovery.availableAt || 0).getTime() > Date.now() ? (
              <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-muted-foreground">
                Recovery will be ready after {new Date(recovery.availableAt!).toLocaleString()}.
              </p>
            ) : !recovery.codeExpiresAt || new Date(recovery.codeExpiresAt).getTime() <= Date.now() ? (
              <Button variant="outline" className="mt-4 w-full rounded-full" onClick={sendRecoveryCode} disabled={isPending}>
                Email confirmation code
              </Button>
            ) : (
              <div className="mt-4 space-y-3">
                <label htmlFor="recovery-code" className="text-xs font-medium">Confirmation code</label>
                <input
                  id="recovery-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-center text-lg tracking-[0.3em]"
                />
                <Button variant="destructive" className="w-full rounded-full" onClick={confirmRecovery} disabled={isPending || code.length !== 6}>
                  Reset passkeys and sign out sessions
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </GateShell>
  );
}

function GateShell({ children }: { children: ReactNode }) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <img src={`${basePath}/shuut-logo.png`} alt="SHÜÜT" className="mb-12 h-16 w-auto object-contain" />
        {children}
      </main>
      <Footer />
    </div>
  );
}