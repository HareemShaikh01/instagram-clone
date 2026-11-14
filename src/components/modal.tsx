"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  children,
  size = "md",
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  labelledBy?: string;
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
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-4xl" : "max-w-lg";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="fade-in absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={`slide-up relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-y-auto ${width} rounded-xl bg-elevated shadow-2xl ring-1 ring-line`}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {onClose && (
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-(--hover)">
          <X size={20} />
        </button>
      )}
    </div>
  );
}

type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
};

type ConfirmState = ConfirmOptions & { resolve: (v: boolean) => void };

const ConfirmCtx = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);

export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve });
      }),
    [],
  );

  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={state !== null} onClose={() => close(false)} size="sm">
        <div className="p-6 text-center">
          <h2 className="text-lg font-semibold">{state?.title}</h2>
          {state?.body && <p className="mt-2 text-sm text-muted">{state.body}</p>}
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => close(true)}
              className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white ${state?.danger ? "bg-danger" : "bg-accent"} hover:opacity-90`}
            >
              {state?.confirmLabel ?? "Confirm"}
            </button>
            <button
              onClick={() => close(false)}
              className="w-full rounded-lg border border-line py-2.5 text-sm font-medium hover:bg-(--hover)"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
