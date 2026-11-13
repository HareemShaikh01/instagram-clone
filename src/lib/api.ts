import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function err(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) return err(e.status, e.code, e.message, e.details);
  if (e instanceof ZodError) {
    const details = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return err(400, "validation_error", "Invalid request", details);
  }
  console.error("[api] unhandled error", e);
  return err(500, "internal_error", "Something went wrong");
}

export async function readJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be JSON");
  }
  return schema.parse(raw);
}

/* ------------------------------------------------------------- rate limiting */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** In-memory fixed-window limiter. Per-instance only (single-node deployment). */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    const secs = Math.ceil((b.resetAt - now) / 1000);
    throw new ApiError(429, "rate_limited", `Too many requests. Try again in ${secs}s.`);
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/* ------------------------------------------------------------------ cursors */

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!iso || !id) throw new Error("bad");
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) throw new Error("bad");
    return { createdAt, id };
  } catch {
    throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  }
}

export function intParam(value: string | null, fallback: number, max: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}
