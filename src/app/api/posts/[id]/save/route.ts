import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, savedPosts, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
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
}

export const POST = withAuth(async (_req, user, ctx) => {
  const postId = await param(ctx, "id");
  await requireVisiblePost(postId, user.id);
  await db
    .insert(savedPosts)
    .values({ userId: user.id, postId })
    .onConflictDoNothing();
  return ok({ saved: true });
});

export const DELETE = withAuth(async (_req, user, ctx) => {
  const postId = await param(ctx, "id");
  await db
    .delete(savedPosts)
    .where(and(eq(savedPosts.postId, postId), eq(savedPosts.userId, user.id)));
  return ok({ saved: false });
});
