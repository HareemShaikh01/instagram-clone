"use client";

import { useEffect } from "react";
import { Camera, ImagePlus } from "lucide-react";

/** Mobile action sheet behind the bottom-nav + button: offers both creation
 *  flows, since the desktop sidebar only exposes Create post. */
export function CreateSheet({
  open,
  onClose,
  onPost,
  onStory,
}: {
  open: boolean;
  onClose: () => void;
  onPost: () => void;
  onStory: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const pick = (next: () => void) => () => {
    onClose();
    next();
  };

  const option =
    "flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-(--hover)";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Create"
    >
      <div className="fade-in absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="slide-up relative mb-0 w-full max-w-sm rounded-t-2xl bg-elevated p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-line sm:mb-6 sm:rounded-2xl">
        <p className="px-2 pb-2 pt-1 text-sm font-semibold text-muted">Create</p>
        <button onClick={pick(onPost)} className={option}>
          <ImagePlus size={22} />
          <span>
            <span className="block text-sm font-semibold">Post</span>
            <span className="block text-xs text-muted">Share photos or videos to your feed</span>
          </span>
        </button>
        <button onClick={pick(onStory)} className={option}>
          <Camera size={22} />
          <span>
            <span className="block text-sm font-semibold">Story</span>
            <span className="block text-xs text-muted">Visible for 24 hours</span>
          </span>
        </button>
      </div>
    </div>
  );
}
