"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, MapPin, Trash2, X } from "lucide-react";
import { api, ApiClientError, uploadMedia } from "@/lib/api-client";
import { Button, Input, Spinner, Textarea } from "@/components/ui";
import { Modal, ModalHeader } from "@/components/modal";
import { useToast } from "@/components/toast";

type Pick = { file: File; previewUrl: string; kind: "image" | "video"; progress: number; mediaId?: string };

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

export function CreatePostModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [picks, setPicks] = useState<Pick[]>([]);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [publishing, setPublishing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    picks.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPicks([]);
    setCaption("");
    setLocation("");
  }, [picks]);

  function close() {
    if (publishing) return;
    reset();
    onClose();
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: Pick[] = [];
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith("video/") ? "video" : "image";
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        toast("error", `${file.name}: unsupported file type`);
        continue;
      }
      if (kind === "image" && file.size > MAX_IMAGE_BYTES) {
        toast("error", `${file.name}: images must be under 20 MB`);
        continue;
      }
      if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
        toast("error", `${file.name}: videos must be under 60 MB`);
        continue;
      }
      next.push({ file, previewUrl: URL.createObjectURL(file), kind, progress: 0 });
    }
    const videos = [...picks, ...next].filter((p) => p.kind === "video").length;
    if (videos > 1) {
      toast("error", "A post can contain only one video");
      return;
    }
    setPicks((cur) => [...cur, ...next].slice(0, 10));
  }

  function remove(idx: number) {
    setPicks((cur) => {
      URL.revokeObjectURL(cur[idx].previewUrl);
      return cur.filter((_, i) => i !== idx);
    });
  }

  function move(idx: number, dir: -1 | 1) {
    setPicks((cur) => {
      const j = idx + dir;
      if (j < 0 || j >= cur.length) return cur;
      const copy = [...cur];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  }

  async function publish() {
    if (picks.length === 0) {
      toast("error", "Add at least one photo or video");
      return;
    }
    setPublishing(true);
    try {
      const mediaIds: string[] = [];
      for (let i = 0; i < picks.length; i++) {
        if (picks[i].mediaId) {
          mediaIds.push(picks[i].mediaId as string);
          continue;
        }
        const { media } = await uploadMedia(picks[i].file, (pct) =>
          setPicks((cur) => cur.map((p, j) => (j === i ? { ...p, progress: pct } : p))),
        );
        mediaIds.push(media.id);
        setPicks((cur) => cur.map((p, j) => (j === i ? { ...p, mediaId: media.id } : p)));
      }
      await api("/api/posts", { body: { mediaIds, caption, location: location || undefined } });
      toast("success", "Post shared");
      reset();
      onClose();
      window.dispatchEvent(new CustomEvent("ig:feed-refresh"));
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not share post");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Modal open={open} onClose={close} size="md">
      <ModalHeader title="Create new post" onClose={close} />
      <div className="max-h-[70vh] overflow-y-auto p-5">
        {picks.length === 0 ? (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-line text-muted hover:bg-(--hover)"
          >
            <ImagePlus size={40} />
            <span className="text-sm font-medium">Select photos or a video</span>
            <span className="text-xs">Up to 10 items · one video max</span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {picks.map((p, i) => (
              <div key={p.previewUrl} className="relative aspect-square overflow-hidden rounded-md bg-surface">
                {p.kind === "video" ? (
                  <video src={p.previewUrl} muted className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.previewUrl} alt={`Selected media ${i + 1}`} className="h-full w-full object-cover" />
                )}
                {p.mediaId === undefined && p.progress > 0 && (
                  <div className="absolute inset-x-2 bottom-2 h-1 rounded bg-white/40">
                    <div className="h-full rounded bg-accent" style={{ width: `${p.progress}%` }} />
                  </div>
                )}
                <div className="absolute inset-x-0 top-0 flex justify-between p-1">
                  <button aria-label="Move left" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-full bg-black/50 p-0.5 text-white disabled:opacity-30">
                    <ArrowLeft size={14} />
                  </button>
                  <button aria-label="Remove" onClick={() => remove(i)} className="rounded-full bg-black/50 p-0.5 text-white">
                    <X size={14} />
                  </button>
                  <button aria-label="Move right" onClick={() => move(i, 1)} disabled={i === picks.length - 1} className="rounded-full bg-black/50 p-0.5 text-white disabled:opacity-30">
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
            {picks.length < 10 && (
              <button
                onClick={() => inputRef.current?.click()}
                aria-label="Add more media"
                className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-line text-muted hover:bg-(--hover)"
              >
                <ImagePlus size={22} />
              </button>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="mt-4 flex flex-col gap-3">
          <Textarea
            placeholder="Write a caption… use #hashtags and @mentions"
            value={caption}
            maxLength={2200}
            rows={3}
            onChange={(e) => setCaption(e.target.value)}
          />
          <div className="relative">
            <MapPin size={15} className="absolute top-3 left-3 text-muted" />
            <Input placeholder="Add location" value={location} maxLength={100} onChange={(e) => setLocation(e.target.value)} className="pl-8" />
          </div>
        </div>
      </div>
      <div className="flex justify-between gap-2 border-t border-line p-4">
        <Button variant="secondary" onClick={close} disabled={publishing}>
          <Trash2 size={15} /> Discard
        </Button>
        <Button onClick={() => void publish()} disabled={publishing || picks.length === 0}>
          {publishing && <Spinner size={16} className="text-white" />} Share
        </Button>
      </div>
    </Modal>
  );
}
