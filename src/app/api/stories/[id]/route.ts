import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { media, stories } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { deleteStoredFile } from "@/lib/media";

export const DELETE = withAuth(async (_req, user, ctx) => {
  const id = await param(ctx, "id");
  const [story] = await db.select().from(stories).where(eq(stories.id, id)).limit(1);
  if (!story) throw new ApiError(404, "not_found", "Story not found");
  if (story.authorId !== user.id)
    throw new ApiError(403, "forbidden", "You can only delete your own stories");

  await db.delete(stories).where(eq(stories.id, id));
  if (story.mediaId) {
    const [m] = await db.select().from(media).where(eq(media.id, story.mediaId)).limit(1);
    if (m) {
      await db.delete(media).where(eq(media.id, m.id));
      await deleteStoredFile(m.storageKey);
    }
  }
  return ok({ ok: true });
});
