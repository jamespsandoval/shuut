import { useState, useRef, useEffect, useCallback } from "react"
import { Mic, Square, Loader2, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTime } from "@/lib/utils"
import { useCreatePostComment, useGetVoiceAiConsent } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { AudioPlayer } from "./audio-player"
import { VoiceAiConsentModal } from "./voice-ai-consent-modal"
import { applyCommentConsentDecision, getCommentAutoStartAction } from "@/lib/comment-consent-flow"

const MAX_DURATION = 90
const RECORDING_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
const CONSENT_BYPASS = Symbol("consent-bypass")

function csrfToken() {
  const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("shu_csrf="))
  return entry ? decodeURIComponent(entry.slice("shu_csrf=".length)) : null
}

function getSupportedRecordingType() {
  return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

export function CommentComposer({
  postId,
  onSubmitted,
  onDismiss,
  autoStart = false,
}: {
  postId: number
  onSubmitted: (id: number) => void
  onDismiss: () => void
  autoStart?: boolean
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [isStarting, setIsStarting] = useState(autoStart)
  const [time, setTime] = useState(0)
  const [audioData, setAudioData] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const autoStartedRef = useRef(false)
  const mountedRef = useRef(true)

  const createComment = useCreatePostComment()
  const { data: voiceAiConsent, isLoading: voiceAiConsentLoading, isError: voiceAiConsentError, refetch: refetchVoiceAiConsent } = useGetVoiceAiConsent()
  const { toast } = useToast()

  const [showConsentModal, setShowConsentModal] = useState(false)

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      setIsRecording(false)
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
    }
  }, [isRecording])

  useEffect(() => {
    if (isRecording && time >= MAX_DURATION) {
      stopRecording()
    }
  }, [time, isRecording, stopRecording])

  const startRecording = useCallback(async (bypassMarker?: symbol) => {
    if (isRecording || audioData) return

    if (bypassMarker !== CONSENT_BYPASS) {
      if (voiceAiConsentLoading) {
        toast({
          title: "Checking permissions...",
          description: "Please wait a moment.",
          duration: 1500,
        })
        if (!audioData && !isRecording && !isStarting) onDismiss()
        return
      }

      if (voiceAiConsentError || !voiceAiConsent) {
        toast({
          title: "Could not verify permissions",
          description: "Please check your connection and try again.",
          variant: "destructive",
          action: (
            <ToastAction altText="Retry" onClick={() => refetchVoiceAiConsent()}>
              Retry
            </ToastAction>
          ),
        })
        onDismiss()
        return
      }

      if (voiceAiConsent.required) {
        setShowConsentModal(true)
        return
      }
    }

    setIsStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const supportedType = getSupportedRecordingType()
      mediaRecorderRef.current = new MediaRecorder(
        stream,
        supportedType ? { mimeType: supportedType } : undefined,
      )
      chunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorderRef.current.onstop = () => {
        const recorderType = mediaRecorderRef.current?.mimeType || chunksRef.current[0]?.type || "audio/webm"
        const contentType = recorderType.split(";")[0].toLowerCase()
        const currentBlob = new Blob(chunksRef.current, { type: contentType })
        setBlob(currentBlob)
        setAudioData(URL.createObjectURL(currentBlob))
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setIsStarting(false)
      setTime(0)
      setAudioData(null)
      setBlob(null)

      timerRef.current = window.setInterval(() => {
        setTime(prev => prev + 1)
      }, 1000)
    } catch (err) {
      setIsStarting(false)
      onDismiss()
      console.error("Failed to start recording:", err)
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to comment.",
        variant: "destructive"
      })
    }
  }, [audioData, isRecording, isStarting, onDismiss, refetchVoiceAiConsent, toast, voiceAiConsent, voiceAiConsentError, voiceAiConsentLoading])

  useEffect(() => () => {
    mountedRef.current = false
    if (timerRef.current) window.clearInterval(timerRef.current)
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    // Do not consume the one-shot auto-start attempt while the consent query
    // is still pending. Previously this effect called startRecording during
    // the query's loading window; startRecording returned early for safety,
    // but autoStartedRef then prevented a retry and isStarting stayed true
    // forever.
    if (getCommentAutoStartAction(autoStart, autoStartedRef.current, voiceAiConsentLoading) !== "start") return
    autoStartedRef.current = true
    void startRecording()
  }, [autoStart, startRecording, voiceAiConsentLoading])

  const handleCancel = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null
      if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      mediaRecorderRef.current = null
    }
    if (audioData) URL.revokeObjectURL(audioData)
    setAudioData(null)
    setBlob(null)
    setTime(0)
    onDismiss()
  }

  const handleSubmit = async () => {
    if (!blob) return
    setIsUploading(true)

    try {
      const csrf = csrfToken()
      const uploadResponse = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({
          name: "shuut-comment",
          size: blob.size,
          contentType: blob.type,
        }),
      })
      const upload = await uploadResponse.json()
      if (!uploadResponse.ok) throw new Error(upload.error || "Could not prepare upload")

      const putResponse = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": blob.type },
        body: blob,
      })
      if (!putResponse.ok) throw new Error("Upload failed")

      createComment.mutate(
        {
          postId,
          data: {
            audioObjectPath: upload.objectPath,
            durationSeconds: time || 1,
          }
        },
        {
          onSuccess: (res) => {
            handleCancel()
            onSubmitted(res.id)
          },
          onError: () => {
            toast({
              title: "Error",
              description: "Failed to post comment. Try again.",
              variant: "destructive"
            })
          },
          onSettled: () => setIsUploading(false)
        }
      )
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
      setIsUploading(false)
    }
  }

  return (
    <>
      <div className="bg-secondary/20 rounded-3xl p-4 border border-border/50 animate-in fade-in zoom-in-95 shadow-sm">
        {showConsentModal ? null : isStarting || isRecording ? (
          <div className="flex items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-4">
              <div className="w-4 h-4 rounded-full bg-destructive animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <div className="font-mono text-xl tracking-tight text-foreground">{formatTime(time)}</div>
              <div className="text-muted-foreground text-sm font-mono">/ 1:30</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="text-muted-foreground" onClick={handleCancel}>Cancel</Button>
              <Button size="icon" variant="destructive" className="rounded-full w-12 h-12 shadow-lg shadow-destructive/20 hover:scale-105 active:scale-95 transition-all" onClick={stopRecording} disabled={isStarting} aria-label="Stop recording">
                <Square className="w-5 h-5 fill-current" />
              </Button>
            </div>
          </div>
        ) : audioData ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-[15px] font-bold text-foreground">Review comment</span>
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-secondary text-muted-foreground" onClick={handleCancel} disabled={isUploading}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <AudioPlayer audioUrl={audioData} durationSeconds={time} className="bg-background/80 shadow-sm" />
            <div className="flex justify-between items-center mt-1">
              <Button variant="ghost" className="rounded-full px-5 text-muted-foreground hover:text-foreground" onClick={handleCancel} disabled={isUploading}>
                Cancel
              </Button>
              <Button className="rounded-full px-8 font-bold shadow-md active:scale-95 transition-all" onClick={handleSubmit} disabled={isUploading || createComment.isPending}>
                {(isUploading || createComment.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Post Comment
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <VoiceAiConsentModal
        open={showConsentModal}
        status={voiceAiConsent}
        onAccepted={() => applyCommentConsentDecision("accepted", {
          closeDisclosure: () => setShowConsentModal(false),
          dismissComposer: onDismiss,
          startRecording: () => { void startRecording(CONSENT_BYPASS) },
        })}
        onDecline={() => applyCommentConsentDecision("declined", {
          closeDisclosure: () => setShowConsentModal(false),
          dismissComposer: onDismiss,
          startRecording: () => { void startRecording(CONSENT_BYPASS) },
        })}
      />
    </>
  )
}
