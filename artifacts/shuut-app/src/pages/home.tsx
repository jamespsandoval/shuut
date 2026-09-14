import { useState } from "react"
import { useGetFeed, type GetFeedView } from "@workspace/api-client-react"
import { Layout } from "@/components/layout"
import { Recorder } from "@/components/recorder"
import { PostCard } from "@/components/post-card"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export default function Home() {
  const [view, setView] = useState<GetFeedView>("everyone")
  const { data: posts, isLoading, error } = useGetFeed({ view })

  return (
    <Layout>
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

      <Recorder />

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
