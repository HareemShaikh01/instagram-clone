"use client";

import { useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";

export function Avatar({
  src,
  alt,
  size = 32,
  ring,
  onClick,
}: {
  src: string | null;
  alt: string;
  size?: number;
  ring?: "seen" | "unseen" | false;
  onClick?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const inner = src && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="h-full w-full rounded-full object-cover"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  ) : (
    <span
      className="flex h-full w-full items-center justify-center rounded-full bg-surface text-muted"
      style={{ fontSize: size * 0.45 }}
    >
      <User size={size * 0.55} />
    </span>
  );

  const body = (
    <span
      className={`block overflow-hidden rounded-full ${ring === false ? "" : ring === "unseen" ? "p-[2.5px] story-ring" : ring === "seen" ? "p-[2.5px] bg-line" : ""}`}
      style={{ width: ring ? size + 5 : size, height: ring ? size + 5 : size }}
    >
      <span className="block h-full w-full overflow-hidden rounded-full ring-1 ring-line">{inner}</span>
    </span>
  );

  if (onClick) {
    return (
      <button onClick={onClick} aria-label={alt} className="shrink-0">
        {body}
      </button>
    );
  }
  return <span className="shrink-0">{body}</span>;
}

export function AvatarLink({ src, username, size = 32, ring }: { src: string | null; username: string; size?: number; ring?: "seen" | "unseen" | false }) {
  return (
    <Link href={`/profile/${username}`} aria-label={username} className="shrink-0">
      <Avatar src={src} alt={username} size={size} ring={ring} />
    </Link>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition";
  const sizes = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const variants = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "border border-line bg-elevated hover:bg-(--hover)",
    ghost: "hover:bg-(--hover)",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  return (
    <button className={`${base} ${sizes} ${variants} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Input({
  label,
  error,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string | null }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>}
      <input
        className={`w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-muted ${className}`}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Textarea({
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full resize-none rounded-md border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-muted ${className}`}
      {...rest}
    />
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

export function Spinner({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label="Loading"
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <h3 className="text-xl font-semibold">{title}</h3>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <TriangleIcon />
      <h3 className="text-lg font-semibold">Something went wrong</h3>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function TriangleIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4m0 4h.01" />
    </svg>
  );
}
