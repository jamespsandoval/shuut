import type { Post } from "@workspace/api-client-react";

export function canShowPostDeleteAction(post: Pick<Post, "canDelete">): boolean {
  return post.canDelete;
}