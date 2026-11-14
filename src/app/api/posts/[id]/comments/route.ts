import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { comments, mentions, posts, users } from "@/db/schema";
import { ApiError, clientIp, decodeCursor, intParam, ok, rateLimit } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { notify } from "@/lib/notify";
import { queryComments } from "@/lib/queries";
import { extractMentions } from "@/lib/text";
import { canViewContent } from "@/lib/visibility";
import { createCommentSchema } from "@/lib/validate";

export const GET = withAuth(async (req, user, ctx) => {
  const postId = await param(ctx, "id");
  const url = new URL(req.url);
  const parentId = url.searchParams.get("parentId");
  const cursor = url.searchParams.get("cursor");
  const limit = intParam(url.searchParams.get("limit"), 12, 50);

  const [post] = await db
    .select({ authorId: posts.authorId, isPrivate: users.isPrivate })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) throw new ApiError(404, "not_found", "Post not found");
  if (!(await canViewContent(user.id, post.authorId, post.isPrivate)))
    throw new ApiError(403, "forbidden", "You cannot view this post");

  const { items, nextCursor } = await queryComments({
    postId,
    viewerId: user.id,
    parentId: parentId === null ? undefined : parentId,
    after: cursor ? decodeCursor(cursor) : undefined,
    limit,
  });
  return ok({ comments: items, nextCursor });
});

export const POST = withAuth(async (req, user, ctx) => {
  const postId = await param(ctx, "id");
  rateLimit(`comment:${user.id}:${clientIp(req)}`, 30, 60_000);
  const body = createCommentSchema.parse(await req.json());

  const [post] = await db
    .select({ authorId: posts.authorId, isPrivate: users.isPrivate })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) throw new ApiError(404, "not_found", "Post not found");
  if (!(await canViewContent(user.id, post.authorId, post.isPrivate)))
    throw new ApiError(403, "forbidden", "You cannot comment on this post");

  if (body.parentId) {
    const [parent] = await db
      .select({ id: comments.id, postId: comments.postId })
      .from(comments)
      .where(and(eq(comments.id, body.parentId), eq(comments.postId, postId)))
      .limit(1);
    if (!parent) throw new ApiError(400, "invalid_parent", "Parent comment not found on this post");
  }

  const [comment] = await db
    .insert(comments)
    .values({ postId, authorId: user.id, body: body.body, parentId: body.parentId ?? null })
    .returning();

  await notify({
    userId: post.authorId,
    actorId: user.id,
    type: "comment",
    postId,
    commentId: comment.id,
  });

  const usernames = extractMentions(body.body);
  if (usernames.length > 0) {
    const mentioned = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(sql`lower(${users.username})`, usernames));
    for (const m of mentioned) {
      await db.insert(mentions).values({ userId: m.id, commentId: comment.id }).onConflictDoNothing();
      await notify({
        userId: m.id,
        actorId: user.id,
        type: "mention",
        postId,
        commentId: comment.id,
      });
    }
  }

  const { items } = await queryComments({
    postId,
    viewerId: user.id,
    id: comment.id,
    parentId: body.parentId ?? undefined,
    limit: 1,
  });
  const created = items[0] ?? null;
  return ok({ comment: created });
});
