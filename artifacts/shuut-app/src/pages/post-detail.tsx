import { useParams } from "wouter"
import { getGetPostQueryKey, useGetPost } from "@workspace/api-client-react"
import { Layout } from "@/components/layout"
import { PostCard } from "@/components/post-card"
import { Loader2, ArrowLeft } from "lucide-react"
import { Link } from "wouter"

export default function PostDetail() {
  const { postId } = useParams()
  const id = postId ? parseInt(postId, 10) : 0
  
  const { data: post, isLoading, error } = useGetPost(id, {
    query: {
      enabled: id > 0,
      queryKey: getGetPostQueryKey(id)
    }
  })

  return (
    <Layout>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-6">
        <Link href="/" className="p-2 rounded-full hover:bg-secondary transition-colors text-foreground group">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        </Link>
        <h1 className="text-xl font-bold text-foreground">Post</h1>
      </div>

      <div className="min-h-screen">
        {isLoading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="p-12 text-center text-destructive">
            Failed to load post. It may have been deleted.
          </div>
        )}

        {post && (
          <div>
            <PostCard post={post} isDetail={true} />
            <div className="border-t border-border/30 h-8" />
          </div>
        )}
      </div>
    </Layout>
  )
}
