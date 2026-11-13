"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { PostDTO } from "@/lib/types";

type FeedPage = { posts: PostDTO[]; nextCursor: string | null } & Record<string, unknown>;

/**
 * Cursor-paginated post list shared by the feed, explore, hashtag and profile
 * grids. De-duplicates pages and drops stale responses after a reset.
 */
export function usePostFeed(path: string | null, pageSize = 12) {
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const seq = useRef(0);
  const busy = useRef(false);

  const reset = useCallback(async () => {
    if (!path) {
      setPosts([]);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    const n = ++seq.current;
    busy.current = false;
    setLoading(true);
    setError(null);
    setMoreError(false);
    const sep = path.includes("?") ? "&" : "?";
    try {
      const data = await api<FeedPage>(`${path}${sep}limit=${pageSize}`);
      if (n !== seq.current) return;
      setPosts(data.posts);
      setNextCursor(data.nextCursor);
      const rest: Record<string, unknown> = { ...data };
      delete rest.posts;
      delete rest.nextCursor;
      setMeta(rest);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e instanceof ApiClientError ? e.message : "Could not load posts");
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path, pageSize]);

  useEffect(() => {
    void reset();
  }, [reset]);

  const loadMore = useCallback(async () => {
    if (!path || !nextCursor || busy.current) return;
    const n = seq.current;
    busy.current = true;
    setLoadingMore(true);
    setMoreError(false);
    const sep = path.includes("?") ? "&" : "?";
    try {
      const data = await api<FeedPage>(
        `${path}${sep}limit=${pageSize}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (n !== seq.current) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...data.posts.filter((p) => !seen.has(p.id))];
      });
      setNextCursor(data.nextCursor);
    } catch {
      if (n === seq.current) setMoreError(true);
    } finally {
      busy.current = false;
      if (n === seq.current) setLoadingMore(false);
    }
  }, [path, nextCursor, pageSize]);

  const remove = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    posts,
    loading,
    loadingMore,
    moreError,
    error,
    hasMore: nextCursor !== null,
    loadMore,
    retry: reset,
    remove,
    meta,
  };
}
