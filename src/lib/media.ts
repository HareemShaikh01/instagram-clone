import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { media, mediaBlobs } from "@/db/schema";
import { ApiError } from "./api";

/**
 * Media storage.
 *
 * Bytes live in the `media_blobs` Postgres table so they survive serverless
 * restarts, are shared by every instance and never disappear on redeploy —
 * unlike a serverless filesystem. Rows in `media` written before this change
 * keep their `storage_key` and are still streamed from `MEDIA_DIR` when the
 * file exists (local development data).
 */

export const MEDIA_DIR = process.env.MEDIA_DIR ?? "./uploads";

export const IMAGE_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const VIDEO_MIME_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

export function maxImageBytes(): number {
  return Number(process.env.MAX_IMAGE_BYTES ?? 20 * 1024 * 1024);
}

export function maxVideoBytes(): number {
  return Number(process.env.MAX_VIDEO_BYTES ?? 60 * 1024 * 1024);
}

export function classify(mimeType: string): "image" | "video" | null {
  if (mimeType in IMAGE_MIME_TYPES) return "image";
  if (mimeType in VIDEO_MIME_TYPES) return "video";
  return null;
}

/** Per-request chunk size for the chunked upload protocol. Must stay below
 *  Vercel's 4.5 MB serverless request-body limit with headroom. */
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

/** Window size used when streaming bytes out of Postgres. */
const BLOB_WINDOW_BYTES = 4 * 1024 * 1024;

export type MediaRow = typeof media.$inferSelect;

export async function createMediaRecord(input: {
  ownerId: string;
  kind: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  state?: "pending" | "ready";
}): Promise<MediaRow> {
  const [row] = await db
    .insert(media)
    .values({
      ownerId: input.ownerId,
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      state: input.state ?? "ready",
    })
    .returning();
  return row;
}

export async function putBlob(mediaId: string, data: Buffer): Promise<void> {
  await db.insert(mediaBlobs).values({ mediaId, data });
}

export async function initBlob(mediaId: string): Promise<void> {
  await db.insert(mediaBlobs).values({ mediaId, data: Buffer.alloc(0) });
}

/** Current byte size of the stored blob, or null when no blob row exists. */
export async function blobSize(mediaId: string): Promise<number | null> {
  const rows = await db
    .select({ size: sql<number | null>`octet_length(data)` })
    .from(mediaBlobs)
    .where(eq(mediaBlobs.mediaId, mediaId))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0].size ?? 0;
}

/** Append a chunk at exactly `expectedOffset`; conflicts mean a lost or
 *  duplicated request, which the client resolves by resyncing. */
export async function appendBlobChunk(
  mediaId: string,
  chunk: Buffer,
  expectedOffset: number,
): Promise<void> {
  const size = await blobSize(mediaId);
  if (size !== expectedOffset) {
    throw new ApiError(409, "offset_conflict", "Chunk offset does not match stored size", {
      expected: size ?? 0,
    });
  }
  await db.execute(sql`update media_blobs set data = data || ${chunk} where media_id = ${mediaId}`);
}

export async function finalizeBlob(mediaId: string, expectedSize: number): Promise<void> {
  const size = await blobSize(mediaId);
  if (size !== expectedSize) {
    throw new ApiError(400, "size_mismatch", "Uploaded size does not match the declared size", {
      expected: expectedSize,
      received: size ?? 0,
    });
  }
  await db.update(media).set({ state: "ready" }).where(eq(media.id, mediaId));
}

/** Remove abandoned pending uploads (init never followed by complete). */
export async function purgeStalePendingUploads(): Promise<void> {
  await db.execute(
    sql`delete from media where state = 'pending' and created_at < now() - interval '1 day'`,
  );
}

/* ----------------------------------------------------------- legacy fs store */

function resolveLegacyFile(storageKey: string): string {
  const filePath = path.resolve(MEDIA_DIR, storageKey);
  if (!filePath.startsWith(path.resolve(MEDIA_DIR))) {
    throw new ApiError(400, "bad_storage_key", "Invalid storage key");
  }
  return filePath;
}

export async function deleteStoredFile(storageKey: string | null): Promise<void> {
  if (!storageKey) return;
  const filePath = resolveLegacyFile(storageKey);
  try {
    await unlink(filePath);
  } catch {
    // already gone
  }
}

function streamRange(filePath: string, start: number, end: number): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, { start, end });
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        controller.enqueue(new Uint8Array(buf));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (e) => controller.error(e));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

function readBlobStream(mediaId: string, start: number, end: number): ReadableStream<Uint8Array> {
  let offset = start;
  let stopped = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (stopped) return;
      try {
        const len = Math.min(BLOB_WINDOW_BYTES, end - offset + 1);
        const res = await db.execute(
          sql`select substring(data from ${offset + 1} for ${len}) as chunk from media_blobs where media_id = ${mediaId}`,
        );
        const rows =
          (res as { rows?: Array<{ chunk: Buffer | null }> }).rows ??
          (res as unknown as Array<{ chunk: Buffer | null }>);
        const buf = rows[0]?.chunk;
        if (!buf || buf.byteLength === 0) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(buf));
        offset += buf.byteLength;
        if (offset > end) controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      stopped = true;
    },
  });
}

/* --------------------------------------------------------------- serving */

export type MediaSource = {
  /** Authoritative byte size of the stored file. */
  size: number;
  /** Stream bytes [start, end] (inclusive). */
  open: (start: number, end: number) => ReadableStream<Uint8Array>;
};

/** Locate the bytes backing a media row: Postgres blob first, legacy file
 *  second, 404 when neither exists. */
export async function openMediaSource(row: MediaRow): Promise<MediaSource> {
  const size = await blobSize(row.id);
  if (size !== null) {
    return { size, open: (start, end) => readBlobStream(row.id, start, end) };
  }
  if (row.storageKey) {
    const filePath = resolveLegacyFile(row.storageKey);
    try {
      const info = await stat(filePath);
      return { size: info.size, open: (start, end) => streamRange(filePath, start, end) };
    } catch {
      throw new ApiError(404, "file_missing", "File not found");
    }
  }
  throw new ApiError(404, "file_missing", "File not found");
}
