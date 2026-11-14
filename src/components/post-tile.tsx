"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle } from "lucide-react";
import { formatCount } from "@/lib/api-client";
import type { PostDTO } from "@/lib/types";

/** Square grid tile (explore, hashtag, profile, search results). */
export function PostTile({ post }: { post: PostDTO }) {
  const [failed, setFailed] = useState(false);
  const first = post.media[0];
  return (
    <Link
      href={`/p/${post.id}`}
      aria-label={`Post by ${post.author.username}`}
      className="group relative block aspect-square overflow-hidden bg-surface"
    >
      {first && !failed ? (
        first.kind === "video" ? (
          <video
            src={first.url}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            src={first.url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted">
          {post.caption || "Post"}
        </div>
      )}
      {post.media.length > 1 && (
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          1/{post.media.length}
        </span>
      )}
      <div className="absolute inset-0 hidden items-center justify-center gap-5 bg-black/30 text-white group-hover:flex">
        {post.likeCount > 0 && (
          <span className="flex items-center gap-1 text-sm font-bold">
            <Heart size={18} fill="currentColor" /> {formatCount(post.likeCount)}
          </span>
        )}
        <span className="flex items-center gap-1 text-sm font-bold">
          <MessageCircle size={18} fill="currentColor" /> {formatCount(post.commentCount)}
        </span>
      </div>
    </Link>
  );
}
