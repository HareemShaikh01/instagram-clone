"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { Avatar, Skeleton } from "@/components/ui";
import { StoryViewer } from "@/components/story-viewer";
import { useCreate } from "@/components/create-context";
import type { StoryGroupDTO } from "@/lib/types";

/** Horizontal stories carousel shown above the feed. */
export function StoryRail() {
  const { data, error, loading, refresh } = useApi<{ groups: StoryGroupDTO[] }>("/api/stories");
  const { openStory } = useCreate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const groups = data?.groups ?? [];

  return (
    <>
      <div className="mb-4 border-b border-line pb-2 sm:rounded-lg sm:border sm:shadow-sm">
        <div className="flex gap-4 overflow-x-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={openStory}
            aria-label="Add to your story"
            className="flex w-16 shrink-0 flex-col items-center gap-1.5"
          >
            <span className="relative">
              <Avatar src={null} alt="Your story" size={56} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white ring-2 ring-elevated">
                <Plus size={14} />
              </span>
            </span>
            <span className="w-16 truncate text-center text-[11px] text-muted">Your story</span>
          </button>

          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <Skeleton className="h-14 w-14 rounded-full" />
                <Skeleton className="h-2 w-12" />
              </div>
            ))}

          {groups.map((g, i) => (
            <button
              key={g.author.id}
              onClick={() => setOpenIndex(i)}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <Avatar
                src={g.author.avatarUrl}
                alt={g.author.username}
                size={56}
                ring={g.allSeen ? "seen" : "unseen"}
              />
              <span className="w-16 truncate text-center text-[11px]">{g.author.username}</span>
            </button>
          ))}
        </div>
        {error && !loading && (
          <p className="px-2 pb-1 text-xs text-danger">
            Could not load stories.{" "}
            <button className="underline" onClick={refresh}>
              Retry
            </button>
          </p>
        )}
      </div>

      {openIndex !== null && groups[openIndex] && (
        <StoryViewer
          groups={groups}
          startIndex={openIndex}
          onClose={() => {
            setOpenIndex(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
