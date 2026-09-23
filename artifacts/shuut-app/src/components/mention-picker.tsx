import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { getSearchProfilesQueryKey, type Founder, useSearchProfiles } from "@workspace/api-client-react"

export function MentionPicker({
  selected,
  onChange,
}: {
  selected: Founder[]
  onChange: (founders: Founder[]) => void
}) {
  const [query, setQuery] = useState("")
  const searchTerm = query.trim().replace(/^@+/, "").trim()
  const { data = [], isFetching } = useSearchProfiles(
    { q: searchTerm || " " },
    { query: { enabled: searchTerm.length > 0, queryKey: getSearchProfilesQueryKey({ q: searchTerm || " " }) } },
  )
  const results = data.filter((founder) => !selected.some((item) => item.id === founder.id))

  return (
    <div className="relative shrink-0">
      <div className="flex min-h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3">
        {selected.map((founder) => (
          <button
            key={founder.id}
            type="button"
            onClick={() => onChange(selected.filter((item) => item.id !== founder.id))}
            className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
            aria-label={`Remove @${founder.handle}`}
          >
            @{founder.handle}<X className="h-3 w-3" />
          </button>
        ))}
        {selected.length < 5 && (
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={selected.length ? "Add another" : "@ to tag someone"}
            className="h-9 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search people to tag"
          />
        )}
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {searchTerm && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-border bg-popover p-1 shadow-lg">
          {results.length ? results.slice(0, 4).map((founder) => (
            <button
              key={founder.id}
              type="button"
              onClick={() => {
                onChange([...selected, founder])
                setQuery("")
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
            >
              <span className="truncate font-medium">{founder.name}</span>
              <span className="ml-3 shrink-0 text-muted-foreground">@{founder.handle}</span>
            </button>
          )) : !isFetching && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching people</p>
          )}
          {results.length > 4 && (
            <p className="px-3 py-1 text-xs text-muted-foreground">Keep typing to narrow the results</p>
          )}
        </div>
      )}
    </div>
  )
}