"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Trash2,
  Flag,
  Link2,
} from "lucide-react";
import { api, ApiClientError, formatCount, timeAgo } from "@/lib/api-client";
import { AvatarLink } from "@/components/ui";
import { DropdownMenu, MenuItem } from "@/components/dropdown";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/modal";
import { useSession } from "@/components/session";
import type { PostDTO } from "@/lib/types";

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {tokenize(text)}
    </span>
  );
}

function tokenize(text: string): React.ReactNode[] {
  const re = /(#([\p{L}\p{N}_]{1,64})|@([a-zA-Z0-9._]{3,30}))/gu;
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const raw = m[0];
    if (raw.startsWith("#")) {
      out.push(
        <Link key={key++} href={`/tags/${raw.slice(1).toLowerCase()}`} className="text-accent hover:underline">
          {raw}
        </Link>,
      );
    } else {
      out.push(
        <Link key={key++} href={`/profile/${raw.slice(1).toLowerCase()}`} className="text-accent hover:underline">
          {raw}
        </Link>,
      );
    }
    last = idx + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MediaCarousel({
  media,
  onDoubleClick,
  rounded = true,
}: {
  media: PostDTO["media"];
  onDoubleClick?: () => void;
  rounded?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const count = media.length;
  const current = media[index];

  return (
    <div
      className={`relative bg-surface ${rounded ? "rounded-lg" : ""} overflow-hidden ${count > 1 ? "aspect-square" : ""}`}
      onDoubleClick={onDoubleClick}
    >
      {current && !failed[index] ? (
        current.kind === "video" ? (
          <video
            src={current.url}
            controls
            playsInline
            preload="metadata"
            className={`block h-auto w-full ${count > 1 ? "aspect-square object-cover" : "max-h-[80vh]"}`}
            onError={() => setFailed((f) => ({ ...f, [index]: true }))}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt="Post media"
            loading="lazy"
            decoding="async"
            className={`block w-full ${count > 1 ? "aspect-square object-cover" : "max-h-[80vh] object-contain"}`}
            onError={() => setFailed((f) => ({ ...f, [index]: true }))}
          />
        )
      ) : (
        <div className="flex aspect-square items-center justify-center text-sm text-muted">
          {current ? "Media unavailable" : "No media"}
        </div>
      )}

      {count > 1 && (
        <>
          {index > 0 && (
            <button
              aria-label="Previous media"
              onClick={() => setIndex((i) => i - 1)}
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/70 p-1 text-black/70 shadow hover:bg-white/90"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {index < count - 1 && (
            <button
              aria-label="Next media"
              onClick={() => setIndex((i) => i + 1)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/70 p-1 text-black/70 shadow hover:bg-white/90"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div className="absolute bottom-3 flex w-full justify-center gap-1.5">
            {media.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to media ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-accent" : "bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PostCard({
  post,
  onDeleted,
  compact,
}: {
  post: PostDTO;
  onDeleted?: (id: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { user: me } = useSession();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.savedByMe);
  const [pop, setPop] = useState(false);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    if (next) {
      setPop(true);
      setTimeout(() => setPop(false), 500);
    }
    try {
      await api(`/api/posts/${post.id}/like`, { method: next ? "POST" : "DELETE" });
    } catch (e) {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      if (e instanceof ApiClientError) toast("error", e.message);
    }
  }

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    try {
      await api(`/api/posts/${post.id}/save`, { method: next ? "POST" : "DELETE" });
      toast("success", next ? "Saved" : "Removed from saved");
    } catch (e) {
      setSaved(!next);
      if (e instanceof ApiClientError) toast("error", e.message);
    }
  }

  async function deletePost() {
    const ok = await confirm({
      title: "Delete post?",
      body: "This permanently removes the post, its comments and likes.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/posts/${post.id}`, { method: "DELETE" });
      toast("success", "Post deleted");
      onDeleted?.(post.id);
    } catch (e) {
      if (e instanceof ApiClientError) toast("error", e.message);
    }
  }

  async function reportPost() {
    const reason = window.prompt("Why are you reporting this post?");
    if (!reason) return;
    try {
      await api("/api/reports", { body: { targetType: "post", targetId: post.id, reason } });
      toast("success", "Thanks for the report");
    } catch (e) {
      if (e instanceof ApiClientError) toast("error", e.message);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${post.id}`);
      toast("success", "Link copied");
    } catch {
      toast("error", "Could not copy link");
    }
  }

  const likeLabel = likeCount === 1 ? "1 like" : `${formatCount(likeCount)} likes`;

  return (
    <article className={`border-b border-line pb-3 ${compact ? "" : "bg-bg"}`}>
      <header className="flex items-center gap-3 px-1 py-2.5">
        <AvatarLink src={post.author.avatarUrl} username={post.author.username} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <Link href={`/profile/${post.author.username}`} className="font-semibold hover:underline">
              {post.author.username}
            </Link>
            <span className="text-muted">•</span>
            <time dateTime={post.createdAt} title={post.createdAt} className="text-muted">
              {timeAgo(post.createdAt)}
            </time>
          </div>
          {post.location && (
            <div className="flex items-center gap-1 text-xs text-muted">
              <MapPin size={11} /> {post.location}
            </div>
          )}
        </div>
        <DropdownMenu trigger={() => <MoreHorizontal size={20} />}>
          {(close) => (
            <>
              {post.author.id === me?.id ? (
                <MenuItem
                  danger
                  onClick={() => {
                    close();
                    void deletePost();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Trash2 size={16} /> Delete
                  </span>
                </MenuItem>
              ) : (
                <MenuItem
                  onClick={() => {
                    close();
                    void reportPost();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Flag size={16} /> Report
                  </span>
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  close();
                  void copyLink();
                }}
              >
                <span className="flex items-center gap-2">
                  <Link2 size={16} /> Copy link
                </span>
              </MenuItem>
            </>
          )}
        </DropdownMenu>
      </header>

      <MediaCarousel media={post.media} onDoubleClick={() => !liked && void toggleLike()} />

      <div className="flex items-center gap-4 pt-2.5">
        <button
          aria-label={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
          onClick={() => void toggleLike()}
          className={`p-1 hover:opacity-60 ${liked ? "text-danger" : ""}`}
        >
          <Heart size={24} className={pop ? "heart-pop" : ""} fill={liked ? "currentColor" : "none"} />
        </button>
        <button
          aria-label="Comments"
          onClick={() => router.push(`/p/${post.id}?focus=comments`)}
          className="p-1 hover:opacity-60"
        >
          <MessageCircle size={24} />
        </button>
        <button aria-label="Copy link" onClick={() => void copyLink()} className="p-1 hover:opacity-60">
          <Link2 size={24} />
        </button>
        <button
          aria-label={saved ? "Remove from saved" : "Save"}
          aria-pressed={saved}
          onClick={() => void toggleSave()}
          className="ml-auto p-1 hover:opacity-60"
        >
          <Bookmark size={24} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="px-1 pt-2 text-sm">
        {likeCount > 0 && (
          <button onClick={() => router.push(`/p/${post.id}`)} className="block font-semibold hover:underline">
            {likeLabel}
          </button>
        )}
        {post.caption && (
          <p className="pt-1">
            <Link href={`/profile/${post.author.username}`} className="mr-1.5 font-semibold hover:underline">
              {post.author.username}
            </Link>
            <RichText text={post.caption} />
          </p>
        )}
        {post.commentCount > 0 && (
          <Link href={`/p/${post.id}?focus=comments`} className="mt-1.5 block text-muted hover:underline">
            View all {post.commentCount === 1 ? "1 comment" : `${formatCount(post.commentCount)} comments`}
          </Link>
        )}
        {post.latestComment && (
          <p className="mt-1.5 text-muted">
            <Link href={`/profile/${post.latestComment.author.username}`} className="mr-1.5 font-semibold text-fg hover:underline">
              {post.latestComment.author.username}
            </Link>
            {post.latestComment.body.length > 80 ? `${post.latestComment.body.slice(0, 80)}…` : post.latestComment.body}
          </p>
        )}
      </div>
    </article>
  );
}

export function PostSkeleton() {
  return (
    <div className="border-b border-line pb-4">
      <div className="flex items-center gap-3 py-3">
        <div className="skeleton h-9 w-9 rounded-full" />
        <div className="skeleton h-3.5 w-32" />
      </div>
      <div className="skeleton aspect-square w-full rounded-lg" />
      <div className="skeleton mt-3 h-3.5 w-24" />
      <div className="skeleton mt-2 h-3.5 w-2/3" />
    </div>
  );
}
