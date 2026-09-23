import { getGetFeedPageQueryKey, type FeedPage } from "@workspace/api-client-react"
import type { InfiniteData, QueryClient } from "@tanstack/react-query"

/** Refresh the visible feed without re-downloading every previously viewed page. */
export async function refreshFeedPages(queryClient: QueryClient) {
  const key = getGetFeedPageQueryKey()
  await queryClient.cancelQueries({ queryKey: key })
  queryClient.setQueriesData<InfiniteData<FeedPage, string | null>>({ queryKey: key }, (current) =>
    current ? { pages: current.pages.slice(0, 1), pageParams: current.pageParams.slice(0, 1) } : current,
  )
  await queryClient.invalidateQueries({ queryKey: key })
}