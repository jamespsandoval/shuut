import { useParams, Link } from "wouter"
import { getGetReshuutQueryKey, useGetReshuut } from "@workspace/api-client-react"
import { Layout } from "@/components/layout"
import { ReshuutCard } from "@/components/reshuut-card"
import { Loader2, ArrowLeft } from "lucide-react"

export default function ReshuutDetail() {
  const { reshuutId } = useParams()
  const id = reshuutId ? Number.parseInt(reshuutId, 10) : 0
  const { data: item, isLoading, error } = useGetReshuut(id, {
    query: {
      enabled: id > 0,
      queryKey: getGetReshuutQueryKey(id),
    },
  })

  return (
    <Layout>
      <div className="sticky top-0 z-20 flex items-center gap-6 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-md">
        <Link href="/" className="group rounded-full p-2 text-foreground transition-colors hover:bg-secondary">
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
        </Link>
        <h1 className="text-xl font-bold text-foreground">reSHÜÜT</h1>
      </div>

      <div className="min-h-screen">
        {isLoading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        {error && (
          <div className="p-12 text-center text-destructive">
            Failed to load reSHÜÜT. It may have been removed or is no longer visible.
          </div>
        )}
        {item && (
          <div>
            <ReshuutCard item={item} isDetail />
            <div className="h-8 border-t border-border/30" />
          </div>
        )}
      </div>
    </Layout>
  )
}