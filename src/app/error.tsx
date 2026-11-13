"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted">Reference: {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
