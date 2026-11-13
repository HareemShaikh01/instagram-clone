"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { PostCard, PostSkeleton } from "@/components/post-card";
import { StoryRail } from "@/components/story-rail";
import { usePostFeed } from "@/lib/use-post-feed";
import { useCreate } from "@/app/(app)/layout";

export default function FeedPage() {
  const { openPost } = useCreate();
  const feed = usePostFeed("/api/posts", 8);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // New post/story created elsewhere -> reload the feed.
  useEffect(() => {
    const onRefresh = () => void feed.retry();
    window.addEventListener("ig:feed-refresh", onRefresh);
    return () => window.removeEventListener("ig:feed-refresh", onRefresh);
  }, [feed.retry]);

  // Infinite scroll.
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
      <StoryRail />

      {feed.loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostSkeleton key={i} />
          ))}
        </div>
      )}

      {!feed.loading && feed.error && (
        <ErrorState message={feed.error} onRetry={() => void feed.retry()} />
      )}

      {!feed.loading && !feed.error && feed.posts.length === 0 && (
        <EmptyState
          icon={<Camera size={44} strokeWidth={1} />}
          title="Welcome to Instagram"
          body="Follow people to see their photos and videos here, or share your first post."
          action={
            <Button onClick={openPost} className="mt-1">
              Share your first post
            </Button>
          }
        />
      )}

      <div className="space-y-1">
        {feed.posts.map((p) => (
          <PostCard key={p.id} post={p} onDeleted={feed.remove} />
        ))}
      </div>

      {feed.moreError && (
        <ErrorState
          message="Could not load more posts"
          onRetry={() => void feed.loadMore()}
        />
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
