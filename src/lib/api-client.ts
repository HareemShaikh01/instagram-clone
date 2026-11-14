"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type ApiOptions = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? (opts.body || opts.formData ? "POST" : "GET"),
    signal: opts.signal,
  };
  if (opts.formData) {
    init.body = opts.formData;
  } else if (opts.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiClientError(res.status, "bad_response", "Malformed server response");
    }
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? "unknown_error",
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return json as T;
}

export type MediaUploadResult = {
  id: string;
  kind: "image" | "video";
  url: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

/** Files at or below this size go through the single-shot multipart endpoint;
 *  larger files use the chunked protocol so no single request exceeds the
 *  serverless request-body limit (4.5 MB on Vercel). */
const SINGLE_SHOT_MAX_BYTES = 3 * 1024 * 1024;

/** Upload a file with progress callbacks; resolves to the created MediaDTO. */
export async function uploadMedia(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ media: MediaUploadResult }> {
  if (file.size <= SINGLE_SHOT_MAX_BYTES) return uploadSingleShot(file, onProgress);
  return uploadChunked(file, onProgress);
}

function uploadSingleShot(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ media: MediaUploadResult }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let json: { media?: unknown; error?: { code?: string; message?: string } } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* fall through */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.media) {
        resolve(json as unknown as { media: MediaUploadResult });
      } else {
        reject(new ApiClientError(xhr.status, json.error?.code ?? "upload_failed", json.error?.message ?? "Upload failed"));
      }
    };
    xhr.onerror = () => reject(new ApiClientError(0, "network_error", "Network error during upload"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

async function uploadChunked(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ media: MediaUploadResult }> {
  const init = await api<{ media: MediaUploadResult; chunkSize: number }>("/api/media/uploads", {
    body: { type: file.type, size: file.size },
  });
  const created = init.media;
  const chunkSize = init.chunkSize;
  let resyncs = 0;

  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    let res: Response;
    try {
      res = await fetch(`/api/media/uploads/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "x-media-offset": String(offset) },
        body: chunk,
      });
    } catch {
      throw new ApiClientError(0, "network_error", "Network error during upload");
    }
    if (!res.ok) {
      const info = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string; details?: { expected?: number } };
      } | null;
      const err = info?.error;
      // Lost or duplicated chunk: resync to the server's stored size and retry.
      const expected = err?.details?.expected;
      if (
        res.status === 409 &&
        err?.code === "offset_conflict" &&
        typeof expected === "number" &&
        expected !== offset &&
        expected <= file.size &&
        ++resyncs <= 3
      ) {
        offset = expected;
        continue;
      }
      throw new ApiClientError(res.status, err?.code ?? "upload_failed", err?.message ?? "Upload failed", err?.details);
    }
    const data = (await res.json().catch(() => null)) as { size?: number } | null;
    offset = typeof data?.size === "number" ? data.size : offset + chunk.size;
    if (onProgress) onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
  }

  const done = await api<{ media: MediaUploadResult }>(`/api/media/uploads/${created.id}/complete`, {
    method: "POST",
  });
  if (onProgress) onProgress(100);
  return done;
}

export type UseApiResult<T> = {
  data: T | null;
  error: ApiClientError | null;
  loading: boolean;
  refresh: () => void;
};

/** Simple GET hook with abort-on-change and manual refresh. */
export function useApi<T>(path: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const seq = ++latest.current;
    const controller = new AbortController();
    setLoading(true);
    api<T>(path, { signal: controller.signal })
      .then((d) => {
        if (seq === latest.current) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (seq === latest.current && !(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof ApiClientError ? e : new ApiClientError(0, "network_error", String(e)));
        }
      })
      .finally(() => {
        if (seq === latest.current) setLoading(false);
      });
    return () => controller.abort();
  }, [path, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refresh };
}

/** Re-render on an interval; used for lightweight polling. */
export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.floor(n / 1000)}K`;
  return n.toLocaleString();
}
