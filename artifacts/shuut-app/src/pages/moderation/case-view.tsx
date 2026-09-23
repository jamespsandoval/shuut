import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { ModerationLayout } from "./layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, ShieldAlert, AlertTriangle, ShieldCheck } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useGetModerationCase,
  useClaimModerationCase,
  useDecideModerationCase,
  useCreateModerationSanction,
  getGetModerationCaseQueryKey,
  ModerationDecisionInputDecision,
  SanctionInputType
} from "@workspace/api-client-react";

export default function ModerationCaseView({ params }: { params: { id: string } }) {
  const caseId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useGetModerationCase(caseId, {
    query: {
      enabled: !isNaN(caseId),
      queryKey: getGetModerationCaseQueryKey(caseId)
    }
  });

  const claimCase = useClaimModerationCase();
  const decideCase = useDecideModerationCase();
  const createSanction = useCreateModerationSanction();

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decision, setDecision] = useState<ModerationDecisionInputDecision | "">("");
  const [reason, setReason] = useState("");

  const [sanctionOpen, setSanctionOpen] = useState(false);
  const [sanctionType, setSanctionType] = useState<SanctionInputType | "">("");

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
                You do not have the required operator clearance to view this case.
              </p>
            </div>
            <Button onClick={() => setLocation("/feed")} variant="outline" className="mt-4">
              Return to Feed
            </Button>
          </div>
        </ModerationLayout>
      );
    }
    return (
      <ModerationLayout>
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
          <p>Error loading case: {err?.message}</p>
        </div>
      </ModerationLayout>
    );
  }

  const handleClaim = () => {
    claimCase.mutate({ caseId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetModerationCaseQueryKey(caseId) });
        toast({ title: "Case claimed successfully" });
      },
      onError: (err: any) => {
        if (err?.response?.status === 409) {
          toast({ title: "Case state changed", description: "Reloading case...", variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: getGetModerationCaseQueryKey(caseId) });
        } else {
          toast({ title: "Failed to claim case", description: err.message, variant: "destructive" });
        }
      }
    });
  };

  const handleDecide = () => {
    if (!data || !decision) return;
    
    decideCase.mutate({
      caseId,
      data: {
        decision: decision as ModerationDecisionInputDecision,
        reason,
        version: data.case.version
      }
    }, {
      onSuccess: () => {
        setDecisionOpen(false);
        setDecision("");
        setReason("");
        queryClient.invalidateQueries({ queryKey: getGetModerationCaseQueryKey(caseId) });
        toast({ title: "Decision recorded" });
      },
      onError: (err: any) => {
        if (err?.response?.status === 409) {
          toast({ title: "Conflict", description: "Case was updated by another operator. Review and try again.", variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: getGetModerationCaseQueryKey(caseId) });
          setDecisionOpen(false);
        } else {
          toast({ title: "Failed to decide", description: err.message, variant: "destructive" });
        }
      }
    });
  };

  const handleSanction = () => {
    if (!data || !sanctionType) return;
    
    createSanction.mutate({
      caseId,
      data: {
        type: sanctionType as SanctionInputType,
        reason
      }
    }, {
      onSuccess: () => {
        setSanctionOpen(false);
        setSanctionType("");
        setReason("");
        queryClient.invalidateQueries({ queryKey: getGetModerationCaseQueryKey(caseId) });
        toast({ title: "Sanction applied" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to apply sanction", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <ModerationLayout>
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/moderation")} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Case #{caseId}</h1>
          {data && (
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold uppercase text-muted-foreground">
              {data.case.status}
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
              <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Subject Details</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground font-medium">Target Type</p>
                  <p className="capitalize">{data.case.targetType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium">Target ID</p>
                  <p>{data.case.targetId}</p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-secondary/30 rounded-lg text-sm font-mono overflow-auto max-h-64">
                <pre>{JSON.stringify(data.subject, null, 2)}</pre>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Reports & Signals</h2>
              {data.reports.length === 0 && data.signals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reports or signals.</p>
              ) : (
                <div className="space-y-4">
                  {data.signals.map((sig, idx) => (
                    <div key={`sig-${idx}`} className="p-3 bg-secondary/30 rounded-lg border border-border/50 text-sm flex gap-3 items-start">
                      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <pre className="font-mono whitespace-pre-wrap">{JSON.stringify(sig, null, 2)}</pre>
                    </div>
                  ))}
                  {data.reports.map((rep, idx) => (
                    <div key={`rep-${idx}`} className="p-3 bg-secondary/30 rounded-lg border border-border/50 text-sm flex gap-3 items-start">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <pre className="font-mono whitespace-pre-wrap">{JSON.stringify(rep, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Action Log</h2>
              {data.actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No actions taken yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.actions.map(act => (
                    <div key={act.id} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold uppercase text-xs">{act.action}</span>
                        <span className="text-muted-foreground text-xs">{format(new Date(act.createdAt), "MMM d, yyyy HH:mm")}</span>
                      </div>
                      {act.reason && <p className="text-muted-foreground">{act.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sticky top-20">
              <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Operator Panel</h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div className="text-muted-foreground font-medium">Priority</div>
                  <div className="capitalize">{data.case.priority}</div>
                  <div className="text-muted-foreground font-medium">Age</div>
                  <div>{data.case.ageHours}h</div>
                  <div className="text-muted-foreground font-medium">Due</div>
                  <div>{format(new Date(data.case.dueAt), "MMM d, HH:mm")}</div>
                </div>

                <div className="pt-4 border-t border-border">
                  {data.case.status === "open" ? (
                    <Button onClick={handleClaim} className="w-full font-bold" disabled={claimCase.isPending} data-testid="button-claim-case">
                      {claimCase.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                      Claim Case
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <Button onClick={() => setDecisionOpen(true)} className="w-full" variant="default" data-testid="button-record-decision">
                        Record Decision
                      </Button>
                      <Button onClick={() => setSanctionOpen(true)} className="w-full" variant="destructive" data-testid="button-apply-sanction">
                        Apply Sanction
                      </Button>
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
            <Dialog.Title className="text-xl font-bold">Record Decision</Dialog.Title>
            <div className="mt-4 space-y-4">
              <Select value={decision} onValueChange={(v) => setDecision(v as ModerationDecisionInputDecision)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve (Safe)</SelectItem>
                  <SelectItem value="dismiss">Dismiss (No action)</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                  <SelectItem value="quarantine" className="text-amber-500 font-medium">Quarantine</SelectItem>
                  <SelectItem value="remove" className="text-destructive font-medium">Remove Content</SelectItem>
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
                <Button variant="outline" disabled={decideCase.isPending} data-testid="button-cancel-decision">Cancel</Button>
              </Dialog.Close>
              <Button 
                onClick={handleDecide} 
                disabled={!decision || decideCase.isPending}
                variant={(decision === "remove" || decision === "quarantine") ? "destructive" : "default"}
                data-testid="button-confirm-decision"
              >
                {decideCase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Decision
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Sanction Dialog */}
      <Dialog.Root open={sanctionOpen} onOpenChange={setSanctionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
            <Dialog.Title className="text-xl font-bold text-destructive">Apply Sanction</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              This action applies account-level penalties. It requires confirmation.
            </Dialog.Description>
            <div className="mt-4 space-y-4">
              <Select value={sanctionType} onValueChange={(v) => setSanctionType(v as SanctionInputType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sanction..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warning">Official Warning</SelectItem>
                  <SelectItem value="suspend" className="text-amber-500 font-medium">Suspend Account</SelectItem>
                  <SelectItem value="ban" className="text-destructive font-medium">Permanent Ban</SelectItem>
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
                <Button variant="outline" disabled={createSanction.isPending} data-testid="button-cancel-sanction">Cancel</Button>
              </Dialog.Close>
              <Button 
                onClick={handleSanction} 
                disabled={!sanctionType || !reason || createSanction.isPending}
                variant="destructive"
                data-testid="button-confirm-sanction"
              >
                {createSanction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Apply Sanction
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ModerationLayout>
  );
}
