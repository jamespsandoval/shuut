import type { FeedItem, Post } from "@workspace/api-client-react"
import { PostCard } from "./post-card"
import { ReshuutCard } from "./reshuut-card"

export function FeedItemCard({ item, isFocused = false }: { item: FeedItem; isFocused?: boolean }) {
  if (item.type === "reshuut") return <ReshuutCard item={item} isFocused={isFocused} />
  const original = item.post
  if (!original) return null
  const post: Post = { ...original, reshuut: null }
  return <PostCard post={post} isFocused={isFocused} />
}