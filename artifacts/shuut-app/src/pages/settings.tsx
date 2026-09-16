import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import {
  getGetCurrentUserQueryKey,
  getGetProfileQueryKey,
  getListPasskeyDevicesQueryKey,
  useDeleteAccount,
  useGetProfile,
  useListPasskeyDevices,
  useLogout,
  useRemovePasskeyDevice,
  useUpdateProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Fingerprint, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  const { data: passkeyData, isLoading, error } = useListPasskeyDevices();
  const { data: profile } = useGetProfile("me");
  const removePasskey = useRemovePasskeyDevice();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletionState, setDeletionState] = useState<"pending" | "failed" | null>(null);

  const setPreviewTranscript = (previewTranscript: boolean) => {
    if (!profile) return;

    updateProfile.mutate(
      {
        handle: "me",
        data: {
          name: profile.founder.name,
          handle: profile.founder.handle,
          bio: profile.founder.bio ?? "",
          location: profile.founder.location ?? "",
          website: profile.founder.website ?? "",
          previewTranscript,
        },
      },
      {
        onSuccess: (updatedProfile) => {
          queryClient.setQueryData(getGetProfileQueryKey("me"), updatedProfile);
          toast({
            title: previewTranscript ? "Transcript preview enabled" : "Transcript preview disabled",
          });
        },
        onError: (caught) => {
          toast({
            title: "Could not update transcript preference",
            description: caught instanceof Error ? caught.message : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

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

  const deleteAccountPermanently = () => {
    deleteAccount.mutate(undefined, {
      onSuccess: (result) => {
        if (result.status !== "completed") {
          setDeletionState(result.status);
          setDeleteConfirm("");
          toast({
            title: result.status === "failed" ? "Account deletion needs attention" : "Account deletion is in progress",
            description: result.status === "failed"
              ? "Secure file cleanup will retry automatically. You can type DELETE again to retry now."
              : "Your account is locked while private recordings are securely removed.",
            variant: result.status === "failed" ? "destructive" : "default",
          });
          return;
        }
        toast({ title: "Account deleted" });
        logout.mutate(undefined, {
          onSettled: () => {
            queryClient.clear();
            window.location.replace(import.meta.env.BASE_URL);
          },
        });
      },
      onError: (caught) => {
        setDeletionState("failed");
        setDeleteConfirm("");
        toast({
          title: "Could not delete account",
          description: caught instanceof Error ? caught.message : "Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Layout>
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 px-5 py-4 backdrop-blur-md">
        <h1 className="text-xl font-bold">Settings</h1>
      </header>
      <section className="space-y-6 p-5">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-5">
          <div>
            <h2 className="font-semibold">Preview transcript before publishing</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Review and edit the generated text before your SHÜÜT goes live.
            </p>
          </div>
          <Switch
            checked={profile?.founder.previewTranscript ?? false}
            onCheckedChange={setPreviewTranscript}
            disabled={!profile || updateProfile.isPending}
            aria-label="Preview transcript before publishing"
          />
        </div>

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
          {passkeyData?.devices.length === 0 && (
            <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">No passkeys are currently enrolled.</p>
          )}
          <div className="mt-5 divide-y divide-border/60">
            {passkeyData?.devices.map((device) => (
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

        <div className="rounded-2xl border border-destructive/40 bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-destructive/10 p-2.5 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Delete account</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Permanently delete your SHÜÜT account and all associated content. This action cannot be undone.
              </p>
            </div>
          </div>
          <Dialog.Root open={deleteDialogOpen} onOpenChange={(open) => {
            if (deleteAccount.isPending) return;
            setDeleteDialogOpen(open);
            if (!open) {
              setDeleteConfirm("");
              setDeletionState(null);
            }
          }}>
            <Dialog.Trigger asChild>
              <Button variant="destructive" className="mt-5 w-full rounded-full">
                Delete account
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
                <Dialog.Title className="text-xl font-bold">Permanently delete account?</Dialog.Title>
                <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                  This cannot be undone. You will lose access immediately, and the following will be permanently deleted:
                </Dialog.Description>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Your profile and headshot</li>
                  <li>Your SHÜÜTs and voice comments</li>
                  <li>Your passkeys and account access</li>
                </ul>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Private recordings may continue secure background cleanup briefly after your account is locked.
                </p>
                {deletionState && (
                  <p role="status" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                    {deletionState === "failed"
                      ? "Cleanup encountered a problem and will retry automatically. You may retry below."
                      : "Deletion is in progress. Type DELETE again only if you want to retry cleanup now."}
                  </p>
                )}
                <label htmlFor="delete-account-confirmation" className="mt-5 block text-sm font-medium">
                  Type <span className="font-bold">DELETE</span> to confirm
                </label>
                <Input
                  id="delete-account-confirmation"
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  className="mt-2 h-12"
                />
                <div className="mt-6 flex justify-end gap-3 border-t border-border/60 pt-4">
                  <Dialog.Close asChild>
                    <Button variant="outline" disabled={deleteAccount.isPending}>Cancel</Button>
                  </Dialog.Close>
                  <Button
                    variant="destructive"
                    onClick={deleteAccountPermanently}
                    disabled={deleteConfirm !== "DELETE" || deleteAccount.isPending}
                  >
                    {deleteAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {deletionState ? "Retry deletion" : "Permanently delete"}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </section>
    </Layout>
  );
}