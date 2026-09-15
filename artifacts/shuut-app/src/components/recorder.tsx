import { forwardRef, useState, useRef, useEffect, useCallback, useImperativeHandle } from "react"
import { Mic, Square, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn, formatTime } from "@/lib/utils"
import { useCreatePost, useGetProfile, useTranscribeAudio } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetFeedQueryKey } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { AudioPlayer } from "./audio-player"

const MAX_DURATION = 90
const RECORDING_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]

export type RecorderHandle = {
  startRecording: () => void
}

type RecorderProps = {
  onExpandedChange?: (isExpanded: boolean) => void
}

function csrfToken() {
  const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("shu_csrf="))
  return entry ? decodeURIComponent(entry.slice("shu_csrf=".length)) : null
}

function getSupportedRecordingType() {
  return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

export const Recorder = forwardRef<RecorderHandle, RecorderProps>(function Recorder(
  { onExpandedChange },
  ref,
) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")
  const [isRecording, setIsRecording] = useState(false)
  const [time, setTime] = useState(0)
  const [audioData, setAudioData] = useState<string | null>(null)
  const [audioObjectPath, setAudioObjectPath] = useState<string | null>(null)
  const [transcript, setTranscript] = useState("")
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  
  const createPost = useCreatePost()
  const transcribeAudio = useTranscribeAudio()
  const { data: profile } = useGetProfile("me")
  const previewTranscript = profile?.founder.previewTranscript ?? false
  const queryClient = useQueryClient()
  const { toast } = useToast()

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

  const startRecording = useCallback(async () => {
    if (isRecording || audioData) return
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
        const recorderType = mediaRecorderRef.current?.mimeType || chunksRef.current[0]?.type || "audio/webm"
        const contentType = recorderType.split(";")[0].toLowerCase()
        const blob = new Blob(chunksRef.current, { type: contentType })
        setAudioData(URL.createObjectURL(blob))
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
              name: "shuut-recording",
              size: blob.size,
              contentType,
            }),
          })
          const upload = await uploadResponse.json()
          if (!uploadResponse.ok) throw new Error(upload.error || "Could not prepare recording upload")
          const putResponse = await fetch(upload.uploadURL, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: blob,
          })
          if (!putResponse.ok) throw new Error("Recording upload failed")
          setAudioObjectPath(upload.objectPath)
          if (previewTranscript) {
            transcribeAudio.mutate(
              { data: { audioObjectPath: upload.objectPath } },
              {
                onSuccess: (result) => setTranscript(result.transcript),
                onError: () => toast({
                  title: "Transcription failed",
                  description: "Please try recording again.",
                  variant: "destructive",
                }),
              },
            )
          }
        } catch (error) {
          toast({
            title: "Recording upload failed",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "destructive",
          })
        }
      }
      
      mediaRecorderRef.current.start()
      setIsRecording(true)
      setTime(0)
      setAudioData(null)
      setAudioObjectPath(null)
      setTranscript("")
      
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
  }, [audioData, isRecording, previewTranscript, toast, transcribeAudio])

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
    setAudioData(null)
    setAudioObjectPath(null)
    setTime(0)
    setTranscript("")
  }

  const handleSubmit = () => {
    if (!audioObjectPath || (previewTranscript && !transcript.trim())) {
      toast({
        title: !audioObjectPath ? "Missing recording" : "Missing transcript",
        description: !audioObjectPath
          ? "Please record a voice note before publishing."
          : "Please provide a transcript before publishing.",
        variant: "destructive"
      })
      return
    }

    createPost.mutate(
      {
        data: {
          ...(previewTranscript ? { transcript } : {}),
          audioObjectPath,
          durationSeconds: time || 1, // Fallback if 0
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
          if (!previewTranscript) {
            for (const delay of [2500, 6000, 12000, 24000]) {
              window.setTimeout(() => queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() }), delay)
            }
          }
          handleCancel()
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to publish post.",
            variant: "destructive"
          })
        }
      }
    )
  }

  const isExpanded = isRecording || audioData !== null;

  useEffect(() => {
    onExpandedChange?.(isExpanded)
  }, [isExpanded, onExpandedChange])

  return (
    <div
      className={cn(
        "bg-card border-b border-border/50 transition-[height,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] relative overflow-hidden",
        isRecording
          ? "h-[calc(100dvh-3.375rem)] md:h-[60vh]"
          : audioData
            ? previewTranscript
              ? "h-[calc(100dvh-3.375rem)] md:h-[60vh]"
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
      >
        <div className={cn(
          "flex w-full max-w-2xl mx-auto flex-col rounded-2xl border border-border/60 bg-secondary/10 p-3 shadow-sm md:p-4",
          previewTranscript ? "h-full min-h-0" : "gap-3",
        )}>
          <div className={cn(
            "flex flex-col min-h-0",
            previewTranscript ? "flex-1 gap-3 md:gap-4" : "gap-3",
          )}>
            <div className="shrink-0" data-testid="wrapper-audio-preview">
              <AudioPlayer audioUrl={audioData || ""} durationSeconds={time} />
            </div>

            {previewTranscript ? (
              <div className="relative flex-1 flex flex-col min-h-0 group">
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={transcribeAudio.isPending ? "Transcribing your voice note…" : "Edit your transcript..."}
                  className="flex-1 resize-none text-lg md:text-xl p-4 md:p-5 pb-12 bg-background/70 border-border/50 focus-visible:ring-primary/50 focus-visible:bg-background rounded-xl md:rounded-2xl shadow-inner transition-colors"
                  data-testid="textarea-transcript"
                />
                <div className="absolute right-4 bottom-4 text-xs md:text-sm text-muted-foreground font-mono bg-background/80 px-2 py-1 rounded-md backdrop-blur-sm shadow-sm border border-border/50 transition-opacity">
                  {transcript.length} chars
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-background/60 px-4 py-3 text-center">
                <h3 className="text-lg font-bold md:text-xl">Ready, Set…</h3>
              </div>
            )}
          </div>

          <div className={cn(
            "flex flex-row justify-between items-center gap-3 shrink-0 border-t border-border/40",
            previewTranscript ? "mt-4 pt-3" : "pt-3",
          )}>
            <Button variant="ghost" onClick={handleCancel} className="text-muted-foreground h-11 rounded-full px-4 text-sm hover:bg-secondary/80 md:px-6 md:text-base" data-testid="button-cancel-recording">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createPost.isPending || !audioObjectPath || (previewTranscript && (transcribeAudio.isPending || !transcript.trim()))}
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
  )
})
