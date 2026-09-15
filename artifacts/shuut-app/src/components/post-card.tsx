import { useEffect, useState } from "react"
import { Link, useLocation } from "wouter"
import { Play, Repeat2, Share, Trash2, Pencil, Loader2, Mic } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { Post, ReactionInputEmojiType } from "@workspace/api-client-react"
import { 
  useSetReaction, 
  useReshuutPost, 
  useDeletePost,
  useUpdatePost,
  useCreatePostShareLink,
  getGetFeedQueryKey 
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AudioPlayer } from "./audio-player"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { PostComments } from "./post-comments"
import { canShowPostDeleteAction } from "@/lib/post-permissions"

interface PostCardProps {
  post: Post
  isDetail?: boolean
  isFocused?: boolean
}

const REACTIONS: { type: ReactionInputEmojiType; emoji: string }[] = [
  { type: "rocket", emoji: "🚀" },
  { type: "laughing", emoji: "😂" },
  { type: "thumbsDown", emoji: "👎" },
]

export function PostCard({ post, isDetail = false, isFocused = false }: PostCardProps) {
  const queryClient = useQueryClient()
  const setReaction = useSetReaction()
  const reshuutPost = useReshuutPost()
  const deletePost = useDeletePost()
  const updatePost = useUpdatePost()
  const createShareLink = useCreatePostShareLink()
  const { toast } = useToast()
  const [, setLocation] = useLocation()
  
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(post.transcript)
  const [canStillEdit, setCanStillEdit] = useState(post.canEdit)
  const [showComments, setShowComments] = useState(isDetail || isFocused)

  useEffect(() => {
    if (isDetail || isFocused) setShowComments(true)
  }, [isDetail, isFocused])

  useEffect(() => {
    setCanStillEdit(post.canEdit)
    if (!post.editableUntil || !post.canEdit) return
    const remaining = new Date(post.editableUntil).getTime() - Date.now()
    const timeout = window.setTimeout(() => {
      setCanStillEdit(false)
      setIsEditing(false)
    }, Math.max(0, remaining))
    return () => window.clearTimeout(timeout)
  }, [post.canEdit, post.editableUntil])

  const handleReaction = (type: ReactionInputEmojiType) => {
    setReaction.mutate(
      { postId: post.id, data: { emojiType: type } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
        }
      }
    )
  }

  const handleReshuut = () => {
    reshuutPost.mutate(
      { postId: post.id },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
      }
    )
  }

  const handleDelete = () => {
    if (!window.confirm("Are you sure you want to delete this SHÜÜT?")) return;
    deletePost.mutate(
      { postId: post.id },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
          toast({
            title: result.status === "completed" ? "Post deleted" : "Post deletion queued",
            description: result.status === "failed"
              ? "Cleanup hit a storage error and will retry automatically."
              : result.status === "pending"
                ? "The post is hidden while its recording is removed."
                : undefined,
            variant: result.status === "failed" ? "destructive" : "default",
          })
        },
        onError: () => {
          toast({ title: "Failed to delete", variant: "destructive" })
        }
      }
    )
  }

  const handleEdit = () => {
    if (!editText.trim() || !canStillEdit) return
    updatePost.mutate(
      { postId: post.id, data: { transcript: editText.trim() } },
      {
        onSuccess: () => {
          setIsEditing(false)
          queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
          toast({ title: "SHÜÜT updated" })
        },
        onError: (error) => {
          toast({
            title: "Could not update SHÜÜT",
            description: error instanceof Error ? error.message : "The editing window may have closed.",
            variant: "destructive",
          })
        },
      },
    )
  }

  const shareText = `Listen to ${post.author.name} on SHÜÜT`

  const handleShare = async () => {
    try {
      const { url: shareUrl } = await createShareLink.mutateAsync({ postId: post.id })
      if (navigator.share) {
        await navigator.share({
          title: `${post.author.name} on SHÜÜT`,
          text: shareText,
          url: shareUrl,
        })
        return
      }

      await navigator.clipboard.writeText(shareUrl)
      toast({ title: "Link copied" })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast({ title: "Could not share this post", variant: "destructive" })
    }
  }

  return (
    <article
      id={`post-${post.id}`}
      className={cn(
        "bg-card border-b border-border/40 p-4 transition-colors hover:bg-card/50 scroll-m-20",
        (isDetail || isFocused) ? "border-b-0 pb-6" : "",
        isFocused && "ring-2 ring-primary/20 bg-card/80 rounded-xl my-2 shadow-sm"
      )}
    >
      {post.isReshuuted && post.reshuutedBy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold mb-3 px-1 uppercase tracking-wider">
          <Repeat2 className="w-3.5 h-3.5" />
          <span>{post.reshuutedBy} reshüüted</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href={`/u/${post.author.handle}`} className="flex items-center gap-3 group min-w-0">
            <div
              className="w-11 h-11 rounded-full overflow-hidden transition-transform group-hover:scale-105 active:scale-95 shrink-0 shadow-sm relative"
              style={{ backgroundColor: post.author.avatarColor || '#3B82F6' }}
            >
              {post.author.avatarUrl ? (
                <img src={post.author.avatarUrl} alt={post.author.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg mix-blend-overlay">
                  {post.author.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0 justify-center">
              <div className="truncate font-bold text-[15px] text-foreground group-hover:underline leading-tight pb-0.5">{post.author.name}</div>
              <div className="truncate text-[13px] text-muted-foreground leading-tight">@{post.author.handle}</div>
            </div>
          </Link>
          <Link href={`/p/${post.id}`} className="text-[13px] text-muted-foreground hover:underline whitespace-nowrap shrink-0 self-start pt-1">
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </Link>
        </div>

        {/* Content */}
        <div className="w-full">
          <div className="mb-2">
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  maxLength={5000}
                  autoFocus
                  data-testid={`textarea-edit-post-${post.id}`}
                  className="min-h-28 resize-none text-[15px]"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="rounded-full">Cancel</Button>
                  <Button size="sm" onClick={handleEdit} disabled={updatePost.isPending || !editText.trim() || !canStillEdit} className="rounded-full px-5 font-bold">
                    {updatePost.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => {
                  if (!isDetail && !isFocused) {
                    setLocation(`/u/${post.author.handle}?shuut=${post.id}`)
                  }
                }}
                className={cn(
                  "text-foreground leading-relaxed whitespace-pre-wrap break-words",
                  (isDetail || isFocused) ? "text-[17px] font-medium" : "text-[15px] line-clamp-3 cursor-pointer hover:opacity-80 transition-opacity"
                )}
              >
                {post.transcript}
              </p>
            )}
          </div>

          {post.audioUrl && (
            <div className="mb-2">
              <AudioPlayer audioUrl={post.audioUrl} durationSeconds={post.durationSeconds} compact />
            </div>
          )}

          {!post.audioUrl && (
            <div
              className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
              aria-label={`Recording length: ${post.durationSeconds} seconds`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </span>
              <span>{post.durationSeconds} sec</span>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center gap-1.5 sm:gap-4 mt-1 pt-2 border-t border-border/30 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-1">
            {/* Reactions */}
            <div className="flex items-center gap-1 shrink-0">
              {REACTIONS.map(({ type, emoji }) => {
                const count = post.reactions[type as keyof typeof post.reactions] || 0
                const isActive = post.viewerReaction === type
                
                return (
                  <button
                    key={type}
                    onClick={() => handleReaction(type)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm transition-all hover:bg-secondary active:scale-95",
                      isActive ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground",
                      isActive && "ring-1 ring-primary/30"
                    )}
                    title={type}
                  >
                    <span className="text-base leading-none">{emoji}</span>
                    {count > 0 && <span className="tabular-nums">{count}</span>}
                  </button>
                )
              })}
            </div>

            {/* Comment */}
            <button
              onClick={() => setShowComments(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[15px] font-medium transition-all hover:bg-secondary text-muted-foreground hover:text-foreground active:scale-95 shrink-0"
              title="Comment"
            >
              <Mic className="w-4 h-4" />
              <span className="hidden sm:inline">Reply</span>
            </button>

            <div className="flex-1 min-w-4" />

            {/* Reshüüt */}
            <button
              onClick={handleReshuut}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm transition-all hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground shrink-0",
                post.isReshuuted && "text-green-500 font-medium"
              )}
            >
              <Repeat2 className="w-[18px] h-[18px]" />
              <span className="hidden sm:inline">Reshüüt</span>
            </button>

            <button
              onClick={handleShare}
              aria-label="Share post"
              className="flex w-9 h-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-95 shrink-0"
            >
              <Share className="w-[18px] h-[18px]" />
            </button>

            {canShowPostDeleteAction(post) && canStillEdit && (
              <button
                onClick={() => {
                  setEditText(post.transcript)
                  setIsEditing(true)
                }}
                className="flex w-9 h-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-95 shrink-0"
                title="Edit SHÜÜT"
              >
                <Pencil className="w-[18px] h-[18px]" />
              </button>
            )}

            {canShowPostDeleteAction(post) && (
              <button
                onClick={handleDelete}
                aria-label="Delete SHÜÜT"
                className="flex w-9 h-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive active:scale-95 shrink-0 ml-0.5"
                title="Delete SHÜÜT"
              >
                <Trash2 className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>

          {(showComments) && (
            <PostComments postId={post.id} />
          )}
        </div>
      </div>
    </article>
  )
}
