import { useCallback, useEffect, useRef, useState } from "react"
import { ImagePlus, Loader2, Mic, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { VoiceAiConsentModal } from "@/components/voice-ai-consent-modal"
import { preparePostPhoto, postPhotoUploadError } from "@/lib/post-photo"
import { useGetVoiceAiConsent } from "@workspace/api-client-react"

export function ReshuutVoiceComposer({ onSubmit, onCancel, isPending }: {
  onSubmit: (data: { audioObjectPath: string; durationSeconds: number; imageObjectPath?: string }) => void
  onCancel: () => void
  isPending: boolean
}) {
  const { toast } = useToast()
  const { data: consent, isLoading: consentLoading, isError: consentError, refetch } = useGetVoiceAiConsent()
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const discardRef = useRef(false)
  const audioPreviewRef = useRef<string | null>(null)
  const imagePreviewRef = useRef<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioPreview, setAudioPreview] = useState<string | null>(null)
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [showConsent, setShowConsent] = useState(false)

  const uploadFile = async (file: File): Promise<string> => {
    const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("shu_csrf="))?.split("=")[1]
    const response = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}) },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || "Could not prepare upload")
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open("PUT", payload.uploadURL)
      request.setRequestHeader("Content-Type", file.type)
      request.upload.onprogress = (event) => event.lengthComputable && setProgress(Math.round(event.loaded / event.total * 100))
      request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(postPhotoUploadError(request.status, request.responseText))
      request.onerror = () => reject(new Error("Upload was interrupted"))
      request.send(file)
    })
    return payload.objectPath
  }

  const reset = useCallback(() => {
    discardRef.current = true
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (audioPreviewRef.current) URL.revokeObjectURL(audioPreviewRef.current)
    if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current)
    recorderRef.current = null
    timerRef.current = null
    setRecording(false)
    setAudioPreview(null)
    setAudioPath(null)
    setImage(null)
    setImagePreview(null)
    setDuration(0)
    setProgress(null)
  }, [])

  useEffect(() => () => reset(), [reset])

  const startRecording = async (afterConsent = false) => {
    if (recording) {
      recorderRef.current?.stop()
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
      return
    }
    if (!afterConsent) {
      if (consentLoading) {
        toast({ title: "Checking permissions…", description: "Please wait a moment." })
        return
      }
      if (consentError || !consent) {
        toast({
          title: "Could not verify permissions",
          description: "Please check your connection and try again.",
          variant: "destructive",
          action: <ToastAction altText="Retry" onClick={() => refetch()}>Retry</ToastAction>,
        })
        return
      }
      if (consent.required) {
        setShowConsent(true)
        return
      }
    }
    try {
      discardRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 48_000 })
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        if (timerRef.current) window.clearInterval(timerRef.current)
        timerRef.current = null
        setRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        if (discardRef.current) return
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        const preview = URL.createObjectURL(blob)
        audioPreviewRef.current = preview
        setAudioPreview(preview)
        try {
          setProgress(0)
          setAudioPath(await uploadFile(new File([blob], "reshuut.webm", { type: "audio/webm" })))
        } catch (error) {
          toast({ title: "Audio upload failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
        } finally {
          setProgress(null)
        }
      }
      recorder.start()
      setRecording(true)
      setDuration(0)
      timerRef.current = window.setInterval(() => setDuration((seconds) => {
        if (seconds >= 89) {
          recorder.stop()
          stream.getTracks().forEach((track) => track.stop())
          return seconds
        }
        return seconds + 1
      }), 1000)
    } catch (error) {
      toast({
        title: "Microphone access denied",
        description: error instanceof Error ? error.message : "Please allow microphone access to record.",
        variant: "destructive",
      })
    }
  }

  const selectImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    try {
      const prepared = await preparePostPhoto(file, { optimize: true })
      if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current)
      const preview = URL.createObjectURL(prepared)
      imagePreviewRef.current = preview
      setImage(prepared)
      setImagePreview(preview)
    } catch (error) {
      toast({ title: "Invalid photo", description: error instanceof Error ? error.message : "Could not read this photo.", variant: "destructive" })
    }
  }

  const publish = async () => {
    if (!audioPath) {
      toast({ title: "Record a voice note first", variant: "destructive" })
      return
    }
    try {
      setProgress(0)
      const imageObjectPath = image ? await uploadFile(image) : undefined
      onSubmit({ audioObjectPath: audioPath, durationSeconds: duration || 1, ...(imageObjectPath ? { imageObjectPath } : {}) })
    } catch (error) {
      toast({ title: "Could not publish reSHÜÜT", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setProgress(null)
    }
  }

  return (
    <>
      <div className="mt-3 rounded-xl border border-border/60 bg-secondary/10 p-3" data-post-navigation-ignore>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Add a voice note to your reSHÜÜT</p>
          <button type="button" aria-label="Cancel reSHÜÜT voice note" onClick={() => { reset(); onCancel() }} disabled={isPending || progress !== null}
            className="rounded-full p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant={recording ? "destructive" : "outline"} onClick={() => void startRecording()}
            aria-label={recording ? "Stop reSHÜÜT recording" : "Record reSHÜÜT voice note"}>
            {recording ? <Square className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
            {recording ? `${duration}s` : "Record voice note"}
          </Button>
          {audioPreview && <audio controls src={audioPreview} className="h-9 max-w-full" />}
          {!imagePreview && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary">
              <ImagePlus className="h-4 w-4" /> Add photo
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="sr-only" onChange={selectImage} />
            </label>
          )}
          {imagePreview && (
            <div className="relative">
              <img src={imagePreview} alt="reSHÜÜT photo preview" className="h-28 w-28 rounded-lg border border-border object-contain" />
              <button type="button" aria-label="Remove reSHÜÜT photo" onClick={() => {
                URL.revokeObjectURL(imagePreview)
                imagePreviewRef.current = null
                setImagePreview(null)
                setImage(null)
              }} className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1"><X className="h-3 w-3" /></button>
            </div>
          )}
          {progress !== null && <span className="text-xs text-muted-foreground" role="status">Uploading… {progress}%</span>}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onCancel() }} disabled={isPending || progress !== null}>Cancel</Button>
          <Button type="button" onClick={() => void publish()} disabled={isPending || progress !== null || !audioPath}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Publish reSHÜÜT
          </Button>
        </div>
      </div>
      <VoiceAiConsentModal
        open={showConsent}
        status={consent}
        onAccepted={() => { setShowConsent(false); void startRecording(true) }}
        onDecline={() => setShowConsent(false)}
      />
    </>
  )
}