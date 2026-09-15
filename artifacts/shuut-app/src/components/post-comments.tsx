import { useState, useEffect } from "react"
import { useGetPostComments, getGetPostCommentsQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { CommentComposer } from "./comment-composer"
import { AudioPlayer } from "./audio-player"
import { formatDistanceToNow } from "date-fns"
import { Link } from "wouter"
import { Loader2 } from "lucide-react"

export function PostComments({ postId }: { postId: number }) {
  const queryClient = useQueryClient()
  
  type PendingComment = { id: number; timestamp: number; failed?: boolean }
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([])

  const hasActivePending = pendingComments.some(p => !p.failed)

  const { data: comments, isLoading } = useGetPostComments(postId, {
    query: {
      queryKey: getGetPostCommentsQueryKey(postId),
      refetchInterval: hasActivePending ? 3000 : pendingComments.length > 0 ? 10000 : false
    }
  })

  useEffect(() => {
    if (comments) {
      setPendingComments(prev => prev.filter(p => !comments.find(c => c.id === p.id)))
    }
  }, [comments])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      let changed = false
      setPendingComments(prev => {
        const next = prev.filter(p => now - p.timestamp <= 5 * 60 * 1000).map(p => {
          if (!p.failed && now - p.timestamp > 45000) {
            changed = true
            return { ...p, failed: true }
          }
          return p
        })
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")

  return (
    <div className="mt-4 pt-4 border-t border-border/40 flex flex-col gap-6">
      <div className="px-1">
        <CommentComposer 
          postId={postId} 
          onSubmitted={(submissionId) => {
            setPendingComments(prev => [...prev, { id: submissionId, timestamp: Date.now() }])
            queryClient.invalidateQueries({ queryKey: getGetPostCommentsQueryKey(postId) })
          }} 
        />
      </div>

      <div className="flex flex-col gap-5 px-1 pb-2">
        {isLoading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-4" />}
        
        {pendingComments.map(p => (
          p.failed ? (
            <div key={`pending-${p.id}`} className="flex gap-3 items-start animate-in fade-in">
              <div className="w-9 h-9 rounded-full bg-destructive/10 shrink-0 border border-destructive/20 flex items-center justify-center">
                <span className="text-destructive text-lg font-bold">!</span>
              </div>
              <div className="flex-1 bg-destructive/5 border border-destructive/20 rounded-2xl p-4">
                <span className="text-sm font-medium text-destructive">Transcription timed out. Please try recording again.</span>
              </div>
            </div>
          ) : (
            <div key={`pending-${p.id}`} className="flex gap-3 items-start animate-in fade-in">
              <div className="w-9 h-9 rounded-full bg-secondary/50 shrink-0 border border-border/50" />
              <div className="flex-1 bg-secondary/20 border border-border/50 rounded-2xl p-4 flex items-center gap-3">
                <img src={`${basePath}/shuut-comment-processing.png`} alt="Processing" className="w-5 h-5 animate-spin opacity-70" />
                <span className="text-sm font-medium text-muted-foreground">Transcribing comment...</span>
              </div>
            </div>
          )
        ))}

        {comments?.map(comment => (
          <div key={comment.id} className="flex gap-3 items-start group">
            <Link href={`/u/${comment.author.handle}`} className="shrink-0 pt-1">
              <div 
                className="w-9 h-9 rounded-full overflow-hidden transition-transform group-hover:scale-105 active:scale-95 shadow-sm relative"
                style={{ backgroundColor: comment.author.avatarColor || '#3B82F6' }}
              >
                {comment.author.avatarUrl ? (
                  <img src={comment.author.avatarUrl} alt={comment.author.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm mix-blend-overlay">
                    {comment.author.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Link href={`/u/${comment.author.handle}`} className="font-bold text-[15px] text-foreground hover:underline truncate">
                  {comment.author.name}
                </Link>
                <span className="text-[13px] text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-[15px] text-foreground mb-3 whitespace-pre-wrap break-words leading-relaxed">{comment.transcript}</p>
              {comment.audioUrl && (
                <AudioPlayer audioUrl={comment.audioUrl} durationSeconds={comment.durationSeconds} className="py-2 px-2.5 bg-background/50 border border-border/40" />
              )}
            </div>
          </div>
        ))}
        
        {comments?.length === 0 && pendingComments.length === 0 && !isLoading && (
          <div className="text-center py-6 text-muted-foreground text-[15px]">
            No comments yet. Be the first to reply!
          </div>
        )}
      </div>
    </div>
  )
}
