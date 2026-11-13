import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "./api";

export const MEDIA_DIR = process.env.MEDIA_DIR ?? "./uploads";

export const IMAGE_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const VIDEO_MIME_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function maxImageBytes(): number {
  return Number(process.env.MAX_IMAGE_BYTES ?? 10 * 1024 * 1024);
}

export function maxVideoBytes(): number {
  return Number(process.env.MAX_VIDEO_BYTES ?? 60 * 1024 * 1024);
}

export function classify(mimeType: string): "image" | "video" | null {
  if (mimeType in IMAGE_MIME_TYPES) return "image";
  if (mimeType in VIDEO_MIME_TYPES) return "video";
  return null;
}

/** Persist an uploaded file under MEDIA_DIR/yyyy/mm/uuid.ext and return its storage key. */
export async function storeUpload(
  data: Buffer,
  mimeType: string,
): Promise<{ storageKey: string; sizeBytes: number }> {
  const ext = IMAGE_MIME_TYPES[mimeType] ?? VIDEO_MIME_TYPES[mimeType] ?? "bin";
  const now = new Date();
  const dir = path.join(
    MEDIA_DIR,
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
  );
  await mkdir(dir, { recursive: true });
  const storageKey = path.join(
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    `${randomUUID()}.${ext}`,
  );
  await writeFile(path.join(MEDIA_DIR, storageKey), data);
  return { storageKey, sizeBytes: data.byteLength };
}

export async function readStoredFile(storageKey: string): Promise<string> {
  const filePath = path.resolve(MEDIA_DIR, storageKey);
  if (!filePath.startsWith(path.resolve(MEDIA_DIR))) {
    throw new ApiError(400, "bad_storage_key", "Invalid storage key");
  }
  try {
    await stat(filePath);
  } catch {
    throw new ApiError(404, "file_missing", "File not found");
  }
  return filePath;
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    await unlink(path.resolve(MEDIA_DIR, storageKey));
  } catch {
    /* already gone */
  }
}

export function streamRange(
  filePath: string,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, { start, end });
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) =>
        controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk),
      );
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (e) => controller.error(e));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}
