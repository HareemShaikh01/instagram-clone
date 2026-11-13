import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyViews, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { canViewContent } from "@/lib/visibility";

/** Record a view. Unique on (story, user) so repeats are not double-counted. */
export const POST = withAuth(async (_req, user, ctx) => {
  const id = await param(ctx, "id");
  const [story] = await db
    .select({ authorId: stories.authorId, isPrivate: users.isPrivate })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(eq(stories.id, id), sql`expires_at > now()`))
    .limit(1);
  if (!story) throw new ApiError(404, "not_found", "Story not found or expired");
  if (!(await canViewContent(user.id, story.authorId, story.isPrivate)))
    throw new ApiError(403, "forbidden", "You cannot view this story");

  await db.insert(storyViews).values({ storyId: id, userId: user.id }).onConflictDoNothing();
  return ok({ viewed: true });
});
