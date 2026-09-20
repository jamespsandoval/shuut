import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useListEligibleModerationAppeals,
  useListMyModerationAppeals,
  useCreateModerationAppeal,
  getListEligibleModerationAppealsQueryKey,
  getListMyModerationAppealsQueryKey,
  EligibleModerationAppeal
} from "@workspace/api-client-react";

export default function AppealsPage() {
  const { data: eligibleData, isLoading: eligibleLoading } = useListEligibleModerationAppeals();
  const { data: pastData, isLoading: pastLoading } = useListMyModerationAppeals();
  const createAppeal = useCreateModerationAppeal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedCase, setSelectedCase] = useState<EligibleModerationAppeal | null>(null);
  const [statement, setStatement] = useState("");

  const handleAppealSubmit = () => {
    if (!selectedCase || !statement.trim()) return;
    
    createAppeal.mutate(
      { caseId: selectedCase.caseId, data: { statement } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEligibleModerationAppealsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListMyModerationAppealsQueryKey() });
          toast({ title: "Appeal submitted successfully." });
          setSelectedCase(null);
          setStatement("");
        },
        onError: (caught: any) => {
          toast({
            title: "Could not submit appeal",
            description: caught?.message || "Please try again.",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <Layout>
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 px-5 py-4 backdrop-blur-md flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full shrink-0">
          <Link href="/settings"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <h1 className="text-xl font-bold">Appeals</h1>
      </header>

      <div className="p-5 space-y-8">
        <section>
          <h2 className="text-lg font-semibold mb-4">Eligible for Appeal</h2>
          {eligibleLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : eligibleData?.cases.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-muted-foreground">
              <p>You have no recent content removals or sanctions eligible for appeal.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {eligibleData?.cases.map((c) => (
                <div key={c.caseId} className="rounded-2xl border border-border/60 bg-card p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive mb-2">
                        {c.reason}
                      </span>
                      <p className="text-sm text-muted-foreground">
                        {c.targetType === 'post' ? 'SHÜÜT' : 'Comment'} removed
                        {c.contentCreatedAt ? ` • ${formatDistanceToNow(new Date(String(c.contentCreatedAt)))} ago` : ''}
                      </p>
                    </div>
                  </div>
                  {c.contentExcerpt && (
                    <blockquote className="border-l-2 border-border pl-4 my-4 text-sm italic text-muted-foreground">
                      "{c.contentExcerpt}"
                    </blockquote>
                  )}
                  <div className="mt-4 flex justify-end">
                    <Button 
                      variant="outline" 
                      className="rounded-full" 
                      onClick={() => setSelectedCase(c)}
                      disabled={c.alreadyAppealed}
                      data-testid={`button-submit-appeal-${c.caseId}`}
                    >
                      {c.alreadyAppealed ? "Appeal Submitted" : "Submit Appeal"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Past Appeals</h2>
          {pastLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : pastData?.appeals.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card/50 p-8 text-center text-muted-foreground text-sm">
              <p>No past appeals.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pastData?.appeals.map((appeal) => (
                <div key={appeal.id} className="rounded-2xl border border-border/60 bg-card p-5">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-medium text-muted-foreground">Appeal #{appeal.id}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(appeal.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                  <p className="text-sm mt-2 font-medium">Statement:</p>
                  <p className="text-sm text-muted-foreground mt-1 bg-secondary/50 p-3 rounded-xl">{appeal.statement}</p>
                  
                  <div className="mt-4 flex items-center gap-2">
                    {appeal.status === 'open' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
                        <Loader2 className="h-3 w-3 animate-spin" /> In Review
                      </span>
                    )}
                    {appeal.status === 'upheld' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                        <AlertCircle className="h-3 w-3" /> Upheld (Denied)
                      </span>
                    )}
                    {appeal.status === 'decided' && appeal.decision !== 'uphold' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> Restored
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog.Root open={!!selectedCase} onOpenChange={(open) => {
        if (!open && !createAppeal.isPending) {
          setSelectedCase(null);
          setStatement("");
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl animate-in zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-1/2">
            <Dialog.Title className="text-xl font-bold">Submit Appeal</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Please explain why you believe this content was removed in error.
            </Dialog.Description>
            <Textarea
              className="mt-4 min-h-[120px]"
              placeholder="Provide context or explanation..."
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              data-testid="textarea-appeal-statement"
            />
            <div className="mt-6 flex justify-end gap-3 border-t border-border/60 pt-4">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={createAppeal.isPending} data-testid="button-cancel-appeal">Cancel</Button>
              </Dialog.Close>
              <Button onClick={handleAppealSubmit} disabled={!statement.trim() || createAppeal.isPending} data-testid="button-confirm-appeal">
                {createAppeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Layout>
  );
}
