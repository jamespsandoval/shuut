import { useState, useRef, useEffect, useCallback } from "react"
import { Mic, Square, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn, formatTime } from "@/lib/utils"
import { useCreatePost } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetFeedQueryKey } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { AudioPlayer } from "./audio-player"

const MAX_DURATION = 90

export function Recorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [time, setTime] = useState(0)
  const [audioData, setAudioData] = useState<string | null>(null)
  const [transcript, setTranscript] = useState("")
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  
  const createPost = useCreatePost()
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      chunksRef.current = []
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.readAsDataURL(blob)
        reader.onloadend = () => {
          setAudioData(reader.result as string)
        }
      }
      
      mediaRecorderRef.current.start()
      setIsRecording(true)
      setTime(0)
      setAudioData(null)
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
  }

  const handleToggle = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleCancel = () => {
    setAudioData(null)
    setTime(0)
    setTranscript("")
  }

  const handleSubmit = () => {
    if (!transcript.trim()) {
      toast({
        title: "Missing transcript",
        description: "Please provide a transcript before publishing.",
        variant: "destructive"
      })
      return
    }

    createPost.mutate(
      {
        data: {
          transcript,
          audioDataUrl: audioData || undefined,
          durationSeconds: time || 1, // Fallback if 0
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
          handleCancel()
          toast({
            title: "Published",
            description: "Your SHÜÜT is live.",
          })
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

  if (audioData) {
    return (
      <div className="bg-card border-b border-border/50 p-4 shadow-sm animate-in fade-in slide-in-from-top-4 flex flex-col gap-4">
        <AudioPlayer audioUrl={audioData} durationSeconds={time} />
        
        <div className="relative">
          <Textarea 
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Edit your transcript..."
            className="min-h-[100px] resize-none pr-4 text-base bg-secondary/20 border-border/40 focus-visible:ring-primary/50"
          />
          <div className="absolute right-3 bottom-3 text-xs text-muted-foreground font-mono">
            {transcript.length} chars
          </div>
        </div>
        
        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={handleCancel} className="text-muted-foreground">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={createPost.isPending || !transcript.trim()}
            className="rounded-full px-6 gap-2"
          >
            {createPost.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Say it
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border-b border-border/50 p-6 flex flex-col items-center justify-center min-h-[140px] transition-all">
      <div className="text-center mb-4">
        <h3 className="font-semibold text-lg text-foreground">
          {isRecording ? "Recording..." : "Speak up"}
        </h3>
        <p className="text-sm text-muted-foreground font-mono tabular-nums h-5">
          {isRecording ? `${formatTime(time)} / 1:30` : "Tap to SHÜÜT"}
        </p>
      </div>

      <button
        onClick={handleToggle}
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md",
          isRecording 
            ? "bg-destructive text-destructive-foreground animate-pulse scale-110 shadow-destructive/20" 
            : "bg-primary text-primary-foreground hover:scale-105 active:scale-95 shadow-primary/20"
        )}
      >
        {isRecording ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-8 h-8" />}
      </button>

      {isRecording && (
        <div className="flex gap-2 mt-6">
          <div className="w-2 h-2 rounded-full bg-destructive animate-bounce" />
          <div className="w-2 h-2 rounded-full bg-destructive animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-destructive animate-bounce" style={{ animationDelay: '300ms' }} />
          <div className="w-2 h-2 rounded-full bg-destructive animate-bounce" style={{ animationDelay: '450ms' }} />
        </div>
      )}
    </div>
  )
}
