import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ApiError, intParam, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { rawRows } from "@/lib/queries";

export const GET = withAuth(async (req, user, ctx) => {
  const username = await param(ctx, "username");
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "following" ? "following" : "followers";
  const limit = intParam(url.searchParams.get("limit"), 30, 100);
  const cursor = url.searchParams.get("cursor");

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (!target) throw new ApiError(404, "not_found", "User not found");

  const filters: SQL[] =
    mode === "followers"
      ? [sql`f.following_id = ${target.id}`]
      : [sql`f.follower_id = ${target.id}`];
  if (cursor) {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (iso && id) filters.push(sql`(f.created_at, u.id) < (${iso}::timestamptz, ${id}::uuid)`);
  }

  const rows = await rawRows<{
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    is_private: boolean;
    is_following: boolean;
    followed_at: Date;
  }>(sql`
    select
      u.id, u.username, u.full_name, f.created_at as followed_at,
      case when u.avatar_media_id is null then null else '/api/media/' || u.avatar_media_id end as avatar_url,
      u.is_private,
      exists(select 1 from follows f2 where f2.follower_id = ${user.id} and f2.following_id = u.id) as is_following
    from follows f
    join users u on u.id = ${mode === "followers" ? sql`f.follower_id` : sql`f.following_id`}
    where ${sql.join(filters, sql` and `)}
    order by f.created_at desc, u.id desc
    limit ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && page.length > 0
      ? Buffer.from(
          `${new Date(page[page.length - 1].followed_at).toISOString()}|${page[page.length - 1].id}`,
        ).toString("base64url")
      : null;

  return ok({
    users: page.map((r) => ({
      id: r.id,
      username: r.username,
      fullName: r.full_name,
      avatarUrl: r.avatar_url,
      isPrivate: r.is_private,
      isFollowing: r.is_following,
    })),
    nextCursor,
  });
});
