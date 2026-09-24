import { forwardRef, useState, useRef, useEffect, useCallback, useImperativeHandle } from "react"
import { Mic, Square, Loader2, Send, ImagePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { cn, formatTime } from "@/lib/utils"
import { type Founder, useCreatePost, useGetProfile, useTranscribeAudio, useGetVoiceAiConsent } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetFeedQueryKey } from "@workspace/api-client-react"
import { refreshFeedPages } from "@/lib/feed-refresh"
import { preparePostPhoto, postPhotoUploadError } from "@/lib/post-photo"
import { useToast } from "@/hooks/use-toast"
import { useAnalytics } from "@/lib/analytics"
import { ToastAction } from "@/components/ui/toast"
import { AudioPlayer } from "./audio-player"
import { MentionPicker } from "./mention-picker"
import { VoiceAiConsentModal } from "./voice-ai-consent-modal"

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const idleContainerRef = useRef<HTMLDivElement>(null)
  const recordingContainerRef = useRef<HTMLDivElement>(null)
  const reviewContainerRef = useRef<HTMLDivElement>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const audioBlobRef = useRef<Blob | null>(null)
  const recordingStartedAtRef = useRef(0)
  const preparingRef = useRef(false)
  const mountedRef = useRef(true)
  const preparationGenerationRef = useRef(0)

  const createPost = useCreatePost()
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
    const generation = preparationGenerationRef.current
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
        if (generation !== preparationGenerationRef.current) return
        if (!uploadResponse.ok) throw new Error(upload.error || "Could not prepare recording upload")
        const putResponse = await fetch(upload.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        })
        if (generation !== preparationGenerationRef.current) return
        if (!putResponse.ok) throw new Error("Recording upload failed")
        path = upload.objectPath
        if (mountedRef.current) setAudioObjectPath(path ?? null)
      }
      if (!path) throw new Error("Recording upload did not return a file path")
      const result = await transcribeAudio.mutateAsync({ data: { audioObjectPath: path } })
      if (!mountedRef.current || generation !== preparationGenerationRef.current) return
      if (result.cleanupStatus === "raw") {
        setTranscript("")
        setPendingRawTranscript(result.transcript)
      } else {
        setTranscript(result.transcript)
        setPendingRawTranscript(null)
      }
    } catch (error) {
      if (mountedRef.current && generation === preparationGenerationRef.current) toast({
        title: "Could not prepare your recording",
        description: `Your recording is still available to review. ${error instanceof Error ? error.message : "Please try again."}`,
        variant: "destructive",
      })
    } finally {
      if (generation === preparationGenerationRef.current) {
        preparingRef.current = false
        if (mountedRef.current) setIsPreparing(false)
      }
    }
  }, [toast, transcribeAudio])

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

      mediaRecorderRef.current.onstop = () => {
        if (!mountedRef.current) return
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
        void prepareRecording(blob)
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
  }, [audioData, isRecording, toast, voiceAiConsentLoading, voiceAiConsentError, voiceAiConsent, refetchVoiceAiConsent, prepareRecording, onReviewReady])

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
    preparationGenerationRef.current += 1
    preparingRef.current = false
    audioBlobRef.current = null
    if (audioData) URL.revokeObjectURL(audioData)
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
  }

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    let prepared: File
    try {
      prepared = await preparePostPhoto(file)
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : "Could not read this photo.")
      return
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(prepared)
    setImagePreview(URL.createObjectURL(prepared))
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
      request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(postPhotoUploadError(request.status, request.responseText))
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
          void refreshFeedPages(queryClient)
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
    // React's current DOM renderer does not accept boolean inert attributes.
    if (idleContainerRef.current) idleContainerRef.current.inert = isExpanded
    if (recordingContainerRef.current) recordingContainerRef.current.inert = !isRecording || audioData !== null
    if (reviewContainerRef.current) reviewContainerRef.current.inert = audioData === null
  }, [isExpanded, isRecording, audioData])

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
          "bg-card border-b border-border/50 relative transition-colors duration-200",
          isRecording
            ? "h-[calc(100dvh-3.375rem)] md:h-[60vh] overflow-hidden"
            : audioData
              ? "z-10 overflow-visible"
              : "h-[140px] overflow-hidden"
        )}
        data-testid="container-recorder"
      >
      {/* State 1: Idle */}
      <div
        ref={idleContainerRef}
        className={cn(
          "flex flex-col items-center justify-center transition-[opacity,transform] duration-200 absolute inset-0",
          !isExpanded ? "opacity-100 translate-y-0 z-10" : "opacity-0 -translate-y-8 pointer-events-none"
        )}
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
        ref={recordingContainerRef}
        className={cn(
          "flex flex-col items-center justify-center transition-[opacity,transform] duration-200 absolute inset-0 p-6 pb-20 md:pb-6",
          (isRecording && !audioData) ? "opacity-100 translate-y-0 z-10" : "opacity-0 translate-y-8 pointer-events-none"
        )}
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
        ref={reviewContainerRef}
        className={cn(
          "flex flex-col transition-opacity duration-200 p-3 md:p-4",
          audioData ? "relative z-10 opacity-100" : "absolute inset-0 opacity-0 pointer-events-none"
        )}
      >
        <div className="flex w-full max-w-2xl mx-auto flex-col gap-2 rounded-2xl border border-border/60 bg-secondary/10 p-3 shadow-sm md:gap-3 md:p-4">
          <div className="flex flex-col gap-2 md:gap-3">
            <div className="shrink-0" data-testid="wrapper-audio-preview">
              <AudioPlayer audioUrl={audioData || ""} durationSeconds={time} />
            </div>
             <MentionPicker selected={mentionedFounders} onChange={setMentionedFounders} />
             <div className="flex flex-wrap items-center gap-2">
               {imagePreview ? (
                 <div className="relative">
                    <img src={imagePreview} alt="Photo attachment preview" className="h-16 w-16 rounded-xl object-contain border border-border" />
                   <button type="button" aria-label="Remove photo attachment" onClick={() => { URL.revokeObjectURL(imagePreview); setImagePreview(null); setImageFile(null); setImageObjectPath(null) }} className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow border border-border"><X className="h-3.5 w-3.5" /></button>
                 </div>
               ) : (
                 <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
                   <ImagePlus className="h-4 w-4" /> Add photo
                   <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="sr-only" onChange={handleImageChange} />
                 </label>
               )}
               {imageUploadProgress !== null && <span className="text-xs text-muted-foreground" aria-live="polite">Uploading photo… {imageUploadProgress}%</span>}
             </div>
             {imageUploadError && <p className="text-sm text-destructive" role="alert">{imageUploadError}</p>}

            {previewTranscript || rawAccepted ? (
               <div className="relative flex flex-col group">
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                   placeholder={isPreparing ? "Preparing your voice note…" : "Edit your transcript..."}
                   className="min-h-28 md:min-h-32 resize-none text-lg md:text-xl p-4 md:p-5 pb-12 bg-background/70 border-border/50 focus-visible:ring-primary/50 focus-visible:bg-background rounded-xl md:rounded-2xl shadow-inner transition-colors"
                  data-testid="textarea-transcript"
                />
                <div className="absolute right-4 bottom-4 text-xs md:text-sm text-muted-foreground font-mono bg-background/80 px-2 py-1 rounded-md backdrop-blur-sm shadow-sm border border-border/50 transition-opacity">
                  {transcript.length} chars
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-background/60 px-4 py-3 text-center">
                 <h3 className="text-lg font-bold md:text-xl">{isPreparing ? "Preparing your transcript…" : transcript ? "Ready, Set…" : "Transcript not ready"}</h3>
              </div>
            )}
             {!transcript.trim() && pendingRawTranscript === null && !isPreparing && (
               <Button variant="outline" onClick={() => {
                 if (audioBlobRef.current) void prepareRecording(audioBlobRef.current, audioObjectPath)
               }}>
                 {audioObjectPath ? "Try transcription again" : "Continue preparing recording"}
              </Button>
            )}
          </div>

           <div className="flex flex-row justify-between items-center gap-3 border-t border-border/40 pt-2">
            <Button variant="ghost" onClick={handleCancel} className="text-muted-foreground h-11 rounded-full px-4 text-sm hover:bg-secondary/80 md:px-6 md:text-base" data-testid="button-cancel-recording">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
               disabled={createPost.isPending || isPreparing || !audioObjectPath || !transcript.trim() || pendingRawTranscript !== null}
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
