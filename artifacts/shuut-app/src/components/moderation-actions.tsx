import { useState } from "react"
import { MoreHorizontal, Flag, Ban, Check, Loader2 } from "lucide-react"
import {
  ReportInputReason,
  ReportInputTargetType,
  useCreateReport,
  useBlockAccount,
  useUnblockAccount,
  useGetBlockStatus,
  getGetBlockStatusQueryKey,
} from "@workspace/api-client-react"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"

const reasons: Array<{ value: ReportInputReason; label: string }> = [
  { value: ReportInputReason.spam, label: "Spam or scams" },
  { value: ReportInputReason.harassment, label: "Harassment or bullying" },
  { value: ReportInputReason.hate, label: "Hateful content" },
  { value: ReportInputReason.sexual_content, label: "Sexual content" },
  { value: ReportInputReason.violence, label: "Violence or threats" },
  { value: ReportInputReason.impersonation, label: "Impersonation" },
  { value: ReportInputReason.other, label: "Something else" },
]

type TargetType = keyof typeof ReportInputTargetType

export function ModerationActions({
  targetType,
  targetId,
  targetLabel,
  authorHandle,
  isSelf = false,
  onBlocked,
}: {
  targetType: TargetType
  targetId: number
  targetLabel: string
  authorHandle: string
  isSelf?: boolean
  onBlocked?: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const report = useCreateReport()
  const block = useBlockAccount()
  const unblock = useUnblockAccount()
  const status = useGetBlockStatus(authorHandle, {
    query: {
      queryKey: getGetBlockStatusQueryKey(authorHandle),
      enabled: !isSelf,
    },
  })
  const [actionsOpen, setActionsOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState<ReportInputReason>(ReportInputReason.spam)
  const [details, setDetails] = useState("")
  const [submitted, setSubmitted] = useState(false)

  if (isSelf) return null
  const blocked = status.data?.blocked === true
  const busy = block.isPending || unblock.isPending

  const submitReport = () => {
    report.mutate(
      { data: { targetType: ReportInputTargetType[targetType], targetId, reason, ...(details.trim() ? { details: details.trim() } : {}) } },
      {
        onSuccess: () => {
          setSubmitted(true)
          toast({ title: "Report submitted", description: "Thanks for helping keep SHÜÜT safe." })
        },
        onError: (error) => toast({ title: "Could not submit report", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }),
      },
    )
  }

  const toggleBlock = () => {
    if (blocked) {
      unblock.mutate({ handle: authorHandle }, { onSuccess: () => { queryClient.invalidateQueries(); toast({ title: `@${authorHandle} unblocked` }) } })
      return
    }
    if (!window.confirm(`Block @${authorHandle}? Their posts and comments will be hidden from you.`)) return
    block.mutate({ handle: authorHandle }, {
      onSuccess: () => {
        queryClient.invalidateQueries()
        toast({ title: `@${authorHandle} blocked` })
        onBlocked?.()
      },
      onError: (error) => toast({ title: "Could not block account", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }),
    })
  }

  return (
    <>
      <div className="shrink-0">
        <Dialog.Root open={actionsOpen} onOpenChange={setActionsOpen}>
          <Dialog.Trigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label={`More actions for ${targetLabel}`} title="More actions">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
              <Dialog.Title className="text-xl font-bold">Actions for {targetLabel}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">Choose an action. Reports are confidential.</Dialog.Description>
              <div className="mt-5 flex flex-col gap-2">
                <Button variant="outline" className="justify-start gap-2" onClick={() => { setActionsOpen(false); setSubmitted(false); setReportOpen(true) }}><Flag className="h-4 w-4" /> Report {targetType}</Button>
                <Button variant="outline" className="justify-start gap-2" onClick={toggleBlock} disabled={busy}><Ban className="h-4 w-4" /> {blocked ? "Unblock account" : `Block @${authorHandle}`}</Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Dialog.Root open={reportOpen} onOpenChange={(open) => { setReportOpen(open); if (!open) setSubmitted(false) }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
              <Dialog.Title className="text-xl font-bold">Report {targetLabel}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">Your identity will not be shared with the account owner.</Dialog.Description>
              {submitted ? <div role="status" className="mt-6 flex items-center gap-2 text-sm text-primary"><Check className="h-5 w-5" /> Report received. Thank you.</div> : <div className="mt-5 space-y-4">
                <div className="space-y-2">{reasons.map(item => <label key={item.value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name={`reason-${targetType}-${targetId}`} checked={reason === item.value} onChange={() => setReason(item.value)} /> {item.label}</label>)}</div>
                <Textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={1000} placeholder="Additional details (optional)" className="min-h-20 resize-none" />
                <div className="flex justify-end gap-2"><Dialog.Close asChild><Button variant="ghost">Cancel</Button></Dialog.Close><Button onClick={submitReport} disabled={report.isPending}>{report.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit report</Button></div>
              </div>}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </>
  )
}