import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { ModerationLayout } from "./layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, ShieldAlert, FileText, CheckCircle2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useGetModerationAppeal,
  useDecideModerationAppeal,
  getGetModerationAppealQueryKey,
  AppealDecisionInputDecision
} from "@workspace/api-client-react";
import { Link } from "wouter";

export default function ModerationAppealView({ params }: { params: { id: string } }) {
  const appealId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useGetModerationAppeal(appealId, {
    query: {
      enabled: !isNaN(appealId),
      queryKey: getGetModerationAppealQueryKey(appealId)
    }
  });

  const decideAppeal = useDecideModerationAppeal();

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decision, setDecision] = useState<AppealDecisionInputDecision | "">("");
  const [reason, setReason] = useState("");

  if (error) {
    const err = error as any;
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      return (
        <ModerationLayout>
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive opacity-80" />
            <div>
              <h2 className="text-xl font-bold">Access Denied</h2>
              <p className="text-muted-foreground mt-2 max-w-md">
                You do not have the required operator clearance to view or decide this appeal.
              </p>
            </div>
            <Button onClick={() => setLocation("/moderation/appeals")} variant="outline" className="mt-4">
              Return to Appeals
            </Button>
          </div>
        </ModerationLayout>
      );
    }
    return (
      <ModerationLayout>
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
          <p>Error loading appeal: {err?.message}</p>
        </div>
      </ModerationLayout>
    );
  }

  const handleDecide = () => {
    if (!data || !decision) return;
    
    decideAppeal.mutate({
      appealId,
      data: {
        decision: decision as AppealDecisionInputDecision,
        reason
      }
    }, {
      onSuccess: () => {
        setDecisionOpen(false);
        setDecision("");
        setReason("");
        queryClient.invalidateQueries({ queryKey: getGetModerationAppealQueryKey(appealId) });
        toast({ title: "Appeal decision recorded" });
      },
      onError: (err: any) => {
        if (err?.response?.status === 403) {
          toast({ 
            title: "Access Denied", 
            description: "You do not have permission to perform this specific action (e.g. revoke sanction).", 
            variant: "destructive" 
          });
          setDecisionOpen(false);
        } else {
          toast({ title: "Failed to decide appeal", description: err.message, variant: "destructive" });
        }
      }
    });
  };

  const isDestructive = decision === "revoke_sanction" || decision === "restore";

  return (
    <ModerationLayout>
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/moderation/appeals")} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Appeal #{appealId}</h1>
          {data && (
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold uppercase text-muted-foreground">
              {data.appeal.status}
            </span>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex justify-between items-start mb-4 border-b border-border pb-2">
                <h2 className="text-lg font-semibold">Appeal Details</h2>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/moderation/cases/${data.appeal.caseId}`}>View Original Case</Link>
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div>
                  <p className="text-muted-foreground font-medium">Original Case ID</p>
                  <p>#{data.appeal.caseId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium">Submitted At</p>
                  <p>{format(new Date(data.appeal.createdAt), "MMM d, yyyy HH:mm")}</p>
                </div>
              </div>
              
              <div>
                <p className="text-muted-foreground font-medium text-sm mb-2">Appellant Statement</p>
                <div className="p-4 bg-secondary/30 rounded-lg text-sm whitespace-pre-wrap border border-border/50">
                  {data.appeal.statement}
                </div>
              </div>
            </div>

            {data.appeal.status === 'decided' || data.appeal.status === 'upheld' ? (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Outcome</h2>
                <div className="flex items-center gap-3 mb-4">
                  {data.appeal.status === 'upheld' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-sm font-semibold text-destructive">
                      <ShieldAlert className="h-4 w-4" /> Upheld (Denied)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm font-semibold text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> {data.appeal.decision === 'restore' ? 'Content Restored' : data.appeal.decision === 'revoke_sanction' ? 'Sanction Revoked' : 'Dismissed'}
                    </span>
                  )}
                </div>
                {data.appeal.decidedBy && (
                  <p className="text-sm text-muted-foreground">
                    Decided by <span className="font-medium">{data.appeal.decidedBy}</span> on {data.appeal.decidedAt ? format(new Date(data.appeal.decidedAt as string), "MMM d, yyyy HH:mm") : 'Unknown Date'}.
                  </p>
                )}
              </div>
            ) : null}

          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sticky top-20">
              <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Operator Panel</h2>
              
              <div className="space-y-4">
                <div className="pt-2">
                  {data.appeal.status === "open" ? (
                    <div className="space-y-3">
                      <Button onClick={() => setDecisionOpen(true)} className="w-full" variant="default" data-testid="button-decide-appeal">
                        Record Appeal Decision
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      This appeal has already been processed.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decision Dialog */}
      <Dialog.Root open={decisionOpen} onOpenChange={setDecisionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
            <Dialog.Title className="text-xl font-bold">Record Appeal Decision</Dialog.Title>
            <div className="mt-4 space-y-4">
              <Select value={decision} onValueChange={(v) => setDecision(v as AppealDecisionInputDecision)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uphold">Uphold (Deny Appeal)</SelectItem>
                  <SelectItem value="dismiss">Dismiss (Invalid Appeal)</SelectItem>
                  <SelectItem value="restore" className="text-amber-500 font-medium">Restore Content</SelectItem>
                  <SelectItem value="revoke_sanction" className="text-destructive font-medium">Revoke Sanction</SelectItem>
                </SelectContent>
              </Select>
              
              <Textarea 
                placeholder="Required reasoning for audit log..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border/60 pt-4">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={decideAppeal.isPending} data-testid="button-cancel-appeal-decision">Cancel</Button>
              </Dialog.Close>
              <Button 
                onClick={handleDecide} 
                disabled={!decision || !reason || decideAppeal.isPending}
                variant={isDestructive ? "destructive" : "default"}
                data-testid="button-confirm-appeal-decision"
              >
                {decideAppeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Decision
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </ModerationLayout>
  );
}
