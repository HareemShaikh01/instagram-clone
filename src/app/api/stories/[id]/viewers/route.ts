import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { stories } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { rawRows } from "@/lib/queries";

/** Viewers of one of my stories (owner only). */
export const GET = withAuth(async (_req, user, ctx) => {
  const id = await param(ctx, "id");
  const [story] = await db
    .select({ authorId: stories.authorId })
    .from(stories)
    .where(eq(stories.id, id))
    .limit(1);
  if (!story) throw new ApiError(404, "not_found", "Story not found");
  if (story.authorId !== user.id)
    throw new ApiError(403, "forbidden", "Only the story owner can see viewers");

  const rows = await rawRows<{
    viewed_at: Date;
    user: { id: string; username: string; fullName: string; avatarUrl: string | null; isPrivate: boolean };
  }>(sql`
    select sv.viewed_at,
      json_build_object(
        'id', u.id, 'username', u.username, 'fullName', u.full_name,
        'avatarUrl', case when u.avatar_media_id is null then null else '/api/media/' || u.avatar_media_id end,
        'isPrivate', u.is_private
      ) as user
    from story_views sv
    join users u on u.id = sv.user_id
    where sv.story_id = ${id}
    order by sv.viewed_at desc
    limit 200
  `);
  return ok({
    viewers: rows.map((r) => ({
      viewedAt: new Date(r.viewed_at).toISOString(),
      user: r.user,
    })),
  });
});
