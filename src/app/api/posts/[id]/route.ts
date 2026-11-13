import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { posts } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { deleteStoredFile } from "@/lib/media";
import { queryPosts } from "@/lib/queries";

async function getOwnOrVisiblePost(postId: string, viewerId: string) {
  const [dto] = await queryPosts({ viewerId, postId, limit: 1 });
  return dto ?? null;
}

export const GET = withAuth(async (_req, user, ctx) => {
  const id = await param(ctx, "id");
  const dto = await getOwnOrVisiblePost(id, user.id);
  if (!dto) throw new ApiError(404, "not_found", "Post not found");
  return ok({ post: dto });
});

export const DELETE = withAuth(async (_req, user, ctx) => {
  const id = await param(ctx, "id");
  const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!post) throw new ApiError(404, "not_found", "Post not found");
  if (post.authorId !== user.id)
    throw new ApiError(403, "forbidden", "You can only delete your own posts");

  await db.delete(posts).where(eq(posts.id, id));

  // Best-effort cleanup of now-unreferenced media files.
  const orphans = await db.execute(sql`
    delete from media m
    where m.owner_id = ${user.id}
      and not exists (select 1 from post_media pm where pm.media_id = m.id)
      and not exists (select 1 from stories s where s.media_id = m.id)
      and not exists (select 1 from messages msg where msg.media_id = m.id)
      and not exists (select 1 from users u where u.avatar_media_id = m.id)
    returning m.storage_key
  `);
  const rows = (orphans as { rows?: Array<{ storage_key: string }> }).rows
    ?? (orphans as unknown as Array<{ storage_key: string }>);
  for (const r of rows ?? []) await deleteStoredFile(r.storage_key);

  return ok({ ok: true });
});
