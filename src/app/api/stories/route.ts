import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { media, stories } from "@/db/schema";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { deleteStoredFile } from "@/lib/media";
import { queryStoryGroups } from "@/lib/queries";
import { createStorySchema } from "@/lib/validate";

/** Opportunistically purge expired stories (>24h) and their exclusive media files. */
async function purgeExpiredStories(): Promise<void> {
  const expired = await db
    .select({ id: stories.id, mediaId: stories.mediaId })
    .from(stories)
    .where(sql`expires_at <= now()`)
    .limit(50);
  if (expired.length === 0) return;
  for (const s of expired) {
    await db.delete(stories).where(eq(stories.id, s.id));
    if (s.mediaId) {
      const [m] = await db.select().from(media).where(eq(media.id, s.mediaId)).limit(1);
      if (m) {
        await db.delete(media).where(eq(media.id, m.id));
        await deleteStoredFile(m.storageKey);
      }
    }
  }
}

export const GET = withAuth(async (_req, user) => {
  await purgeExpiredStories();
  const groups = await queryStoryGroups({ viewerId: user.id });
  return ok({ groups });
});

export const POST = withAuth(async (req, user) => {
  rateLimit(`story:${user.id}:${clientIp(req)}`, 30, 3600_000);
  const body = createStorySchema.parse(await req.json());

  if (body.mediaId) {
    const [m] = await db
      .select({ id: media.id, ownerId: media.ownerId })
      .from(media)
      .where(and(eq(media.id, body.mediaId), eq(media.ownerId, user.id)))
      .limit(1);
    if (!m) throw new ApiError(403, "media_forbidden", "You do not own that media");
  }

  const [row] = await db
    .insert(stories)
    .values({
      authorId: user.id,
      kind: body.kind,
      mediaId: body.mediaId ?? null,
      bgColor: body.bgColor ?? null,
      text: body.text ?? null,
      caption: body.caption ?? null,
      overlayText: body.overlayText ?? null,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    })
    .returning();

  return ok({
    story: {
      id: row.id,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    },
  });
});
