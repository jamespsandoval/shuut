import { useRef, useState } from "react"
import { Link, useLocation } from "wouter"
import { formatDistanceToNow } from "date-fns"
import { Loader2, Mic, Repeat2, Share } from "lucide-react"
import type { FeedItem, Post, ReactionInputEmojiType } from "@workspace/api-client-react"
import {
  getGetFeedQueryKey,
  getGetProfileQueryKey,
  getGetReshuutCommentsQueryKey,
  getGetReshuutQueryKey,
  useCreateReshuutShareLink,
  useReshuutReshuut,
  useSetReshuutReaction,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AudioPlayer } from "./audio-player"
import { PostCard } from "./post-card"
import { PostComments } from "./post-comments"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { refreshFeedPages } from "@/lib/feed-refresh"
import { ReshuutVoiceComposer } from "./reshuut-voice-composer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const REACTIONS: { type: ReactionInputEmojiType; emoji: string }[] = [
  { type: "rocket", emoji: "🚀" },
  { type: "laughing", emoji: "😂" },
  { type: "thumbsDown", emoji: "👎" },
]

const INTERACTIVE_SELECTOR = "a, button, input, textarea, select, [role='button'], [data-post-navigation-ignore]"

export function ReshuutCard({ item, isDetail = false, isFocused = false }: {
  item: FeedItem
  isDetail?: boolean
  isFocused?: boolean
}) {
  const reshuut = item.reshuut
  const original = reshuut?.originalPost
  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const setReaction = useSetReshuutReaction()
  const nestedReshuut = useReshuutReshuut()
  const createShareLink = useCreateReshuutShareLink()
  const [showComments, setShowComments] = useState(isDetail || isFocused)
  const [autoStartReply, setAutoStartReply] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const pointerStartedInControl = useRef(false)

  if (
    !reshuut
    || !original
    || reshuut.moderationStatus === "quarantined"
    || reshuut.moderationStatus === "removed"
    || !(
      reshuut.moderationStatus === "approved"
      || reshuut.mode === "text"
      || reshuut.transcriptionStatus === "ready"
    )
  ) return null

  const invalidateReshuutCaches = () => {
    queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
    void refreshFeedPages(queryClient)
    queryClient.invalidateQueries({ queryKey: getGetReshuutQueryKey(reshuut.id) })
    queryClient.invalidateQueries({ queryKey: getGetReshuutCommentsQueryKey(reshuut.id) })
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(reshuut.author.handle) })
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(original.author.handle) })
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey("me") })
  }

  const handleReaction = (type: ReactionInputEmojiType) => {
    setReaction.mutate({ reshuutId: reshuut.id, data: { emojiType: type } }, {
      onSuccess: invalidateReshuutCaches,
      onError: (error) => toast({
        title: "Could not react to reSHÜÜT",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
    })
  }

  const handleReshuut = (data?: { audioObjectPath: string; durationSeconds: number; imageObjectPath?: string }) => {
    nestedReshuut.mutate({ reshuutId: reshuut.id, ...(data ? { data } : {}) }, {
      onSuccess: () => {
        setShowComposer(false)
        invalidateReshuutCaches()
      },
      onError: (error) => toast({
        title: "Could not reSHÜÜT",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
    })
  }

  const handleShare = async () => {
    try {
      const { url } = await createShareLink.mutateAsync({ reshuutId: reshuut.id })
      if (navigator.share) {
        await navigator.share({
          title: `${reshuut.author.name} on SHÜÜT`,
          text: `Listen to ${reshuut.author.name} on SHÜÜT`,
          url,
        })
      } else {
        await navigator.clipboard.writeText(url)
        toast({ title: "Link copied" })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast({ title: "Could not share this reSHÜÜT", variant: "destructive" })
    }
  }

  const openReshuut = (event: React.MouseEvent<HTMLElement>) => {
    const startedInControl = pointerStartedInControl.current
    pointerStartedInControl.current = false
    if (isDetail || event.defaultPrevented || startedInControl || !event.currentTarget.contains(event.target as Node)) return
    if ((event.target as Element).closest(INTERACTIVE_SELECTOR)) return
    const selection = window.getSelection()
    if (selection?.toString() && event.currentTarget.contains(selection.anchorNode)) return
    setLocation(`/r/${reshuut.id}`)
  }

  const originalPost = { ...original, reshuut: null } as Post

  return (
    <article
      id={`reshuut-${reshuut.id}`}
      onClick={openReshuut}
      onPointerDownCapture={(event) => { pointerStartedInControl.current = Boolean((event.target as Element).closest(INTERACTIVE_SELECTOR)) }}
      onPointerCancel={() => { pointerStartedInControl.current = false }}
      onKeyDown={(event) => {
        if (!isDetail && !event.defaultPrevented && event.key === "Enter" && event.target === event.currentTarget) {
          setLocation(`/r/${reshuut.id}`)
        }
      }}
      role={isDetail ? undefined : "link"}
      tabIndex={isDetail ? undefined : 0}
      aria-label={isDetail ? undefined : `View reSHÜÜT by ${reshuut.author.name}`}
      className={cn(
        "bg-card border border-border rounded-xl p-4 transition-colors hover:bg-card/70 scroll-m-20",
        !isDetail && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isDetail ? "pb-6" : "mx-3 my-3",
        isFocused && "ring-2 ring-primary/20 bg-card/80 shadow-sm",
      )}
    >
      <div className="flex flex-col gap-3">
        {reshuut.parentReshuut && (
          <Link
            href={`/r/${reshuut.parentReshuut.id}`}
            className="inline-flex max-w-full items-center gap-2 px-1 text-xs font-semibold text-muted-foreground hover:text-primary hover:underline"
          >
            <Repeat2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">@{reshuut.parentReshuut.author.handle} reshüüted this reSHÜÜT</span>
          </Link>
        )}
        <div className="flex items-center justify-between">
          <Link href={`/u/${reshuut.author.handle}`} className="flex min-w-0 items-center gap-3 group">
            <div
              className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full shadow-sm transition-transform group-hover:scale-105"
              style={{ backgroundColor: reshuut.author.avatarColor || "#3B82F6" }}
            >
              {reshuut.author.avatarUrl ? (
                <img src={reshuut.author.avatarUrl} alt={reshuut.author.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white mix-blend-overlay">
                  {reshuut.author.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold leading-tight group-hover:underline">{reshuut.author.name}</div>
              <div className="truncate text-[13px] text-muted-foreground">@{reshuut.author.handle}</div>
            </div>
          </Link>
          <Link href={`/r/${reshuut.id}`} className="whitespace-nowrap pt-1 text-[13px] text-muted-foreground hover:underline">
            {formatDistanceToNow(new Date(reshuut.createdAt), { addSuffix: true })}
          </Link>
        </div>

        {reshuut.mode === "audio" && reshuut.audioUrl && (
          <div data-post-navigation-ignore>
            <AudioPlayer audioUrl={reshuut.audioUrl} durationSeconds={reshuut.durationSeconds ?? 1} compact />
          </div>
        )}
        {reshuut.mode === "audio" && reshuut.transcriptionStatus === "processing" && (
          <p className="text-xs text-muted-foreground" role="status">Transcribing reSHÜÜT voice note…</p>
        )}
        {reshuut.mode === "audio" && reshuut.text && reshuut.transcriptionStatus === "ready" && (
          <p className="select-text whitespace-pre-wrap break-words text-[15px] leading-relaxed">{reshuut.text}</p>
        )}
        {reshuut.imageUrl && (
          <img src={reshuut.imageUrl} alt={`Photo attached to ${reshuut.author.name}'s reSHÜÜT`}
            className="max-h-[28rem] w-full rounded-xl border border-border/50 object-contain" loading="lazy" />
        )}

        <div className="rounded-xl border border-border bg-background p-2 sm:p-3" data-post-navigation-ignore>
          <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Repeat2 className="h-3.5 w-3.5" />
            Original SHÜÜT
          </div>
          <PostCard post={originalPost} />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border/30 pt-2 sm:gap-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" data-post-navigation-ignore>
          <div className="flex shrink-0 items-center gap-1">
            {REACTIONS.map(({ type, emoji }) => {
              const count = reshuut.reactions[type as keyof typeof reshuut.reactions] || 0
              const active = reshuut.viewerReaction === type
              return (
                <button key={type} type="button" onClick={() => handleReaction(type)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition-all hover:bg-secondary active:scale-95",
                    active ? "bg-primary/10 font-bold text-primary ring-1 ring-primary/30" : "text-muted-foreground",
                  )} title={type}>
                  <span className="text-base leading-none">{emoji}</span>
                  {count > 0 && <span className="tabular-nums">{count}</span>}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => { setAutoStartReply(true); setShowComments(true) }}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[15px] font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground">
            <Mic className="h-4 w-4" /><span className="hidden sm:inline">Reply</span>
          </button>
          <div className="min-w-4 flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={nestedReshuut.isPending || showComposer}
                aria-label="reSHÜÜT options" title="reSHÜÜT options"
                className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground transition-all hover:bg-secondary hover:text-foreground", reshuut.isReshuuted && "font-medium text-green-500")}>
                {nestedReshuut.isPending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Repeat2 className="h-[18px] w-[18px]" />}
                <span className="hidden sm:inline">{reshuut.isReshuuted ? "reSHÜÜTed" : "reSHÜÜT"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => handleReshuut()}><Repeat2 className="mr-2 h-4 w-4" />reSHÜÜT Now</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowComposer(true)}><Mic className="mr-2 h-4 w-4" />Add Voice Note</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" onClick={handleShare} aria-label="Share reSHÜÜT"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-foreground">
            <Share className="h-[18px] w-[18px]" />
          </button>
        </div>

        {showComposer && (
          <ReshuutVoiceComposer
            isPending={nestedReshuut.isPending}
            onCancel={() => setShowComposer(false)}
            onSubmit={(data) => handleReshuut(data)}
          />
        )}

        {showComments && (
          <div data-post-navigation-ignore>
            <PostComments
              postId={original.id}
              reshuutId={reshuut.id}
              autoStartRecording={autoStartReply}
              onComposerClose={() => setAutoStartReply(false)}
            />
          </div>
        )}
      </div>
    </article>
  )
}