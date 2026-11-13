"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/api-client";
import type { NotificationDTO } from "@/lib/types";
import { Avatar, Button, EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

type NotificationsResp = {
  unreadCount: number;
  notifications: NotificationDTO[];
  nextCursor: string | null;
};

const LIMIT = 20;

function textFor(n: NotificationDTO): string {
  switch (n.type) {
    case "like":
      return "liked your post";
    case "comment":
      return "commented:";
    case "follow":
      return "started following you";
    case "follow_request":
      return "requested to follow you";
    case "follow_accept":
      return "accepted your follow request";
    case "mention":
      return "mentioned you:";
    case "message":
      return "sent you a message";
  }
}

function hrefFor(n: NotificationDTO): string {
  if (n.type === "message" && n.conversationId) return `/messages/${n.conversationId}`;
  if (n.postId) return `/p/${n.postId}`;
  return `/profile/${n.actor.username}`;
}

export default function NotificationsPage() {
  const first = useApi<NotificationsResp>(`/api/notifications?limit=${LIMIT}`);
  const [pages, setPages] = useState<NotificationDTO[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const firstPage = first.data?.notifications ?? [];
  // While no extra page has been loaded the live cursor comes from the first
  // response; afterwards each "load more" response supplies the next one.
  const liveCursor = pages.length === 0 ? (first.data?.nextCursor ?? null) : cursor;

  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...firstPage, ...pages.flat()].filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }, [firstPage, pages]);

  const unreadCount = first.data?.unreadCount ?? 0;

  const loadMore = useCallback(async () => {
    if (!liveCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<NotificationsResp>(
        `/api/notifications?limit=${LIMIT}&before=${encodeURIComponent(liveCursor)}`,
      );
      setPages((prev) => [...prev, res.notifications]);
      setCursor(res.nextCursor);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not load notifications");
    } finally {
      setLoadingMore(false);
    }
  }, [liveCursor, loadingMore, toast]);

  const markAll = useCallback(async () => {
    setMarkingAll(true);
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      const now = new Date().toISOString();
      setPages((prev) => prev.map((page) => page.map((n) => ({ ...n, readAt: n.readAt ?? now }))));
      first.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not mark as read");
    } finally {
      setMarkingAll(false);
    }
  }, [first, toast]);

  const open = useCallback(
    async (n: NotificationDTO) => {
      if (!n.readAt) {
        try {
          await api(`/api/notifications/${n.id}/read`, { method: "POST" });
          first.refresh();
        } catch {
          // Non-fatal: still navigate.
        }
      }
      router.push(hrefFor(n));
    },
    [first, router],
  );

  if (first.error) return <ErrorState message={first.error.message} onRetry={first.refresh} />;

  return (
    <div className="mx-auto w-full max-w-xl">
      <header className="mb-2 flex items-center justify-between border-b border-line pb-3">
        <h1 className="text-xl font-bold">Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}</h1>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAll} disabled={markingAll}>
            {markingAll ? <Spinner size={14} /> : <CheckCheck size={16} className="mr-1" />} Mark all as read
          </Button>
        )}
      </header>

      {first.loading && !first.data ? (
        <ul className="divide-y divide-(--line)">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 py-4">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-52" />
                <Skeleton className="h-3 w-24" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={56} strokeWidth={0.9} />}
          title="No notifications yet"
          body="Likes, comments and follows will show up here."
        />
      ) : (
        <ul className="divide-y divide-(--line)">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? "" : "-mx-2 rounded-lg bg-(--hover) px-2"}>
              <button onClick={() => void open(n)} className="flex w-full items-center gap-3 py-3.5 text-left">
                <Link
                  href={`/profile/${n.actor.username}`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0"
                  aria-label={`View ${n.actor.username}'s profile`}
                >
                  <Avatar src={n.actor.avatarUrl} alt={n.actor.username} size={44} />
                </Link>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug">
                    <span className="font-semibold">{n.actor.username}</span>{" "}
                    <span className={n.readAt ? "text-muted" : ""}>{textFor(n)}</span>
                    {n.snippet && <span className={n.readAt ? "text-muted" : ""}> {n.snippet}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                </span>
                {n.postThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.postThumbUrl} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" loading="lazy" />
                ) : !n.readAt ? (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {liveCursor && (
        <div className="flex justify-center py-4">
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner size={14} /> : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
