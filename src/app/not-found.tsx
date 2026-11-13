import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold tracking-tight">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        The link may be broken, or the page may have been removed.
      </p>
      <Link
        href="/"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Back home
      </Link>
    </div>
  );
}
