import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { commentLikes, comments, posts, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { canViewContent } from "@/lib/visibility";

async function requireVisibleComment(commentId: string, viewerId: string) {
  const [row] = await db
    .select({ postAuthorId: posts.authorId, isPrivate: users.isPrivate })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row) throw new ApiError(404, "not_found", "Comment not found");
  if (!(await canViewContent(viewerId, row.postAuthorId, row.isPrivate)))
    throw new ApiError(403, "forbidden", "You cannot view this comment");
}

export const POST = withAuth(async (_req, user, ctx) => {
  const commentId = await param(ctx, "id");
  await requireVisibleComment(commentId, user.id);
  await db
    .insert(commentLikes)
    .values({ userId: user.id, commentId })
    .onConflictDoNothing();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commentLikes)
    .where(eq(commentLikes.commentId, commentId));
  return ok({ liked: true, likeCount: count });
});

export const DELETE = withAuth(async (_req, user, ctx) => {
  const commentId = await param(ctx, "id");
  await db
    .delete(commentLikes)
    .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, user.id)));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commentLikes)
    .where(eq(commentLikes.commentId, commentId));
  return ok({ liked: false, likeCount: count });
});
