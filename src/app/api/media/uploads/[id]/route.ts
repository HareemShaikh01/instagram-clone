import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { appendBlobChunk, blobSize } from "@/lib/media";

/** Receive one chunk of a pending upload as raw application/octet-stream.
 *  The `x-media-offset` header must equal the bytes stored so far; a mismatch
 *  returns 409 with the expected offset so the client can resync. */
export const PUT = withAuth(async (req, user, ctx) => {
  rateLimit(`upload-chunk:${user.id}:${clientIp(req)}`, 600, 60_000);

  const id = await param(ctx, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(400, "invalid_id", "Invalid media id");

  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row || row.ownerId !== user.id) throw new ApiError(404, "not_found", "Upload not found");
  if (row.state !== "pending") throw new ApiError(409, "not_pending", "Upload is not open");

  const offsetHeader = req.headers.get("x-media-offset") ?? "0";
  if (!/^\d+$/.test(offsetHeader)) throw new ApiError(400, "bad_offset", "Invalid offset");
  const offset = Number(offsetHeader);

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength === 0) throw new ApiError(400, "empty_chunk", "Empty chunk");
  if (offset + buf.byteLength > row.sizeBytes)
    throw new ApiError(400, "exceeds_declared", "Chunk exceeds the declared file size", {
      declared: row.sizeBytes,
    });

  await appendBlobChunk(id, buf, offset);
  const size = await blobSize(id);

  return ok({ received: buf.byteLength, size });
});
