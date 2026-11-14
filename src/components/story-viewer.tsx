"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Pause, Trash2, X } from "lucide-react";
import { api, ApiClientError, timeAgo } from "@/lib/api-client";
import { AvatarLink, Spinner } from "@/components/ui";
import { Modal, ModalHeader, useConfirm } from "@/components/modal";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import type { StoryDTO, StoryGroupDTO, UserSummary } from "@/lib/types";

const IMAGE_MS = 5000;
const TICK_MS = 100;

type Viewer = { viewedAt: string; user: UserSummary };

/** Full-screen story player: auto-advance, hold-to-pause, view tracking, owner tools. */
export function StoryViewer({
  groups,
  startIndex,
  onClose,
}: {
  groups: StoryGroupDTO[];
  startIndex: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user: me } = useSession();
  const [list, setList] = useState(groups);
  const [pos, setPos] = useState({ gi: startIndex, si: 0 });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewersFor, setViewersFor] = useState<StoryDTO | null>(null);
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const viewed = useRef<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef(0);

  const group = list[pos.gi];
  const story = group?.stories[pos.si];

  const goNext = useCallback(() => {
    const g = list[pos.gi];
    if (g && pos.si + 1 < g.stories.length) {
      setPos({ gi: pos.gi, si: pos.si + 1 });
    } else if (pos.gi + 1 < list.length) {
      setPos({ gi: pos.gi + 1, si: 0 });
    } else {
      onClose();
    }
  }, [list, pos, onClose]);

  const goPrev = useCallback(() => {
    if (pos.si > 0) {
      setPos({ gi: pos.gi, si: pos.si - 1 });
    } else if (pos.gi > 0) {
      const prevLen = list[pos.gi - 1]?.stories.length ?? 1;
      setPos({ gi: pos.gi - 1, si: prevLen - 1 });
    } else {
      progressRef.current = 0;
      setProgress(0);
    }
  }, [list, pos]);

  // Reset timing whenever the current story changes.
  useEffect(() => {
    progressRef.current = 0;
    setProgress(0);
    setMediaFailed(false);
  }, [pos]);

  // Timer-driven progress for image/text stories (video drives itself).
  useEffect(() => {
    if (!story || story.kind === "video" || paused || viewersFor) return;
    const started = performance.now() - progressRef.current * IMAGE_MS;
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - started) / IMAGE_MS);
      progressRef.current = p;
      setProgress(p);
      if (p >= 1) goNext();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [story, paused, viewersFor, goNext]);

  // Play/pause the active video.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || viewersFor) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
  }, [paused, viewersFor, pos]);

  // Record each story view once per mount.
  useEffect(() => {
    if (!story || story.author?.id === me?.id) return;
    if (viewed.current.has(story.id)) return;
    viewed.current.add(story.id);
    api(`/api/stories/${story.id}/view`, { method: "POST" }).catch(() => {});
  }, [story, me]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [goNext, goPrev, onClose]);

  function openViewers() {
    if (!story) return;
    setViewersFor(story);
    setViewers(null);
    setViewersLoading(true);
    api<{ viewers: Viewer[] }>(`/api/stories/${story.id}/viewers`)
      .then((d) => setViewers(d.viewers))
      .catch((e) => {
        toast("error", e instanceof ApiClientError ? e.message : "Could not load viewers");
        setViewers([]);
      })
      .finally(() => setViewersLoading(false));
  }

  async function deleteStory() {
    if (!story) return;
    const ok = await confirm({
      title: "Delete story?",
      body: "This story will be removed for everyone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/stories/${story.id}`, { method: "DELETE" });
      const g = list[pos.gi];
      const rest = g ? g.stories.filter((st) => st.id !== story.id) : [];
      const newList =
        rest.length > 0
          ? list.map((grp, i) => (i === pos.gi ? { ...grp, stories: rest } : grp))
          : list.filter((_, i) => i !== pos.gi);
      setList(newList);
      if (newList.length === 0) {
        onClose();
        return;
      }
      const newGi = Math.min(pos.gi, newList.length - 1);
      const newSi =
        pos.gi === newGi ? Math.min(pos.si, newList[newGi].stories.length - 1) : 0;
      setPos({ gi: newGi, si: Math.max(0, newSi) });
      toast("success", "Story deleted");
    } catch (e) {
      if (e instanceof ApiClientError) toast("error", e.message);
    }
  }

  if (!group || !story) return null;
  const mine = group.author.id === me?.id;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Story viewer"
    >
      <div className="relative z-10 px-2 pt-2">
        <div className="flex gap-0.5">
          {group.stories.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-100"
                style={{
                  width: i < pos.si ? "100%" : i === pos.si ? `${progress * 100}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 py-2">
          <AvatarLink
            src={group.author.avatarUrl}
            username={group.author.username}
            size={34}
          />
          <span className="text-sm font-semibold">{group.author.username}</span>
          <span className="text-xs text-white/60">{timeAgo(story.createdAt)}</span>
          <div className="ml-auto flex items-center gap-3">
            {mine && (
              <button
                onClick={openViewers}
                aria-label="Viewers"
                className="hover:opacity-70"
              >
                <Eye size={22} />
              </button>
            )}
            {mine && (
              <button
                onClick={() => void deleteStory()}
                aria-label="Delete story"
                className="hover:opacity-70"
              >
                <Trash2 size={20} />
              </button>
            )}
            <button onClick={onClose} aria-label="Close stories" className="hover:opacity-70">
              <X size={24} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {story.kind === "text" ? (
          <div
            className="flex h-full w-full items-center justify-center p-8"
            style={{ backgroundColor: story.bgColor ?? "#262626" }}
          >
            <p className="whitespace-pre-wrap text-center text-2xl font-semibold">
              {story.text}
            </p>
          </div>
        ) : !story.media || mediaFailed ? (
          <div className="flex h-full w-full items-center justify-center p-8 text-center text-base text-white/70">
            Media unavailable
          </div>
        ) : story.kind === "video" ? (
          <video
            ref={videoRef}
            src={story.media.url}
            className="max-h-full max-w-full"
            autoPlay
            muted
            playsInline
            onError={() => setMediaFailed(true)}
            onTimeUpdate={(e) => {
              const d = e.currentTarget.duration;
              if (d > 0) {
                const p = Math.min(1, e.currentTarget.currentTime / d);
                progressRef.current = p;
                setProgress(p);
              }
            }}
            onEnded={goNext}
          />
        ) : (
          <img
            src={story.media.url}
            alt=""
            className="max-h-full max-w-full object-contain"
            onError={() => setMediaFailed(true)}
          />
        )}

        {story.overlayText && (
          <div className="pointer-events-none absolute inset-x-0 bottom-14 px-6 text-center text-xl font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
            {story.overlayText}
          </div>
        )}
        {story.caption && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 px-6 text-center text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
            {story.caption}
          </div>
        )}
        {paused && <Pause size={40} className="pointer-events-none absolute opacity-60" />}

        <button
          onClick={goPrev}
          aria-label="Previous story"
          className="absolute inset-y-0 left-0 w-1/3 cursor-default focus:outline-none"
        />
        <button
          onClick={goNext}
          aria-label="Next story"
          className="absolute inset-y-0 right-0 w-2/3 cursor-default focus:outline-none"
        />
      </div>

      <Modal
        open={viewersFor !== null}
        onClose={() => setViewersFor(null)}
        size="sm"
        labelledBy="story-viewers-title"
      >
        <ModalHeader
          title={`Viewers · ${viewersFor?.viewCount ?? 0}`}
          onClose={() => setViewersFor(null)}
        />
        <div className="max-h-80 overflow-y-auto" id="story-viewers-title">
          {viewersLoading && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {viewers?.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">No viewers yet</p>
          )}
          {viewers?.map((v) => (
            <div key={v.user.id} className="flex items-center gap-3 px-4 py-2.5">
              <AvatarLink src={v.user.avatarUrl} username={v.user.username} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{v.user.username}</p>
                <p className="truncate text-xs text-muted">{v.user.fullName}</p>
              </div>
              <span className="text-xs text-muted">{timeAgo(v.viewedAt)}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
