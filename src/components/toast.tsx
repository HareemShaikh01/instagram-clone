"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

const ToastCtx = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4200);
  }, []);

  const icons: Record<ToastKind, React.ReactNode> = {
    success: <CheckCircle2 size={18} className="text-emerald-500" />,
    error: <XCircle size={18} className="text-danger" />,
    info: <Info size={18} className="text-accent" />,
  };

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="slide-up pointer-events-auto flex max-w-md items-center gap-2 rounded-xl bg-elevated px-4 py-3 text-sm shadow-lg ring-1 ring-line"
          >
            {icons[t.kind]}
            <span className="break-words">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
