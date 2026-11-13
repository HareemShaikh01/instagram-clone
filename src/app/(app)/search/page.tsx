"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { AvatarLink, EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui";
import { PostTile } from "@/components/post-tile";
import type { PostDTO, UserSummary } from "@/lib/types";
import type { HashtagSummary } from "@/lib/queries";

type SearchResp = {
  users: UserSummary[];
  hashtags: HashtagSummary[];
  posts: PostDTO[];
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, error, loading } = useApi<SearchResp>(
    debounced ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  );
  const history = useApi<{ history: string[] }>(debounced ? null : "/api/search/history");

  async function clearHistory() {
    await fetch("/api/search/history", { method: "DELETE" });
    void history.refresh();
  }

  return (
    <div className="pb-10">
      <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 py-3 sm:static sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
          <Search size={16} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search">
              <X size={16} className="text-muted" />
            </button>
          )}
        </div>
      </div>

      {!debounced && (
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent</h2>
            {(history.data?.history.length ?? 0) > 0 && (
              <button onClick={() => void clearHistory()} className="text-xs font-semibold text-accent">
                Clear all
              </button>
            )}
          </div>
          {history.loading && (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-48 rounded-md" />
              ))}
            </div>
          )}
          {history.data?.history.length === 0 && (
            <p className="mt-3 text-sm text-muted">No recent searches.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {history.data?.history.map((h) => (
              <button
                key={h}
                onClick={() => setQ(h)}
                className="rounded-full border border-line px-3 py-1 text-sm hover:bg-(--hover)"
              >
                {h}
              </button>
            ))}
          </div>
        </section>
      )}

      {debounced && (
        <>
          {loading && (
            <div className="mt-6 flex justify-center">
              <Spinner />
            </div>
          )}
          {!loading && error && <ErrorState message={error.message} />}
          {!loading && !error && data && (
            <>
              {data.users.length === 0 && data.hashtags.length === 0 && data.posts.length === 0 && (
                <EmptyState
                  icon={<Search size={44} strokeWidth={1} />}
                  title={`No results for "${debounced}"`}
                  body="Try searching for people, hashtags or posts."
                />
              )}

              {data.users.length > 0 && (
                <section className="mt-5">
                  <h2 className="mb-2 text-sm font-semibold text-muted">People</h2>
                  <ul className="divide-y divide-line">
                    {data.users.map((u) => (
                      <li key={u.id} className="flex items-center gap-3 py-2.5">
                        <AvatarLink src={u.avatarUrl} username={u.username} size={44} />
                        <div className="min-w-0">
                          <Link href={`/profile/${u.username}`} className="block truncate text-sm font-semibold hover:underline">
                            {u.username}
                            {u.isPrivate && <span className="ml-1.5 text-xs text-muted">· private</span>}
                          </Link>
                          <p className="truncate text-xs text-muted">{u.fullName}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.hashtags.length > 0 && (
                <section className="mt-5">
                  <h2 className="mb-2 text-sm font-semibold text-muted">Hashtags</h2>
                  <ul className="divide-y divide-line">
                    {data.hashtags.map((h) => (
                      <li key={h.tag}>
                        <Link
                          href={`/tags/${h.tag}`}
                          className="flex items-center gap-3 py-2.5 hover:bg-(--hover)"
                        >
                          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-lg font-semibold">
                            #
                          </span>
                          <div>
                            <p className="text-sm font-semibold">#{h.tag}</p>
                            <p className="text-xs text-muted">{h.postCount} posts</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.posts.length > 0 && (
                <section className="mt-5">
                  <h2 className="mb-2 text-sm font-semibold text-muted">Posts</h2>
                  <div className="grid grid-cols-3 gap-1 sm:gap-2">
                    {data.posts.map((p) => (
                      <PostTile key={p.id} post={p} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
