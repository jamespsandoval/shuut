import { useEffect, useState } from "react"
import { Link } from "wouter"
import { Play, Repeat2, Share, Trash2, MoreHorizontal, Pencil, Loader2 } from "lucide-react"
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

interface PostCardProps {
  post: Post
  isDetail?: boolean
}

const REACTIONS: { type: ReactionInputEmojiType; emoji: string }[] = [
  { type: "goat", emoji: "🐐" },
  { type: "rocket", emoji: "🚀" },
  { type: "laughing", emoji: "😂" },
  { type: "confused", emoji: "😕" },
  { type: "thumbsDown", emoji: "👎" },
]

export function PostCard({ post, isDetail = false }: PostCardProps) {
  const queryClient = useQueryClient()
  const setReaction = useSetReaction()
  const reshuutPost = useReshuutPost()
  const deletePost = useDeletePost()
  const updatePost = useUpdatePost()
  const createShareLink = useCreatePostShareLink()
  const { toast } = useToast()
  
  const [showMenu, setShowMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(post.transcript)
  const [canStillEdit, setCanStillEdit] = useState(post.canEdit)
  const isAuthor = post.editableUntil !== null

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
        onSuccess: (updatedPost) => {
          // Optimistically updating would be better, but invalidating works.
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
    deletePost.mutate(
      { postId: post.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
          toast({ title: "Post deleted" })
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
    <article className={cn(
      "bg-card border-b border-border/40 p-4 transition-colors hover:bg-card/50",
      isDetail ? "border-b-0 pb-6" : ""
    )}>
      {post.isReshuuted && post.reshuutedBy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold mb-3 px-4 uppercase tracking-wider">
          <Repeat2 className="w-3 h-3" />
          <span>{post.reshuutedBy} reshüüted</span>
        </div>
      )}

      <div className="flex gap-4">
        {/* Avatar */}
        <Link href={`/u/${post.author.handle}`} className="shrink-0 pt-1 group">
          <div 
            className="w-12 h-12 rounded-full overflow-hidden transition-transform group-hover:scale-105 active:scale-95"
            style={{ backgroundColor: post.author.avatarColor || '#3B82F6' }}
          >
            <div className="w-full h-full flex items-center justify-center text-white font-bold text-xl mix-blend-overlay">
              {post.author.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <Link href={`/u/${post.author.handle}`} className="group min-w-0">
              <div className="truncate font-bold text-foreground group-hover:underline">{post.author.name}</div>
              <div className="truncate text-sm text-muted-foreground">@{post.author.handle}</div>
            </Link>
            <Link href={`/p/${post.id}`} className="text-xs text-muted-foreground hover:underline whitespace-nowrap ml-2">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            </Link>
          </div>

          <div className="mb-4">
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  maxLength={5000}
                  autoFocus
                  data-testid={`textarea-edit-post-${post.id}`}
                  className="min-h-28 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleEdit} disabled={updatePost.isPending || !editText.trim() || !canStillEdit}>
                    {updatePost.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className={cn(
              "text-foreground leading-relaxed whitespace-pre-wrap break-words",
              isDetail ? "text-xl font-medium" : "text-base"
            )}>
              {post.transcript}
              </p>
            )}
          </div>

          {post.audioUrl && (
            <div className="mb-4">
              <AudioPlayer audioUrl={post.audioUrl} durationSeconds={post.durationSeconds} />
            </div>
          )}

          {!post.audioUrl && (
            <div
              className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground"
              aria-label={`Recording length: ${post.durationSeconds} seconds`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </span>
              <span>{post.durationSeconds} sec</span>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-6 mt-4 pt-3 border-t border-border/30">
            {/* Reactions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {REACTIONS.map(({ type, emoji }) => {
                const count = post.reactions[type as keyof typeof post.reactions] || 0
                const isActive = post.viewerReaction === type
                
                return (
                  <button
                    key={type}
                    onClick={() => handleReaction(type)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1.5 rounded-full text-sm transition-all hover:bg-secondary active:scale-95",
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

            <div className="flex-1" />

            {/* Reshüüt */}
            <button
              onClick={handleReshuut}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground",
                post.isReshuuted && "text-green-500 font-medium"
              )}
            >
              <Repeat2 className="w-4 h-4" />
              <span className="hidden sm:inline">Reshüüt</span>
            </button>

            <button
              onClick={handleShare}
              aria-label="Share post"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-95"
            >
              <Share className="h-4 w-4" />
            </button>

            {/* Options Menu */}
            {isAuthor && <div className="relative ml-2">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-all active:scale-95"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 bottom-full mb-2 bg-popover border border-border shadow-lg rounded-xl p-2 z-50 flex flex-col min-w-[140px] animate-in fade-in zoom-in-95">
                    {canStillEdit && (
                      <button
                        onClick={() => {
                          setShowMenu(false)
                          setEditText(post.transcript)
                          setIsEditing(true)
                        }}
                        className="px-3 py-2 text-sm hover:bg-secondary rounded-md flex items-center gap-2 text-left"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit SHÜÜT
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setShowMenu(false)
                        handleDelete()
                      }}
                      className="px-3 py-2 text-sm hover:bg-destructive/10 text-destructive rounded-md flex items-center gap-2 text-left"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>}
          </div>
        </div>
      </div>
    </article>
  )
}
