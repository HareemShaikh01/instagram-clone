"use client";

import { useState } from "react";
import { api, ApiClientError, uploadMedia } from "@/lib/api-client";
import { Button, Spinner, Textarea } from "@/components/ui";
import { Modal, ModalHeader } from "@/components/modal";
import { useToast } from "@/components/toast";

const BG_COLORS = [
  "#8a3ab9", "#e95950", "#fccc4b", "#f4649c", "#55acee",
  "#bc2a8d", "#f5851f", "#2ba84a", "#262626", "#ffffff",
];

export function CreateStoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<"media" | "text">("media");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState("");
  const [text, setText] = useState("");
  const [bg, setBg] = useState(BG_COLORS[0]);
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setFile(null);
    setPreviewUrl(null);
    setOverlayText("");
    setText("");
    onClose();
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function share() {
    setBusy(true);
    try {
      if (tab === "media") {
        if (!file) {
          toast("error", "Choose a photo or video first");
          return;
        }
        const { media } = await uploadMedia(file);
        await api("/api/stories", {
          body: {
            kind: media.kind,
            mediaId: media.id,
            overlayText: overlayText || undefined,
          },
        });
      } else {
        if (!text.trim()) {
          toast("error", "Write something first");
          return;
        }
        await api("/api/stories", { body: { kind: "text", text: text.trim(), bgColor: bg } });
      }
      toast("success", "Story shared");
      close();
      window.dispatchEvent(new CustomEvent("ig:feed-refresh"));
    } catch (err) {
      toast("error", err instanceof ApiClientError ? err.message : "Could not share story");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} size="sm">
      <ModalHeader title="Add to your story" onClose={close} />
      <div className="flex border-b border-line text-sm font-semibold">
        {(["media", "text"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 py-2.5 ${tab === t ? "border-fg" : "border-transparent text-muted"}`}
          >
            {t === "media" ? "Photo / Video" : "Text"}
          </button>
        ))}
      </div>
      <div className="p-5">
        {tab === "media" ? (
          previewUrl ? (
            <div className="relative mx-auto aspect-9/16 w-56 overflow-hidden rounded-xl bg-black">
              {file?.type.startsWith("video/") ? (
                <video src={previewUrl} muted autoPlay loop playsInline className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Story preview" className="h-full w-full object-cover" />
              )}
              {overlayText && (
                <span className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-lg font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                  {overlayText}
                </span>
              )}
              <button
                aria-label="Remove selected media"
                onClick={() => {
                  setFile(null);
                  setPreviewUrl(null);
                }}
                className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="flex aspect-9/16 w-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-sm text-muted mx-auto hover:bg-(--hover)">
              📷 Tap to add photo or video
              <input type="file" accept="image/*,video/mp4,video/webm" className="hidden" onChange={pick} />
            </label>
          )
        ) : (
          <div className="mx-auto flex aspect-9/16 w-56 flex-col gap-3 rounded-xl p-3" style={{ backgroundColor: bg }}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={280}
              placeholder="Type something…"
              className={`h-full bg-transparent border-none text-center text-lg font-bold ${bg === "#ffffff" ? "text-black placeholder:text-gray-500" : "text-white placeholder:text-white/60"}`}
            />
            <div className="flex flex-wrap justify-center gap-1.5">
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`Background ${c}`}
                  onClick={() => setBg(c)}
                  className={`h-5 w-5 rounded-full ring-2 ${bg === c ? "ring-fg" : "ring-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}
        {tab === "media" && previewUrl && (
          <Textarea
            placeholder="Add text overlay…"
            value={overlayText}
            maxLength={120}
            rows={2}
            className="mt-4"
            onChange={(e) => setOverlayText(e.target.value)}
          />
        )}
      </div>
      <div className="border-t border-line p-4 text-right">
        <Button onClick={() => void share()} disabled={busy}>
          {busy && <Spinner size={16} className="text-white" />} Share to story
        </Button>
      </div>
    </Modal>
  );
}
