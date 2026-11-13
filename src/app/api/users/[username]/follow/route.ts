import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { blocks, followRequests, follows, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { notify } from "@/lib/notify";

/**
 * Follow a user. Public accounts: creates the follow edge. Private accounts:
 * creates (or refreshes) a follow request instead. Blocked either way -> 403.
 */
export const POST = withAuth(async (_req, user, ctx) => {
  const username = await param(ctx, "username");
  const [target] = await db
    .select({ id: users.id, isPrivate: users.isPrivate })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  if (!target) throw new ApiError(404, "not_found", "User not found");
  if (target.id === user.id)
    throw new ApiError(400, "cannot_follow_self", "You cannot follow yourself");

  const blocked = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      sql`(blocker_id = ${user.id} and blocked_id = ${target.id}) or (blocker_id = ${target.id} and blocked_id = ${user.id})`,
    )
    .limit(1);
  if (blocked[0]) throw new ApiError(403, "blocked", "You cannot follow this user");

  if (target.isPrivate) {
    await db
      .insert(followRequests)
      .values({ requesterId: user.id, targetId: target.id })
      .onConflictDoNothing();
    await notify({ userId: target.id, actorId: user.id, type: "follow_request" });
    return ok({ status: "requested" });
  }

  await db
    .insert(follows)
    .values({ followerId: user.id, followingId: target.id })
    .onConflictDoNothing();
  await notify({ userId: target.id, actorId: user.id, type: "follow" });
  return ok({ status: "following" });
});

/** Unfollow, or cancel a pending follow request. */
export const DELETE = withAuth(async (_req, user, ctx) => {
  const username = await param(ctx, "username");
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  if (!target) throw new ApiError(404, "not_found", "User not found");

  await db
    .delete(follows)
    .where(and(eq(follows.followerId, user.id), eq(follows.followingId, target.id)));
  await db
    .delete(followRequests)
    .where(and(eq(followRequests.requesterId, user.id), eq(followRequests.targetId, target.id)));
  return ok({ status: "none" });
});
