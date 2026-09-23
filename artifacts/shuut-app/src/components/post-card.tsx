import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useLocation } from "wouter"
import { Play, Repeat2, Share, Trash2, Pencil, Loader2, Mic, ImagePlus, X, Square } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { Post, ReactionInputEmojiType } from "@workspace/api-client-react"
import { 
  useSetReaction, 
  useReshuutPost, 
  useDeletePost,
  useUpdatePost,
  useCreatePostShareLink,
  getGetFeedQueryKey,
  getGetPostQueryKey,
  getGetProfileQueryKey,
  useGetVoiceAiConsent,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AudioPlayer } from "./audio-player"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { PostComments } from "./post-comments"
import { canShowPostDeleteAction } from "@/lib/post-permissions"
import { ModerationActions } from "./moderation-actions"
import { VoiceAiConsentModal } from "./voice-ai-consent-modal"
import { ToastAction } from "@/components/ui/toast"

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
  const [autoStartReply, setAutoStartReply] = useState(false)
  const [showReshuutComposer, setShowReshuutComposer] = useState(false)
  const [reshuutImage, setReshuutImage] = useState<File | null>(null)
  const [reshuutImagePreview, setReshuutImagePreview] = useState<string | null>(null)
  const [reshuutImagePath, setReshuutImagePath] = useState<string | null>(null)
  const [reshuutAudioPath, setReshuutAudioPath] = useState<string | null>(null)
  const [reshuutAudioPreview, setReshuutAudioPreview] = useState<string | null>(null)
  const [reshuutDuration, setReshuutDuration] = useState(0)
  const [reshuutRecording, setReshuutRecording] = useState(false)
  const [reshuutUploadProgress, setReshuutUploadProgress] = useState<number | null>(null)
  const reshuutRecorderRef = useRef<MediaRecorder | null>(null)
  const reshuutChunksRef = useRef<Blob[]>([])
  const reshuutTimerRef = useRef<number | null>(null)
  const reshuutRecordingRef = useRef(false)
  const reshuutDiscardRef = useRef(false)
  const reshuutImagePreviewRef = useRef<string | null>(null)
  const reshuutAudioPreviewRef = useRef<string | null>(null)
  const [showReshuutConsent, setShowReshuutConsent] = useState(false)
  const { data: voiceAiConsent, isLoading: voiceAiConsentLoading, isError: voiceAiConsentError, refetch: refetchVoiceAiConsent } = useGetVoiceAiConsent()

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
          queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(post.id) })
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(post.author.handle) })
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey("me") })
        }
      }
    )
  }

  const uploadReshuutFile = async (file: File): Promise<string> => {
    const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("shu_csrf="))?.split("=")[1]
    const response = await fetch("/api/storage/uploads/request-url", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}) },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || "Could not prepare upload")
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open("PUT", payload.uploadURL)
      request.setRequestHeader("Content-Type", file.type)
      request.upload.onprogress = (event) => event.lengthComputable && setReshuutUploadProgress(Math.round(event.loaded / event.total * 100))
      request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("Upload failed"))
      request.onerror = () => reject(new Error("Upload was interrupted"))
      request.send(file)
    })
    return payload.objectPath
  }

  const clearReshuutComposer = useCallback(() => {
    reshuutDiscardRef.current = true
    if (reshuutRecorderRef.current?.state === "recording") reshuutRecorderRef.current.stop()
    reshuutRecorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    if (reshuutTimerRef.current) window.clearInterval(reshuutTimerRef.current)
    if (reshuutImagePreviewRef.current) URL.revokeObjectURL(reshuutImagePreviewRef.current)
    if (reshuutAudioPreviewRef.current) URL.revokeObjectURL(reshuutAudioPreviewRef.current)
    reshuutTimerRef.current = null
    reshuutRecordingRef.current = false
    setReshuutRecording(false)
    setReshuutImage(null); setReshuutImagePreview(null); setReshuutImagePath(null)
    setReshuutAudioPath(null); setReshuutAudioPreview(null); setReshuutDuration(0)
    setReshuutUploadProgress(null)
  }, [])

  useEffect(() => () => clearReshuutComposer(), [clearReshuutComposer])

  const handleReshuut = () => {
    if (post.isReshuuted && !post.reshuut) {
      reshuutPost.mutate({ postId: post.id }, { onSuccess: () => queryClient.invalidateQueries() })
      return
    }
    setShowReshuutComposer((value) => !value)
  }

  const startReshuutRecording = async () => {
    if (reshuutRecording) {
      reshuutRecorderRef.current?.stop()
      reshuutRecorderRef.current?.stream.getTracks().forEach((track) => track.stop())
      return
    }
    if (voiceAiConsentLoading) {
      toast({ title: "Checking permissions…", description: "Please wait a moment." })
      return
    }
    if (voiceAiConsentError || !voiceAiConsent) {
      toast({
        title: "Could not verify permissions",
        description: "Please check your connection and try again.",
        variant: "destructive",
        action: <ToastAction altText="Retry" onClick={() => refetchVoiceAiConsent()}>Retry</ToastAction>,
      })
      return
    }
    if (voiceAiConsent.required) {
      setShowReshuutConsent(true)
      return
    }
    await beginReshuutRecording()
  }

  const beginReshuutRecording = async () => {
    if (reshuutRecordingRef.current) return
    reshuutDiscardRef.current = false
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    reshuutRecorderRef.current = recorder
    reshuutChunksRef.current = []
    recorder.ondataavailable = (event) => { if (event.data.size) reshuutChunksRef.current.push(event.data) }
    recorder.onstop = async () => {
      if (reshuutTimerRef.current) window.clearInterval(reshuutTimerRef.current)
      reshuutTimerRef.current = null
      reshuutRecordingRef.current = false
      setReshuutRecording(false)
      stream.getTracks().forEach((track) => track.stop())
      if (reshuutDiscardRef.current) return
      const blob = new Blob(reshuutChunksRef.current, { type: "audio/webm" })
      const preview = URL.createObjectURL(blob)
      reshuutAudioPreviewRef.current = preview
      setReshuutAudioPreview(preview)
      try {
        setReshuutUploadProgress(0)
        setReshuutAudioPath(await uploadReshuutFile(new File([blob], "reshuut.webm", { type: "audio/webm" })))
      } catch (error) {
        toast({ title: "Audio upload failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
      } finally { setReshuutUploadProgress(null) }
    }
    recorder.start()
    reshuutRecordingRef.current = true
    setReshuutRecording(true); setReshuutDuration(0)
    reshuutTimerRef.current = window.setInterval(() => setReshuutDuration((value) => {
      if (value >= 89) { recorder.stop(); stream.getTracks().forEach((track) => track.stop()); return value }
      return value + 1
    }), 1000)
  }

  const submitReshuut = async () => {
    if (!reshuutAudioPath) {
      toast({ title: "Record a voice note first", variant: "destructive" }); return
    }
    try {
      let imagePath = reshuutImagePath
      if (reshuutImage && !imagePath) {
        setReshuutUploadProgress(0)
        imagePath = await uploadReshuutFile(reshuutImage)
      }
      const data = {
        audioObjectPath: reshuutAudioPath,
        durationSeconds: reshuutDuration || 1,
        ...(imagePath ? { imageObjectPath: imagePath } : {}),
      }
      reshuutPost.mutate({ postId: post.id, data }, { onSuccess: () => { setShowReshuutComposer(false); clearReshuutComposer(); queryClient.invalidateQueries(); }, onError: (error) => toast({ title: "Could not reshüüт", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }) })
    } catch (error) {
      toast({ title: "Photo upload failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally { setReshuutUploadProgress(null) }
  }

  const handleReshuutImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15_000_000) {
      toast({ title: "Invalid image", description: "Choose a JPEG, PNG, or WebP image under 15MB.", variant: "destructive" }); return
    }
    if (reshuutImagePreview) URL.revokeObjectURL(reshuutImagePreview)
    const preview = URL.createObjectURL(file)
    reshuutImagePreviewRef.current = preview
    setReshuutImage(file); setReshuutImagePreview(preview); setReshuutImagePath(null)
  }

  const invalidateReshuut = () => {
    reshuutPost.mutate(
      { postId: post.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
          queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(post.id) })
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(post.author.handle) })
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey("me") })
        }
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
  const reshuutStatus = post.reshuut?.moderationStatus
  const canShowReshuut = Boolean(
    post.reshuut
      && reshuutStatus !== "quarantined"
      && reshuutStatus !== "removed"
      && (reshuutStatus === "approved" || post.reshuut.mode === "text" || post.reshuut.transcriptionStatus === "ready")
  )

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
    <>
    <article
      id={`post-${post.id}`}
      className={cn(
        "bg-card border border-border rounded-xl p-4 transition-colors hover:bg-card/70 scroll-m-20",
        isDetail ? "pb-6" : "mx-3 my-3",
        isFocused && "ring-2 ring-primary/20 bg-card/80 shadow-sm"
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
          <Link href={post.canDelete ? "/u/me" : `/u/${post.author.handle}`} className="flex items-center gap-3 group min-w-0">
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
          <div className="flex items-center gap-1 shrink-0 self-start">
            <Link href={`/p/${post.id}`} className="text-[13px] text-muted-foreground hover:underline whitespace-nowrap pt-1">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            </Link>
            <ModerationActions targetType="post" targetId={post.id} targetLabel="this SHÜÜT" authorHandle={post.author.handle} isSelf={post.canDelete} onBlocked={() => { if (isDetail) setLocation("/") }} />
          </div>
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

          {post.imageUrl && (
            <img src={post.imageUrl} alt={`Photo attached to ${post.author.name}'s SHÜÜT`} className="mb-3 max-h-[28rem] w-full rounded-xl object-cover border border-border/50" loading="lazy" />
          )}

          {canShowReshuut && post.reshuut && (
            <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Repeat2 className="h-3.5 w-3.5" /> ReSHÜÜT commentary
              </div>
              {post.reshuut.mode === "text" && post.reshuut.text && <p className="whitespace-pre-wrap text-sm">{post.reshuut.text}</p>}
              {post.reshuut.mode === "audio" && post.reshuut.audioUrl && (
                <AudioPlayer audioUrl={post.reshuut.audioUrl} durationSeconds={1} compact />
              )}
              {post.reshuut.mode === "audio" && post.reshuut.transcriptionStatus === "processing" && (
                <p className="mt-2 text-xs text-muted-foreground" role="status">Transcribing reSHÜÜT commentary…</p>
              )}
              {post.reshuut.mode === "audio" && post.reshuut.text && post.reshuut.transcriptionStatus === "ready" && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{post.reshuut.text}</p>
              )}
              {post.reshuut.imageUrl && <img src={post.reshuut.imageUrl} alt={`Photo attached to ${post.reshuut.author.name}'s reSHÜÜT`} className="mt-3 max-h-64 w-full rounded-lg object-cover" loading="lazy" />}
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
              onClick={() => {
                if (autoStartReply) return
                setAutoStartReply(true)
                setShowComments(true)
              }}
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

          {showReshuutComposer && (
            <div className="mt-3 rounded-xl border border-border/60 bg-secondary/10 p-3" aria-label="ReSHÜÜT composer">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Add to your reSHÜÜT</p>
                <button type="button" aria-label="Close reSHÜÜT composer" onClick={() => { setShowReshuutComposer(false); clearReshuutComposer() }} className="rounded-full p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
              <div className="mb-3 flex items-center gap-3">
                <Button type="button" variant={reshuutRecording ? "destructive" : "outline"} onClick={() => void startReshuutRecording()} aria-label={reshuutRecording ? "Stop reSHÜÜT recording" : "Record reSHÜÜT voice note"}>
                  {reshuutRecording ? <Square className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                  {reshuutRecording ? `${reshuutDuration}s` : "Record voice note"}
                </Button>
                {reshuutAudioPreview && <audio controls src={reshuutAudioPreview} className="h-9 max-w-[15rem]" />}
                <span className="text-xs text-muted-foreground">Always transcribed</span>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {reshuutImagePreview ? (
                  <div className="relative"><img src={reshuutImagePreview} alt="reSHÜÜT photo preview" className="h-20 w-20 rounded-lg object-cover" /><button type="button" aria-label="Remove reSHÜÜT photo" onClick={() => { URL.revokeObjectURL(reshuutImagePreview); setReshuutImagePreview(null); setReshuutImage(null); setReshuutImagePath(null) }} className="absolute -right-2 -top-2 rounded-full bg-background p-1 border border-border"><X className="h-3 w-3" /></button></div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"><ImagePlus className="h-4 w-4" /> Add photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleReshuutImage} /></label>
                )}
                {reshuutUploadProgress !== null && <span className="text-xs text-muted-foreground" role="status">Uploading… {reshuutUploadProgress}%</span>}
              </div>
              <div className="flex justify-end gap-2">
                {post.isReshuuted && <Button type="button" variant="ghost" onClick={() => { invalidateReshuut(); setShowReshuutComposer(false); clearReshuutComposer() }}>Remove reSHÜÜT</Button>}
                <Button type="button" variant="ghost" onClick={() => { setShowReshuutComposer(false); clearReshuutComposer() }}>Cancel</Button>
                <Button type="button" onClick={() => void submitReshuut()} disabled={reshuutPost.isPending || reshuutUploadProgress !== null || !reshuutAudioPath}>Publish reSHÜÜT</Button>
              </div>
            </div>
          )}

          {(showComments) && (
            <PostComments
              postId={post.id}
              autoStartRecording={autoStartReply}
              onComposerClose={() => setAutoStartReply(false)}
            />
          )}
        </div>
      </div>
    </article>
      <VoiceAiConsentModal
        open={showReshuutConsent}
        status={voiceAiConsent}
        onAccepted={() => {
          setShowReshuutConsent(false)
          void beginReshuutRecording()
        }}
        onDecline={() => setShowReshuutConsent(false)}
      />
    </>
  )
}
