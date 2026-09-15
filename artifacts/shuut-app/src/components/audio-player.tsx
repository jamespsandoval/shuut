import { useState, useEffect, useRef, useCallback } from "react"
import { Play, Pause, Volume2 } from "lucide-react"
import { formatTime, cn } from "@/lib/utils"

interface AudioPlayerProps {
  audioUrl: string
  durationSeconds: number
  className?: string
  compact?: boolean
}

export function AudioPlayer({ audioUrl, durationSeconds, className, compact = false }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(durationSeconds)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    setIsPlaying(false)
    setProgress(0)
    setMediaDuration(durationSeconds)
  }, [audioUrl, durationSeconds])

  const togglePlay = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        try {
          await audioRef.current.play()
        } catch {
          setIsPlaying(false)
        }
      }
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(mediaDuration > 0 ? (audioRef.current.currentTime / mediaDuration) * 100 : 0)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setProgress(0)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (audioRef.current) {
      const bounds = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - bounds.left
      const percentage = Math.max(0, Math.min(100, (x / bounds.width) * 100))
      
      const newTime = (percentage / 100) * mediaDuration
      audioRef.current.currentTime = newTime
      setProgress(percentage)
    }
  }

  // Generate deterministic but pseudo-random heights for the waveform
  const bars = 24
  const barHeights = Array.from({ length: bars }).map((_, i) => {
    // A predictable sine-wave pattern mixed with a hash of the duration
    return 30 + Math.sin(i * 0.5 + durationSeconds) * 20 + Math.cos(i * 1.2) * 15
  })

  return (
    <div className={cn(
      "flex items-center bg-secondary/30 border border-border/50",
      compact ? "gap-2 rounded-lg px-1.5 py-1" : "gap-3 rounded-xl p-2",
      className,
    )}>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => {
          const loadedDuration = event.currentTarget.duration
          if (Number.isFinite(loadedDuration) && loadedDuration > 0) {
            setMediaDuration(loadedDuration)
          }
        }}
        preload="metadata"
      />
      
      <button
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause recording" : "Play recording"}
        className={cn(
          "relative rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          compact
            ? "h-8 w-8 before:absolute before:-inset-1.5 before:rounded-full before:content-['']"
            : "h-10 w-10",
        )}
      >
        {isPlaying
          ? <Pause className={cn("fill-current", compact ? "h-4 w-4" : "h-5 w-5")} />
          : <Play className={cn("fill-current ml-0.5", compact ? "h-4 w-4" : "h-5 w-5")} />}
      </button>

      <div 
        className={cn(
          "flex-1 flex items-center gap-[2px] cursor-pointer group",
          compact ? "h-6" : "h-8",
        )}
        onClick={handleSeek}
      >
        {barHeights.map((height, i) => {
          const isPlayed = (i / bars) * 100 <= progress
          return (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-full transition-all duration-150 group-hover:opacity-80",
                isPlayed ? "bg-primary" : "bg-muted-foreground/30",
                isPlaying && !isPlayed ? "animate-pulse" : ""
              )}
              style={{
                height: `${Math.max(10, height)}%`,
                animationDelay: isPlaying ? `${i * 50}ms` : '0ms'
              }}
            />
          )
        })}
      </div>

      <div className="text-xs font-mono font-medium text-muted-foreground shrink-0 tabular-nums">
        {Math.max(1, Math.round(mediaDuration))} sec
      </div>
    </div>
  )
}
