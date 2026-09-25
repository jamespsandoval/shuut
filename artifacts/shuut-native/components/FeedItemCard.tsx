import type { FeedItem, Post } from '@workspace/api-client-react';
import { PostCard } from './PostCard';
import { ReshuutCard } from './ReshuutCard';

type PostCardProps = React.ComponentProps<typeof PostCard>;

export function FeedItemCard({ item, ...props }: Omit<PostCardProps, 'post'> & { item: FeedItem }) {
  if (item.type === 'reshuut' && item.reshuut) {
    return <ReshuutCard reshuut={item.reshuut} refetchFeed={props.refetchFeed} onRevealReshuut={props.onRevealReshuut} />;
  }
  const original = item.type === 'reshuut' ? item.reshuut?.originalPost : item.post;
  if (!original) return null;
  const post: Post = { ...original, reshuut: item.type === 'reshuut' ? item.reshuut : null };
  return <PostCard {...props} post={post} />;
}