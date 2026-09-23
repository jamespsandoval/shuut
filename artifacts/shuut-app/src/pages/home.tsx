import { useCallback, useEffect, useRef, useState } from "react"
import { useGetFeed, type GetFeedView } from "@workspace/api-client-react"
import { Layout } from "@/components/layout"
import { Recorder, type RecorderHandle } from "@/components/recorder"
import { PostCard } from "@/components/post-card"
import { Loader2, Mic } from "lucide-react"
import { cn } from "@/lib/utils"

export default function Home() {
  const [view, setView] = useState<GetFeedView>("everyone")
  const [isRecorderTriggerVisible, setIsRecorderTriggerVisible] = useState(true)
  const [isRecorderExpanded, setIsRecorderExpanded] = useState(false)
  const recorderRef = useRef<RecorderHandle>(null)
  const recorderContainerRef = useRef<HTMLDivElement>(null)
  const { data: posts, isLoading, error } = useGetFeed({ view })

  useEffect(() => {
    const trigger = recorderContainerRef.current?.querySelector('[data-testid="button-start-recording"]')
    if (!trigger) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsRecorderTriggerVisible(entry.isIntersecting),
      {
        rootMargin: "-54px 0px 0px 0px",
        threshold: 0,
      },
    )
    observer.observe(trigger)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("record") !== "1") return
    window.history.replaceState({}, "", import.meta.env.BASE_URL)
    recorderContainerRef.current?.scrollIntoView({ block: "start" })
    recorderRef.current?.startRecording()
  }, [])

  const handleFloatingRecord = useCallback(() => {
    recorderContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    recorderRef.current?.startRecording()
  }, [])

  const handleReviewReady = useCallback(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) return
    requestAnimationFrame(() => {
      const container = recorderContainerRef.current
      if (!container) return
      const top = container.getBoundingClientRect().top + window.scrollY - 72
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
    })
  }, [])

  const handleFeedClick = useCallback(() => {
    setView("everyone")
    window.scrollTo({ top: 0, behavior: "auto" })
  }, [])

  return (
    <Layout onFeedClick={handleFeedClick}>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex border-b border-border/30">
          <button 
            onClick={() => setView("everyone")}
            className="flex-1 py-4 text-sm font-bold relative hover:bg-secondary/50 transition-colors"
          >
            <span className={cn("transition-colors", view === "everyone" ? "text-foreground" : "text-muted-foreground")}>
              For you
            </span>
            {view === "everyone" && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-t-full" />
            )}
          </button>
          <button 
            onClick={() => setView("following")}
            className="flex-1 py-4 text-sm font-bold relative hover:bg-secondary/50 transition-colors"
          >
            <span className={cn("transition-colors", view === "following" ? "text-foreground" : "text-muted-foreground")}>
              Following
            </span>
            {view === "following" && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-t-full" />
            )}
          </button>
        </div>
      </div>

      <div ref={recorderContainerRef}>
        <Recorder
          ref={recorderRef}
          onExpandedChange={setIsRecorderExpanded}
          onReviewReady={handleReviewReady}
        />
      </div>

      {!isRecorderTriggerVisible && !isRecorderExpanded && (
        <button
          type="button"
          onClick={handleFloatingRecord}
          aria-label="Record a SHÜÜT"
          data-testid="button-floating-recording"
          className="shuut-floating-record fixed bottom-20 right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:scale-105 active:scale-95 md:bottom-6 animate-in fade-in zoom-in-75 duration-200"
        >
          <Mic className="h-8 w-8" />
        </button>
      )}

      <div className="min-h-screen">
        {isLoading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="p-12 text-center text-destructive">
            Failed to load feed.
          </div>
        )}

        {!isLoading && !error && posts?.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No voices heard here yet.</p>
          </div>
        )}

        {posts?.map(post => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </Layout>
  )
}
