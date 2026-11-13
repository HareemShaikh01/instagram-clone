"use client";

import { useEffect, useRef, useState } from "react";

export function DropdownMenu({
  trigger,
  children,
  align = "right",
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-full p-1.5 hover:bg-(--hover)"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-1 min-w-52 overflow-hidden rounded-xl bg-elevated shadow-lg ring-1 ring-line ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`block w-full border-b border-line px-4 py-3 text-left text-sm last:border-b-0 hover:bg-(--hover) ${danger ? "font-semibold text-danger" : ""}`}
    >
      {children}
    </button>
  );
}
