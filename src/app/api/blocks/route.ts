import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { blocks, followRequests, follows, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { rawRows } from "@/lib/queries";
import { blockSchema } from "@/lib/validate";

export const GET = withAuth(async (_req, user) => {
  const rows = await rawRows<{
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
  }>(sql`
    select u.id, u.username, u.full_name,
      case when u.avatar_media_id is null then null else '/api/media/' || u.avatar_media_id end as avatar_url
    from blocks b
    join users u on u.id = b.blocked_id
    where b.blocker_id = ${user.id}
    order by b.created_at desc
    limit 100
  `);
  return ok({
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      fullName: r.full_name,
      avatarUrl: r.avatar_url,
    })),
  });
});

/** Block a user: removes follows both ways, pending requests, and prevents future contact. */
export const POST = withAuth(async (_req, user) => {
  const body = blockSchema.parse(await _req.json());
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${body.username})`)
    .limit(1);
  if (!target) throw new ApiError(404, "not_found", "User not found");
  if (target.id === user.id) throw new ApiError(400, "cannot_block_self", "You cannot block yourself");

  await db.transaction(async (tx) => {
    await tx
      .insert(blocks)
      .values({ blockerId: user.id, blockedId: target.id })
      .onConflictDoNothing();
    await tx.delete(follows).where(sql`
      (follower_id = ${user.id} and following_id = ${target.id})
      or (follower_id = ${target.id} and following_id = ${user.id})
    `);
    await tx.delete(followRequests).where(sql`
      (requester_id = ${user.id} and target_id = ${target.id})
      or (requester_id = ${target.id} and target_id = ${user.id})
    `);
  });
  return ok({ blocked: true });
});

export const DELETE = withAuth(async (_req, user) => {
  const url = new URL(_req.url);
  const username = url.searchParams.get("username") ?? "";
  const parsed = blockSchema.parse({ username });
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${parsed.username})`)
    .limit(1);
  if (!target) throw new ApiError(404, "not_found", "User not found");
  await db
    .delete(blocks)
    .where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, target.id)));
  return ok({ blocked: false });
});
