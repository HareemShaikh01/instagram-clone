import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ApiError, decodeCursor, intParam, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { queryPosts, rawRows } from "@/lib/queries";

export const GET = withAuth(async (req, user, ctx) => {
  const tag = (await param(ctx, "tag")).replace(/^#/, "").toLowerCase();
  if (!/^[\w.]{1,64}$/.test(tag)) throw new ApiError(400, "invalid_tag", "Invalid hashtag");

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = intParam(url.searchParams.get("limit"), 12, 30);

  const posts = await queryPosts({
    viewerId: user.id,
    hashtag: tag,
    limit,
    cursor: cursor ? decodeCursor(cursor) : undefined,
  });

  const [countRow] = await rawRows<{ count: number }>(sql`
    select count(*)::int as count
    from post_hashtags ph
    join hashtags h on h.id = ph.hashtag_id
    where h.tag = ${tag}
  `);

  return ok({
    tag,
    postCount: countRow?.count ?? 0,
    posts,
    nextCursor: posts.at(-1)?.nextCursor ?? null,
  });
});
