import { forwardRef, useState, useRef, useEffect, useCallback, useImperativeHandle } from "react"
import { Mic, Square, Loader2, Send, ImagePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { cn, formatTime } from "@/lib/utils"
import { type Founder, useCreatePost, useGetProfile, useTranscribeAudio, useGetVoiceAiConsent } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetFeedQueryKey } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { useAnalytics } from "@/lib/analytics"
import { ToastAction } from "@/components/ui/toast"
import { AudioPlayer } from "./audio-player"
import { MentionPicker } from "./mention-picker"
import { VoiceAiConsentModal } from "./voice-ai-consent-modal"
import { useAuth } from "@/hooks/use-auth"
import { discardVoiceDraft, loadVoiceDraft, saveVoiceDraft } from "@/lib/voice-draft"

const MAX_DURATION = 90
const RECORDING_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
const CONSENT_BYPASS = Symbol("consent-bypass")

export type RecorderHandle = {
  startRecording: () => void
}

type RecorderProps = {
  onExpandedChange?: (isExpanded: boolean) => void
  onReviewReady?: () => void
}

function csrfToken() {
  const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("shu_csrf="))
  return entry ? decodeURIComponent(entry.slice("shu_csrf=".length)) : null
}

function getSupportedRecordingType() {
  return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

export const Recorder = forwardRef<RecorderHandle, RecorderProps>(function Recorder(
  { onExpandedChange, onReviewReady },
  ref,
) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")
  const [isRecording, setIsRecording] = useState(false)
  const [time, setTime] = useState(0)
  const [audioData, setAudioData] = useState<string | null>(null)
  const [audioObjectPath, setAudioObjectPath] = useState<string | null>(null)
  const [transcript, setTranscript] = useState("")
  const [pendingRawTranscript, setPendingRawTranscript] = useState<string | null>(null)
  const [rawAccepted, setRawAccepted] = useState(false)
  const [mentionedFounders, setMentionedFounders] = useState<Founder[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageObjectPath, setImageObjectPath] = useState<string | null>(null)
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [recoveredDraft, setRecoveredDraft] = useState(false)
  const [draftSaveFailed, setDraftSaveFailed] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const audioBlobRef = useRef<Blob | null>(null)
  const recordingStartedAtRef = useRef(0)
  const preparingRef = useRef(false)
  const mountedRef = useRef(true)
  const draftGenerationRef = useRef(0)

  const createPost = useCreatePost()
  const { user } = useAuth()
  const { capture } = useAnalytics()
  const transcribeAudio = useTranscribeAudio()
  const { data: profile } = useGetProfile("me")
  const { data: voiceAiConsent, isLoading: voiceAiConsentLoading, isError: voiceAiConsentError, refetch: refetchVoiceAiConsent } = useGetVoiceAiConsent()
  const previewTranscript = profile?.founder.previewTranscript ?? false
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [showConsentModal, setShowConsentModal] = useState(false)

  const prepareRecording = useCallback(async (blob: Blob, existingPath?: string | null) => {
    if (preparingRef.current) return
    const generation = draftGenerationRef.current
    preparingRef.current = true
    setIsPreparing(true)
    try {
      let path = existingPath
      if (!path) {
        const csrf = csrfToken()
        const contentType = blob.type.split(";")[0].toLowerCase()
        const uploadResponse = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
          body: JSON.stringify({ name: "shuut-recording", size: blob.size, contentType }),
        })
        const upload = await uploadResponse.json()
        if (generation !== draftGenerationRef.current) return
        if (!uploadResponse.ok) throw new Error(upload.error || "Could not prepare recording upload")
        const putResponse = await fetch(upload.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        })
        if (generation !== draftGenerationRef.current) return
        if (!putResponse.ok) throw new Error("Recording upload failed")
        path = upload.objectPath
        if (mountedRef.current) setAudioObjectPath(path ?? null)
      }
      if (!path) throw new Error("Recording upload did not return a file path")
      const result = await transcribeAudio.mutateAsync({ data: { audioObjectPath: path } })
      if (!mountedRef.current || generation !== draftGenerationRef.current) return
      if (result.cleanupStatus === "raw") {
        setTranscript("")
        setPendingRawTranscript(result.transcript)
      } else {
        setTranscript(result.transcript)
        setPendingRawTranscript(null)
      }
    } catch (error) {
      if (mountedRef.current && generation === draftGenerationRef.current) toast({
        title: "Could not prepare your recording",
        description: `Your recording is still available to review. ${error instanceof Error ? error.message : "Please try again."}`,
        variant: "destructive",
      })
    } finally {
      if (generation === draftGenerationRef.current) {
        preparingRef.current = false
        if (mountedRef.current) setIsPreparing(false)
      }
    }
  }, [toast, transcribeAudio])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void loadVoiceDraft(user.id).then((draft) => {
      if (cancelled || !draft || audioBlobRef.current) return
      audioBlobRef.current = draft.audio
      setAudioData(URL.createObjectURL(draft.audio))
      setTime(draft.durationSeconds)
      setAudioObjectPath(draft.audioObjectPath)
      setTranscript(draft.transcript)
      setPendingRawTranscript(draft.pendingRawTranscript)
      setRawAccepted(draft.rawAccepted)
      setRecoveredDraft(true)
      requestAnimationFrame(() => onReviewReady?.())
    }).catch(() => {
      if (!cancelled) setDraftSaveFailed(true)
    })
    return () => { cancelled = true }
  }, [user?.id, onReviewReady])

  useEffect(() => {
    if (!user?.id || !audioBlobRef.current || !audioData) return
    const draft = {
      ownerId: user.id,
      audio: audioBlobRef.current,
      durationSeconds: time || 1,
      audioObjectPath,
      transcript,
      pendingRawTranscript,
      rawAccepted,
      savedAt: Date.now(),
    }
    const timer = window.setTimeout(() => {
      void saveVoiceDraft(draft).catch(() => setDraftSaveFailed(true))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [user?.id, audioData, time, audioObjectPath, transcript, pendingRawTranscript, rawAccepted])

  useEffect(() => {
    if (!isRecording && !isSavingDraft) return
    const warnOnReload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warnOnReload)
    return () => window.removeEventListener("beforeunload", warnOnReload)
  }, [isRecording, isSavingDraft])

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
        return
      }

      if (voiceAiConsent.required) {
        setShowConsentModal(true)
        return
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const supportedType = getSupportedRecordingType()
      mediaRecorderRef.current = new MediaRecorder(
        stream,
        supportedType ? { mimeType: supportedType } : undefined,
      )
      chunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorderRef.current.onstop = async () => {
        if (!mountedRef.current) return
        const generation = draftGenerationRef.current
        const recorderType = mediaRecorderRef.current?.mimeType || chunksRef.current[0]?.type || "audio/webm"
        const contentType = recorderType.split(";")[0].toLowerCase()
        const blob = new Blob(chunksRef.current, { type: contentType })
        if (!blob.size) {
          toast({ title: "No audio was recorded", description: "Please try again.", variant: "destructive" })
          return
        }
        const durationSeconds = Math.max(1, Math.ceil((Date.now() - recordingStartedAtRef.current) / 1000))
        audioBlobRef.current = blob
        setTime(durationSeconds)
        setAudioData(URL.createObjectURL(blob))
        requestAnimationFrame(() => onReviewReady?.())
        if (user?.id) {
          setIsSavingDraft(true)
          try {
            await saveVoiceDraft({
              ownerId: user.id,
              audio: blob,
              durationSeconds,
              audioObjectPath: null,
              transcript: "",
              pendingRawTranscript: null,
              rawAccepted: false,
              savedAt: Date.now(),
            })
          } catch {
            setDraftSaveFailed(true)
          } finally {
            if (mountedRef.current) setIsSavingDraft(false)
          }
        }
        if (mountedRef.current && generation === draftGenerationRef.current) void prepareRecording(blob)
      }

      mediaRecorderRef.current.start()
      recordingStartedAtRef.current = Date.now()
      setIsRecording(true)
      setTime(0)
      setAudioData(null)
      setAudioObjectPath(null)
      setTranscript("")
      setRawAccepted(false)
      setPendingRawTranscript(null)

      timerRef.current = window.setInterval(() => {
        setTime(prev => prev + 1)
      }, 1000)
    } catch (err) {
      console.error("Failed to start recording:", err)
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use SHÜÜT.",
        variant: "destructive"
      })
    }
  }, [audioData, isRecording, toast, voiceAiConsentLoading, voiceAiConsentError, voiceAiConsent, refetchVoiceAiConsent, user?.id, prepareRecording, onReviewReady])

  useImperativeHandle(ref, () => ({
    startRecording: () => {
      void startRecording()
    },
  }), [startRecording])

  const handleToggle = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleCancel = () => {
    draftGenerationRef.current += 1
    preparingRef.current = false
    audioBlobRef.current = null
    if (audioData) URL.revokeObjectURL(audioData)
    if (user?.id) void discardVoiceDraft(user.id).catch(() => setDraftSaveFailed(true))
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setAudioData(null)
    setAudioObjectPath(null)
    setTime(0)
    setTranscript("")
    setRawAccepted(false)
    setPendingRawTranscript(null)
    setMentionedFounders([])
    setImageFile(null)
    setImagePreview(null)
    setImageObjectPath(null)
    setImageUploadProgress(null)
    setImageUploadError(null)
    setIsPreparing(false)
    setIsSavingDraft(false)
    setRecoveredDraft(false)
    setDraftSaveFailed(false)
  }

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15_000_000) {
      setImageUploadError("Choose a JPEG, PNG, or WebP image under 15MB.")
      return
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setImageObjectPath(null)
    setImageUploadError(null)
  }

  const uploadImage = async (file: File): Promise<string> => {
    const csrf = csrfToken()
    const response = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || "Could not prepare image upload")
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open("PUT", payload.uploadURL)
      request.setRequestHeader("Content-Type", file.type)
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setImageUploadProgress(Math.round(event.loaded / event.total * 100))
      }
      request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("Image upload failed"))
      request.onerror = () => reject(new Error("Image upload was interrupted"))
      request.send(file)
    })
    return payload.objectPath
  }

  const handleSubmit = () => {
    if (!audioObjectPath || !transcript.trim() || isPreparing || pendingRawTranscript !== null) {
      toast({
        title: !audioObjectPath ? "Missing recording" : "Missing transcript",
        description: !audioObjectPath
          ? "Please record a voice note before publishing."
          : "Please provide a transcript before publishing.",
        variant: "destructive"
      })
      return
    }

    const publish = async () => {
      let uploadedImagePath = imageObjectPath
      if (imageFile && !uploadedImagePath) {
        setImageUploadProgress(0)
        setImageUploadError(null)
        try {
          uploadedImagePath = await uploadImage(imageFile)
          setImageObjectPath(uploadedImagePath)
        } catch (error) {
          setImageUploadProgress(null)
          setImageUploadError(error instanceof Error ? error.message : "Image upload failed")
          toast({ title: "Photo upload failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
          return
        }
        setImageUploadProgress(null)
      }
      createPost.mutate(
        {
          data: {
            transcript: transcript.trim(),
            audioObjectPath,
            durationSeconds: time || 1,
            mentionedFounderIds: mentionedFounders.map((founder) => founder.id),
            ...(uploadedImagePath ? { imageObjectPath: uploadedImagePath } : {}),
          }
        },
      {
        onSuccess: () => {
          capture('post_published')
          queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
          handleCancel()
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to publish post.",
            variant: "destructive"
          })
        }
      })
    }
    void publish()
  }

  const isExpanded = isRecording || audioData !== null;

  useEffect(() => {
    onExpandedChange?.(isExpanded)
  }, [isExpanded, onExpandedChange])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      }
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [])

  return (
    <>
      <div
        className={cn(
          "bg-card border-b border-border/50 transition-[height,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] relative overflow-hidden",
          isRecording
            ? "h-[calc(100dvh-3.375rem)] md:h-[60vh]"
            : audioData
              ? previewTranscript || rawAccepted
                ? "h-[min(680px,calc(100dvh-8rem))] md:h-[60vh]"
                : "h-[320px] md:h-[300px]"
              : "h-[140px]"
        )}
        data-testid="container-recorder"
      >
      {/* State 1: Idle */}
      <div
        className={cn(
          "flex flex-col items-center justify-center transition-[opacity,transform] duration-200 absolute inset-0",
          !isExpanded ? "opacity-100 translate-y-0 z-10" : "opacity-0 -translate-y-8 pointer-events-none"
        )}
        inert={isExpanded}
      >
        <div className="flex h-14 items-center justify-center mb-4">
          <img
            src={`${basePath}/shuut-logo.png`}
            alt="SHÜÜT"
            className="h-14 w-auto object-contain"
          />
        </div>
        <button
          onClick={handleToggle}
          data-testid="button-start-recording"
          className="w-16 h-16 rounded-full flex items-center justify-center transition-transform duration-300 shadow-md bg-primary text-primary-foreground hover:scale-105 active:scale-95 shadow-primary/20"
        >
          <Mic className="w-8 h-8" />
        </button>
      </div>

      {/* State 2: Recording */}
      <div
        className={cn(
          "flex flex-col items-center justify-center transition-[opacity,transform] duration-200 absolute inset-0 p-6 pb-20 md:pb-6",
          (isRecording && !audioData) ? "opacity-100 translate-y-0 z-10" : "opacity-0 translate-y-8 pointer-events-none"
        )}
        inert={!isRecording || audioData !== null}
      >
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto gap-8 md:gap-12">
          <div className="text-center space-y-2">
            <h3 className="font-bold text-xl md:text-2xl text-destructive uppercase tracking-widest animate-pulse" data-testid="text-recording-status">
              Recording
            </h3>
            <div className="text-6xl md:text-8xl font-mono tabular-nums tracking-tighter font-light text-foreground" data-testid="text-elapsed-time">
              {formatTime(time)}
            </div>
            <div className="text-muted-foreground font-mono md:text-lg">/ 1:30</div>
          </div>

          <button
            onClick={stopRecording}
            data-testid="button-stop-recording"
            className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-xl shadow-destructive/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Square className="w-8 h-8 md:w-10 md:h-10 fill-current animate-pulse" />
          </button>

          <div className="flex gap-2 items-center h-12 justify-center" data-testid="recording-visualizer">
            <div className="w-2 h-6 bg-destructive rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-10 bg-destructive rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-12 bg-destructive rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            <div className="w-2 h-8 bg-destructive rounded-full animate-pulse" style={{ animationDelay: '450ms' }} />
            <div className="w-2 h-6 bg-destructive rounded-full animate-pulse" style={{ animationDelay: '600ms' }} />
          </div>
        </div>
      </div>

      {/* State 3: Review / Edit */}
      <div
        className={cn(
          "flex flex-col transition-[opacity,transform] duration-200 absolute inset-0 p-3 pb-20 md:p-5",
          audioData ? "opacity-100 translate-y-0 z-10" : "opacity-0 translate-y-8 pointer-events-none"
        )}
        inert={audioData === null}
      >
        <div className={cn(
          "flex w-full max-w-2xl mx-auto flex-col rounded-2xl border border-border/60 bg-secondary/10 p-3 shadow-sm md:p-4",
            previewTranscript || rawAccepted ? "h-full min-h-0" : "gap-3",
        )}>
          <div className={cn(
            "flex flex-col min-h-0",
            previewTranscript || rawAccepted ? "flex-1 gap-3 md:gap-4" : "gap-3",
          )}>
            <div className="shrink-0" data-testid="wrapper-audio-preview">
              <AudioPlayer audioUrl={audioData || ""} durationSeconds={time} />
            </div>
             {recoveredDraft && (
               <p className="text-sm text-muted-foreground" role="status">
                 Your recording was recovered on this device. Check your feed, then review it before posting.
               </p>
             )}
             {draftSaveFailed && (
               <p className="text-sm text-destructive" role="alert">
                 This recording could not be saved for recovery. Keep this page open until you finish.
               </p>
             )}
             <MentionPicker selected={mentionedFounders} onChange={setMentionedFounders} />
             <div className="flex flex-wrap items-center gap-2">
               {imagePreview ? (
                 <div className="relative">
                   <img src={imagePreview} alt="Photo attachment preview" className="h-24 w-24 rounded-xl object-cover border border-border" />
                   <button type="button" aria-label="Remove photo attachment" onClick={() => { URL.revokeObjectURL(imagePreview); setImagePreview(null); setImageFile(null); setImageObjectPath(null) }} className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow border border-border"><X className="h-3.5 w-3.5" /></button>
                 </div>
               ) : (
                 <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
                   <ImagePlus className="h-4 w-4" /> Add photo
                   <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleImageChange} />
                 </label>
               )}
               {imageUploadProgress !== null && <span className="text-xs text-muted-foreground" aria-live="polite">Uploading photo… {imageUploadProgress}%</span>}
             </div>
             {imageUploadError && <p className="text-sm text-destructive" role="alert">{imageUploadError}</p>}

            {previewTranscript || rawAccepted ? (
              <div className="relative flex-1 flex flex-col min-h-0 group">
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                   placeholder={isPreparing ? "Preparing your voice note…" : "Edit your transcript..."}
                  className="flex-1 resize-none text-lg md:text-xl p-4 md:p-5 pb-12 bg-background/70 border-border/50 focus-visible:ring-primary/50 focus-visible:bg-background rounded-xl md:rounded-2xl shadow-inner transition-colors"
                  data-testid="textarea-transcript"
                />
                <div className="absolute right-4 bottom-4 text-xs md:text-sm text-muted-foreground font-mono bg-background/80 px-2 py-1 rounded-md backdrop-blur-sm shadow-sm border border-border/50 transition-opacity">
                  {transcript.length} chars
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-background/60 px-4 py-3 text-center">
                 <h3 className="text-lg font-bold md:text-xl">{isSavingDraft ? "Saving your recording…" : isPreparing ? "Preparing your transcript…" : transcript ? "Ready, Set…" : "Transcript not ready"}</h3>
              </div>
            )}
             {!transcript.trim() && pendingRawTranscript === null && !isPreparing && !isSavingDraft && (
               <Button variant="outline" onClick={() => {
                 if (audioBlobRef.current) void prepareRecording(audioBlobRef.current, audioObjectPath)
               }}>
                 {audioObjectPath ? "Try transcription again" : "Continue preparing recording"}
              </Button>
            )}
          </div>

          <div className={cn(
            "flex flex-row justify-between items-center gap-3 shrink-0 border-t border-border/40",
            previewTranscript || rawAccepted ? "mt-4 pt-3" : "pt-3",
          )}>
            <Button variant="ghost" onClick={handleCancel} className="text-muted-foreground h-11 rounded-full px-4 text-sm hover:bg-secondary/80 md:px-6 md:text-base" data-testid="button-cancel-recording">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
               disabled={createPost.isPending || isPreparing || isSavingDraft || !audioObjectPath || !transcript.trim() || pendingRawTranscript !== null}
              className="h-11 rounded-full px-7 text-base font-bold gap-2 shadow-md shadow-primary/20 transition-all active:scale-95 md:px-10"
              data-testid="button-submit-recording"
            >
              {createPost.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              SHÜÜT
            </Button>
          </div>
        </div>
      </div>
    </div>
      <AlertDialog open={pendingRawTranscript !== null} onOpenChange={(open) => { if (!open) setPendingRawTranscript(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transcription clean-up unavailable</AlertDialogTitle>
            <AlertDialogDescription>
              We’re experiencing a problem with transcription clean-up. Would you like to proceed with the raw transcription?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRawTranscript(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingRawTranscript !== null) {
                setTranscript(pendingRawTranscript)
                setRawAccepted(true)
                setPendingRawTranscript(null)
              }
            }}>Yes, use raw transcription</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <VoiceAiConsentModal
        open={showConsentModal}
        status={voiceAiConsent}
        onAccepted={() => {
          setShowConsentModal(false)
          void startRecording(CONSENT_BYPASS)
        }}
        onDecline={() => setShowConsentModal(false)}
      />
    </>
  )
})
