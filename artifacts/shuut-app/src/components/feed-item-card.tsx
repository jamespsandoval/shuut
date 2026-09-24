import type { FeedItem, Post } from "@workspace/api-client-react"
import { PostCard } from "./post-card"

export function FeedItemCard({ item, isFocused = false }: { item: FeedItem; isFocused?: boolean }) {
  const original = item.type === "reshuut" ? item.reshuut?.originalPost : item.post
  if (!original) return null
  const post: Post = { ...original, reshuut: item.type === "reshuut" ? item.reshuut : null }
  return <PostCard post={post} isFocused={isFocused} />
}