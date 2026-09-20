import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import { type VoiceAiConsentStatus, useAcceptVoiceAiConsent, getGetVoiceAiConsentQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"

interface VoiceAiConsentModalProps {
  open: boolean;
  status: VoiceAiConsentStatus | undefined;
  onAccepted: () => void;
  onDecline: () => void;
}

export function VoiceAiConsentModal({ open, status, onAccepted, onDecline }: VoiceAiConsentModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const acceptConsent = useAcceptVoiceAiConsent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (!status) return null;

  const handleAccept = () => {
    acceptConsent.mutate({
      data: {
        version: status.currentVersion,
        source: "web"
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetVoiceAiConsentQueryKey() });
        setAcknowledged(false);
        onAccepted();
      },
      onError: (err) => {
        toast({
          title: "Failed to accept consent",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive"
        })
      }
    })
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && !acceptConsent.isPending) {
        setAcknowledged(false);
        onDecline();
      }
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content
          data-testid="disclosure"
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="text-xl font-bold text-foreground">Voice and AI Features</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
            {status.summary}
          </Dialog.Description>

          {status.details.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground list-disc pl-5">
              {status.details.map((detail, i) => (
                <li key={i} className="pl-1">{detail}</li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
            <Checkbox
              id="consent-ack"
              checked={acknowledged}
              onCheckedChange={(c) => setAcknowledged(!!c)}
              data-testid="checkbox"
              className="mt-0.5"
            />
            <label htmlFor="consent-ack" className="text-sm font-medium leading-relaxed cursor-pointer select-none">
              I understand how my voice data is used and agree to proceed.
            </label>
          </div>

          <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-border/60">
            <Button
              variant="outline"
              onClick={() => {
                setAcknowledged(false);
                onDecline();
              }}
              disabled={acceptConsent.isPending}
              data-testid="not-now"
              className="rounded-full px-6"
            >
              Not now
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!acknowledged || acceptConsent.isPending}
              data-testid="accept"
              className="rounded-full px-6 shadow-md"
            >
              {acceptConsent.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Accept and Continue
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
