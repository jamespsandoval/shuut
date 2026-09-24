import { useEffect, useState } from "react"
import { Link } from "wouter"
import { useQueryClient } from "@tanstack/react-query"
import {
  getGetFollowSuggestionsQueryKey,
  getGetProfileQueryKey,
  useGetFollowSuggestions,
  useToggleFollow,
} from "@workspace/api-client-react"
import { refreshFeedPages } from "@/lib/feed-refresh"

const wideScreen = "(min-width: 1280px)"

export function FeedRightRail() {
  const [isWide, setIsWide] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(wideScreen).matches,
  )
  const [pendingHandle, setPendingHandle] = useState<string | null>(null)
  const [followError, setFollowError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const toggleFollow = useToggleFollow()
  const { data: suggestions, isError, refetch } = useGetFollowSuggestions({
    query: { queryKey: getGetFollowSuggestionsQueryKey(), enabled: isWide, staleTime: 30_000 },
  })

  useEffect(() => {
    const media = window.matchMedia(wideScreen)
    const update = () => setIsWide(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const follow = (handle: string) => {
    setPendingHandle(handle)
    setFollowError(null)
    toggleFollow.mutate({ handle }, {
      onSuccess: (result) => {
        if (!result.isFollowing) {
          setFollowError(`Could not follow @${handle}. Please try again.`)
          return
        }
        queryClient.setQueryData(getGetFollowSuggestionsQueryKey(), (current: typeof suggestions) =>
          current?.filter((candidate) => candidate.handle !== handle),
        )
        void queryClient.invalidateQueries({ queryKey: getGetFollowSuggestionsQueryKey() })
        void queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(handle) })
        void refreshFeedPages(queryClient)
      },
      onError: () => setFollowError(`Could not follow @${handle}. Please try again.`),
      onSettled: () => setPendingHandle(null),
    })
  }

  return (
    <aside aria-label="Discover people and advertising" className="hidden xl:block w-[360px] shrink-0 px-5 pt-5">
      <div className="sticky top-5 space-y-6">
        {isError ? (
          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-xl font-extrabold">Who's worth a follow</h2>
            <p className="mt-3 text-sm text-muted-foreground">Suggestions aren't available right now.</p>
            <button type="button" className="mt-2 text-sm font-semibold text-primary hover:underline" onClick={() => void refetch()}>
              Try again
            </button>
          </section>
        ) : suggestions && suggestions.length > 0 ? (
          <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="follow-suggestions-heading">
            <h2 id="follow-suggestions-heading" className="mb-5 text-xl font-extrabold tracking-tight">Who's worth a follow</h2>
            <ul className="space-y-5">
              {suggestions.slice(0, 3).map((founder) => (
                <li key={founder.id} className="flex items-center gap-2">
                  <Link href={`/u/${encodeURIComponent(founder.handle)}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`View ${founder.name}'s profile`}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-bold text-white" style={{ backgroundColor: founder.avatarColor || "#3B82F6" }}>
                      {founder.avatarUrl
                        ? <img src={founder.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : founder.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-sm font-bold text-foreground">{founder.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">@{founder.handle}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => follow(founder.handle)}
                    disabled={pendingHandle !== null}
                    aria-label={`Follow ${founder.name}`}
                    className="shrink-0 rounded-full bg-[#15191d] px-3.5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                  >
                    {pendingHandle === founder.handle ? "Following…" : "Follow"}
                  </button>
                </li>
              ))}
            </ul>
            {followError && <p role="alert" className="mt-4 text-xs text-destructive">{followError}</p>}
          </section>
        ) : null}

        <div aria-label="Advertisement placeholder">
          <div className="mb-1 pr-1 text-right text-xs font-medium text-muted-foreground">Ad</div>
          <div className="flex aspect-[3/2] items-center justify-center rounded-2xl bg-black px-4 text-center text-2xl font-bold text-white">
            Your Ad Here
          </div>
        </div>
      </div>
    </aside>
  )
}