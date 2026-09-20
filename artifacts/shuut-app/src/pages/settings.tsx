import { useState } from "react";
import {
  getGetProfileQueryKey,
  useDeleteAccount,
  useGetProfile,
  useLogout,
  useUpdateProfile,
  useListBlockedAccounts,
  useUnblockAccount,
  getListBlockedAccountsQueryKey,
  useGetVoiceAiConsent,
  useRevokeVoiceAiConsent,
  getGetVoiceAiConsentQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function SettingsPage() {
  const { data: profile } = useGetProfile("me");
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: blockedAccounts, isLoading: blockedLoading } = useListBlockedAccounts();
  const unblockAccount = useUnblockAccount();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletionState, setDeletionState] = useState<"pending" | "failed" | null>(null);

  const { data: voiceAiConsent, isLoading: voiceAiConsentLoading } = useGetVoiceAiConsent();
  const revokeVoiceAiConsent = useRevokeVoiceAiConsent();
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);

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

  const unblock = (handle: string) => {
    unblockAccount.mutate({ handle }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBlockedAccountsQueryKey() });
        toast({ title: `@${handle} unblocked` });
      },
      onError: (caught) => toast({
        title: "Could not unblock account",
        description: caught instanceof Error ? caught.message : "Please try again.",
        variant: "destructive",
      }),
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
          <h2 className="font-semibold">Account standing & appeals</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Review your moderation history and submit appeals for content removals or account sanctions.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-full">
            <Link href="/appeals">View appeals</Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <h2 className="font-semibold">Blocked accounts</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Blocked profiles are hidden from your feed. You can restore access here.
          </p>
          <div className="mt-4 divide-y divide-border/50">
            {blockedLoading && <p className="py-3 text-sm text-muted-foreground">Loading blocked accounts…</p>}
            {!blockedLoading && blockedAccounts?.length === 0 && <p className="py-3 text-sm text-muted-foreground">No blocked accounts.</p>}
            {blockedAccounts?.map(account => (
              <div key={account.handle} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{account.name}</p>
                  <p className="truncate text-sm text-muted-foreground">@{account.handle}</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => unblock(account.handle)} disabled={unblockAccount.isPending}>
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <h2 className="font-semibold">Voice & AI Data</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Manage your consent for voice recording and AI transcription features. <Link href="/privacy" className="underline hover:text-primary">Privacy Policy</Link>.
          </p>

          {!voiceAiConsentLoading && voiceAiConsent && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-col gap-1 rounded-xl bg-secondary/20 p-4 border border-border/50">
                <div className="text-sm font-medium">Status</div>
                <div className="text-sm text-muted-foreground">
                  {voiceAiConsent.revokedAt ? (
                    <>Revoked on {new Date(voiceAiConsent.revokedAt).toLocaleDateString()}</>
                  ) : voiceAiConsent.required ? (
                    voiceAiConsent.acceptedVersion ? "Update required" : "Not accepted"
                  ) : voiceAiConsent.acceptedVersion ? (
                    <>Accepted (Version {voiceAiConsent.acceptedVersion}) on {voiceAiConsent.acceptedAt ? new Date(voiceAiConsent.acceptedAt).toLocaleDateString() : "unknown"}</>
                  ) : (
                    "Not accepted"
                  )}
                </div>
              </div>

              {voiceAiConsent.canRevoke && !voiceAiConsent.revokedAt && (
                <Dialog.Root open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
                  <Dialog.Trigger asChild>
                    <Button variant="outline" className="rounded-full" data-testid="revoke">
                      Revoke Consent
                    </Button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
                      <Dialog.Title className="text-xl font-bold">Revoke Voice & AI Consent?</Dialog.Title>
                      <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                        Are you sure you want to revoke your consent? This will stop future recording and transcription, but does not delete your existing posts or safety records.
                      </Dialog.Description>

                      <div className="mt-6 flex justify-end gap-3 border-t border-border/60 pt-4">
                        <Dialog.Close asChild>
                          <Button variant="outline" disabled={revokeVoiceAiConsent.isPending}>Cancel</Button>
                        </Dialog.Close>
                        <Button
                          variant="destructive"
                          disabled={revokeVoiceAiConsent.isPending}
                          onClick={() => {
                            revokeVoiceAiConsent.mutate(undefined, {
                              onSuccess: () => {
                                queryClient.invalidateQueries({ queryKey: getGetVoiceAiConsentQueryKey() });
                                setRevokeDialogOpen(false);
                                toast({ title: "Consent revoked" });
                              },
                              onError: (err) => {
                                toast({
                                  title: "Could not revoke consent",
                                  description: err instanceof Error ? err.message : "Please try again.",
                                  variant: "destructive"
                                });
                              }
                            });
                          }}
                        >
                          {revokeVoiceAiConsent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Revoke Consent
                        </Button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              )}
            </div>
          )}
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
                  <li>Your account access</li>
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