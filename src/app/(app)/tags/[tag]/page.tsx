"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Hash } from "lucide-react";
import { EmptyState, ErrorState, Spinner } from "@/components/ui";
import { PostTile } from "@/components/post-tile";
import { usePostFeed } from "@/lib/use-post-feed";

export default function HashtagPage() {
  const params = useParams<{ tag: string }>();
  const tag = params.tag;
  const feed = usePostFeed(tag ? `/api/tags/${encodeURIComponent(tag)}` : null, 12);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const meta = feed.meta as { postCount?: number };

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
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line text-2xl font-semibold">
          #
        </span>
        <div>
          <h1 className="text-lg font-semibold">{tag}</h1>
          {meta.postCount !== undefined && (
            <p className="text-sm text-muted">{meta.postCount} posts</p>
          )}
        </div>
      </header>

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
          icon={<Hash size={44} strokeWidth={1} />}
          title={`No posts with #${tag} yet`}
          body="Be the first to use this hashtag."
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
    </div>
  );
}
