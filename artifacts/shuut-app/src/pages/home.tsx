import { useCallback, useEffect, useRef, useState } from "react"
import { getFeedPage, getGetFeedPageQueryKey, type GetFeedView, type Post } from "@workspace/api-client-react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { refreshFeedPages } from "@/lib/feed-refresh"
import { Layout } from "@/components/layout"
import { Recorder, type RecorderHandle } from "@/components/recorder"
import { PostCard } from "@/components/post-card"
import { ErrorBoundary } from "@/components/error-boundary"
import { Loader2, Mic } from "lucide-react"
import { cn } from "@/lib/utils"

function FeedPostError() {
  return (
    <div role="alert" className="mx-3 my-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
      This SHÜÜT couldn’t load. The rest of your feed is still available.
    </div>
  )
}

function canRenderPost(post: Post): boolean {
  return Boolean(
    post?.author
    && typeof post.author.name === "string"
    && post.author.name.length > 0
    && typeof post.author.handle === "string"
    && post.author.handle.length > 0
    && post.createdAt
    && !Number.isNaN(new Date(post.createdAt).getTime())
  )
}

export default function Home() {
  const [view, setView] = useState<GetFeedView>("everyone")
  const queryClient = useQueryClient()
  const [isRecorderTriggerVisible, setIsRecorderTriggerVisible] = useState(true)
  const [isRecorderExpanded, setIsRecorderExpanded] = useState(false)
  const recorderRef = useRef<RecorderHandle>(null)
  const recorderContainerRef = useRef<HTMLDivElement>(null)
  const feedSentinelRef = useRef<HTMLDivElement>(null)
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    error,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: getGetFeedPageQueryKey({ view }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => getFeedPage({
      view,
      cursor: pageParam ?? undefined,
      limit: 20,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const posts = data?.pages.flatMap((page) => page.posts) ?? []
  const dedupedPosts = Array.from(new Map(posts.map((post) => [post.id, post])).values())

  useEffect(() => {
    const sentinel = feedSentinelRef.current
    if (!sentinel || !hasNextPage) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetching) void fetchNextPage()
    }, { rootMargin: "480px 0px" })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetching])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      void refreshFeedPages(queryClient)
    }
    window.addEventListener("pageshow", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("pageshow", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [queryClient])

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

  const selectView = useCallback((nextView: GetFeedView) => {
    window.scrollTo({ top: 0, behavior: "instant" })
    // Clear cached pages before switching so the newly selected tab starts
    // with a fresh first page, not a prior scroll position or older posts.
    void queryClient.resetQueries({
      queryKey: getGetFeedPageQueryKey({ view: nextView }),
      exact: true,
    })
    setView(nextView)
  }, [queryClient])

  const handleFeedClick = useCallback(() => selectView("everyone"), [selectView])

  return (
    <Layout onFeedClick={handleFeedClick}>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex border-b border-border/30">
          <button 
            onClick={() => selectView("everyone")}
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
            onClick={() => selectView("following")}
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

        {!isLoading && !error && dedupedPosts.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No voices heard here yet.</p>
          </div>
        )}

        {dedupedPosts.map((post, index) => canRenderPost(post) ? (
          <ErrorBoundary key={post.id} FallbackComponent={FeedPostError}>
            <PostCard post={post} />
          </ErrorBoundary>
        ) : (
          <FeedPostError key={post?.id ?? `invalid-post-${index}`} />
        ))}

        {isFetchNextPageError && (
          <div role="alert" className="p-4 text-center text-sm text-destructive">
            Failed to load more of the feed.
          </div>
        )}
        <div ref={feedSentinelRef} aria-hidden="true" className="h-1" />
        {isFetchingNextPage && (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {!isLoading && hasNextPage && !isFetching && (
          <div className="flex justify-center p-6">
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-secondary"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
