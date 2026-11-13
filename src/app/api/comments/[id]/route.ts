import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { comments, posts, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { editCommentSchema } from "@/lib/validate";

async function loadComment(commentId: string) {
  const [row] = await db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      postId: comments.postId,
      postAuthorId: posts.authorId,
    })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row) throw new ApiError(404, "not_found", "Comment not found");
  return row;
}

export const PATCH = withAuth(async (req, user, ctx) => {
  const id = await param(ctx, "id");
  const row = await loadComment(id);
  if (row.authorId !== user.id)
    throw new ApiError(403, "forbidden", "You can only edit your own comments");
  const body = editCommentSchema.parse(await req.json());
  await db
    .update(comments)
    .set({ body: body.body, editedAt: new Date() })
    .where(eq(comments.id, id));
  return ok({ ok: true });
});

export const DELETE = withAuth(async (_req, user, ctx) => {
  const id = await param(ctx, "id");
  const row = await loadComment(id);
  if (row.authorId !== user.id && row.postAuthorId !== user.id)
    throw new ApiError(403, "forbidden", "You cannot delete this comment");
  await db.delete(comments).where(eq(comments.id, id));
  return ok({ ok: true });
});
