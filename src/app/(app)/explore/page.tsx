"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Compass } from "lucide-react";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { PostTile } from "@/components/post-tile";
import { SuggestionRow } from "@/components/nav";
import { usePostFeed } from "@/lib/use-post-feed";
import type { SuggestedUserDTO } from "@/lib/types";

export default function ExplorePage() {
  const feed = usePostFeed("/api/explore", 12);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const meta = feed.meta as {
    trendingTags?: { tag: string; postCount: number }[];
    suggestions?: SuggestedUserDTO[];
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void feed.loadMore();
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [feed.loadMore]);

  return (
    <div className="pb-10">
      <h1 className="mb-4 text-xl font-semibold">Explore</h1>

      {(meta.trendingTags?.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {meta.trendingTags?.map((t) => (
            <Link
              key={t.tag}
              href={`/tags/${t.tag}`}
              className="rounded-full border border-line px-3 py-1 text-sm font-medium hover:bg-(--hover)"
            >
              #{t.tag}
            </Link>
          ))}
        </div>
      )}

      {(meta.suggestions?.length ?? 0) > 0 && (
        <section className="mb-6 sm:hidden">
          <h2 className="mb-2 text-sm font-semibold text-muted">Suggested for you</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {meta.suggestions?.map((u) => (
              <SuggestionRow key={u.id} suggestion={u} />
            ))}
          </div>
        </section>
      )}

      {feed.loading && (
        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square rounded-sm" />
          ))}
        </div>
      )}

      {!feed.loading && feed.error && (
        <ErrorState message={feed.error} onRetry={() => void feed.retry()} />
      )}

      {!feed.loading && !feed.error && feed.posts.length === 0 && (
        <EmptyState
          icon={<Compass size={44} strokeWidth={1} />}
          title="Nothing to explore yet"
          body="Public posts will appear here as people share them."
        />
      )}

      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {feed.posts.map((p) => (
          <PostTile key={p.id} post={p} />
        ))}
      </div>

      {feed.moreError && (
        <ErrorState message="Could not load more posts" onRetry={() => void feed.loadMore()} />
      )}
      {feed.loadingMore && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      <div ref={sentinel} aria-hidden />

      {!feed.loading && !feed.hasMore && feed.posts.length > 0 && (
        <p className="py-6 text-center text-sm text-muted">You&apos;ve seen it all</p>
      )}
    </div>
  );
}
