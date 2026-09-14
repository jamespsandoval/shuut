import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import {
  getGetCurrentUserQueryKey,
  getListPasskeyDevicesQueryKey,
  useListPasskeyDevices,
  useRemovePasskeyDevice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never used";
}

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
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "We could not add that passkey.");
  return data;
}

export default function SettingsPage() {
  const { data, isLoading, error } = useListPasskeyDevices();
  const removePasskey = useRemovePasskeyDevice();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const addPasskey = async () => {
    setIsAdding(true);
    try {
      const options = await passkeyRequest("/api/auth/passkey/register/options");
      const response = await startRegistration({ optionsJSON: options });
      await passkeyRequest("/api/auth/passkey/register/verify", response);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListPasskeyDevicesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }),
      ]);
      toast({ title: "Passkey added", description: "You can use it to verify future sessions." });
    } catch (caught) {
      toast({
        title: "Could not add passkey",
        description: caught instanceof Error ? caught.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const removeDevice = (id: string, name: string) => {
    if (!window.confirm(`Remove ${name}? You will no longer be able to sign in with this passkey.`)) return;
    setRemovingId(id);
    removePasskey.mutate(
      { credentialId: id },
      {
        onSuccess: async () => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getListPasskeyDevicesQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }),
          ]);
          toast({ title: "Passkey removed", description: `${name} can no longer access your account.` });
        },
        onError: (caught) => {
          toast({
            title: "Could not remove passkey",
            description: caught instanceof Error ? caught.message : "Please try again.",
            variant: "destructive",
          });
        },
        onSettled: () => setRemovingId(null),
      },
    );
  };

  return (
    <Layout>
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 px-5 py-4 backdrop-blur-md">
        <h1 className="text-xl font-bold">Settings</h1>
      </header>
      <section className="p-5">
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2.5 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Passkey devices</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                These devices and password managers can verify new SHÜÜT sessions.
              </p>
            </div>
          </div>
          <Button className="mt-5 w-full rounded-full" onClick={addPasskey} disabled={isAdding}>
            {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add another passkey
          </Button>

          {isLoading && <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-primary" />}
          {error && <p role="alert" className="mt-5 text-sm text-destructive">We could not load your passkeys.</p>}
          {data?.devices.length === 0 && (
            <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">No passkeys are currently enrolled.</p>
          )}
          <div className="mt-5 divide-y divide-border/60">
            {data?.devices.map((device) => (
              <div key={device.id} className="flex items-center gap-3 py-4">
                <Fingerprint className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{device.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Added {formatDate(device.createdAt)} · Last used {formatDate(device.lastUsedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDevice(device.id, device.name)}
                  disabled={removingId === device.id}
                  aria-label={`Remove ${device.name}`}
                >
                  {removingId === device.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}