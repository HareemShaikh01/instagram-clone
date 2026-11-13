import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ApiError, decodeCursor, intParam, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { queryPosts } from "@/lib/queries";
import { canViewContent } from "@/lib/visibility";

export const GET = withAuth(async (req, user, ctx) => {
  const username = await param(ctx, "username");
  const [target] = await db
    .select({ id: users.id, isPrivate: users.isPrivate })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!target) throw new ApiError(404, "not_found", "User not found");

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "posts";
  const cursor = url.searchParams.get("cursor");
  const limit = intParam(url.searchParams.get("limit"), 12, 30);

  if (tab === "saved") {
    if (target.id !== user.id)
      throw new ApiError(403, "forbidden", "Saved posts are private");
  } else if (!(await canViewContent(user.id, target.id, target.isPrivate))) {
    return ok({ posts: [], nextCursor: null, restricted: true });
  }

  const items = await queryPosts({
    viewerId: user.id,
    authorId: tab === "posts" ? target.id : undefined,
    savedByUserId: tab === "saved" ? target.id : undefined,
    taggedUserId: tab === "tagged" ? target.id : undefined,
    cursor: cursor ? decodeCursor(cursor) : undefined,
    limit,
  });
  return ok({ posts: items, nextCursor: items.at(-1)?.nextCursor ?? null });
});
