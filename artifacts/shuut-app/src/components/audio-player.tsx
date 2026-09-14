import { useState, useEffect, useRef, useCallback } from "react"
import { Play, Pause, Volume2 } from "lucide-react"
import { formatTime, cn } from "@/lib/utils"

interface AudioPlayerProps {
  audioUrl: string
  durationSeconds: number
  className?: string
}

export function AudioPlayer({ audioUrl, durationSeconds, className }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const togglePlay = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress((audioRef.current.currentTime / durationSeconds) * 100)
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
      
      const newTime = (percentage / 100) * durationSeconds
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
    <div className={cn("flex items-center gap-3 bg-secondary/30 p-2 rounded-xl border border-border/50", className)}>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />
      
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform shadow-sm"
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      <div 
        className="flex-1 h-8 flex items-center gap-[2px] cursor-pointer group"
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
        {formatTime(Math.floor((progress / 100) * durationSeconds || 0))} / {formatTime(durationSeconds)}
      </div>
    </div>
  )
}
