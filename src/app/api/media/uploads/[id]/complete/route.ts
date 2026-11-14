import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { finalizeBlob } from "@/lib/media";

/** Close a chunked upload: verifies the assembled blob matches the declared
 *  size, then flips the media row to ready so it becomes servable. */
export const POST = withAuth(async (req, user, ctx) => {
  rateLimit(`upload-complete:${user.id}:${clientIp(req)}`, 60, 60_000);

  const id = await param(ctx, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(400, "invalid_id", "Invalid media id");

  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row || row.ownerId !== user.id) throw new ApiError(404, "not_found", "Upload not found");
  if (row.state !== "pending") throw new ApiError(409, "not_pending", "Upload is not open");

  await finalizeBlob(id, row.sizeBytes);

  return ok({
    media: {
      id: row.id,
      kind: row.kind,
      url: `/api/media/${row.id}`,
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
    },
  });
});
