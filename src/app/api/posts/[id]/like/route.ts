import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { likes, posts, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { notify } from "@/lib/notify";
import { canViewContent } from "@/lib/visibility";

async function requireVisiblePost(postId: string, viewerId: string) {
  const [row] = await db
    .select({ authorId: posts.authorId, isPrivate: users.isPrivate })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.id, postId))
    .limit(1);
  if (!row) throw new ApiError(404, "not_found", "Post not found");
  if (!(await canViewContent(viewerId, row.authorId, row.isPrivate)))
    throw new ApiError(403, "forbidden", "You cannot view this post");
  return row;
}

export const POST = withAuth(async (_req, user, ctx) => {
  const postId = await param(ctx, "id");
  const post = await requireVisiblePost(postId, user.id);

  const inserted = await db
    .insert(likes)
    .values({ userId: user.id, postId })
    .onConflictDoNothing()
    .returning({ id: likes.id });
  if (inserted.length > 0)
    await notify({ userId: post.authorId, actorId: user.id, type: "like", postId });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.postId, postId));
  return ok({ liked: true, likeCount: count });
});

export const DELETE = withAuth(async (_req, user, ctx) => {
  const postId = await param(ctx, "id");
  await db.delete(likes).where(and(eq(likes.postId, postId), eq(likes.userId, user.id)));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.postId, postId));
  return ok({ liked: false, likeCount: count });
});
