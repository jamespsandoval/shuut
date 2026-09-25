import { Link } from "wouter";
import { Bell, Loader2, MessageCircle, Repeat2, Sparkles } from "lucide-react";
import {
  getGetNotificationsQueryKey,
  Notification,
  useGetNotifications,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";

function eventCopy(item: Notification) {
  if (item.eventType === "reaction") {
    const reactions: Record<string, string> = {
      rocket: "🚀",
      laughing: "😂",
      thumbsDown: "👎",
    };
    return `reacted ${reactions[item.reactionType ?? ""] ?? "to"} to your SHÜÜT`;
  }
  if (item.eventType === "reshuut") return "tagged you in a reSHÜÜT of your SHÜÜT";
  if (item.eventType === "mention") return "tagged you in a SHÜÜT";
  return "left a voice comment on your SHÜÜT";
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function NotificationsPage() {
  const {
    data: notifications,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useGetNotifications({
    query: {
      queryKey: getGetNotificationsQueryKey(),
      refetchInterval: 30_000,
    },
  });

  return (
    <Layout>
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 px-5 py-4 backdrop-blur-md">
        <h1 className="text-xl font-bold">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reactions, reshüüts, and comments</p>
      </header>

      {isLoading ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading notifications" />
        </div>
      ) : isError ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <Bell className="h-9 w-9 text-muted-foreground" />
          <h2 className="font-semibold">Notifications are unavailable</h2>
          <Button variant="outline" className="rounded-full" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : notifications?.length ? (
        <div className="divide-y divide-border/60 px-5">
          {notifications.map((notification) => (
            <Link
              key={notification.id}
              href={notification.reshuutId
                ? `/r/${notification.reshuutId}`
                : `/p/${notification.post.id}`}
              className="flex gap-4 py-5 transition-colors hover:bg-secondary/40"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                {notification.eventType === "comment" ? (
                  <MessageCircle className="h-5 w-5" />
                ) : notification.eventType === "reshuut" ? (
                  <Repeat2 className="h-5 w-5" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6">
                  <span className="font-bold">{notification.actor.name}</span>{" "}
                  {eventCopy(notification)}
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                  {notification.post.transcript || "Transcript unavailable"}
                </p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  {relativeTime(notification.createdAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
          <Bell className="h-9 w-9 text-muted-foreground" />
          <h2 className="mt-2 font-semibold">Nothing new yet</h2>
          <p className="text-sm text-muted-foreground">
            Activity on your SHÜÜTs will appear here.
          </p>
        </div>
      )}

      {isRefetching && !isLoading && (
        <span className="sr-only" aria-live="polite">Refreshing notifications</span>
      )}
    </Layout>
  );
}