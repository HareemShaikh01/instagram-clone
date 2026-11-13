import { db } from "@/db/client";
import { searchHistory } from "@/db/schema";
import { decodeCursor, intParam, ok, rateLimit } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { queryPosts, searchHashtags, searchUsers } from "@/lib/queries";

export const GET = withAuth(async (req, user) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const cursor = url.searchParams.get("cursor");
  const limit = intParam(url.searchParams.get("limit"), 12, 30);
  rateLimit(`search:${user.id}`, 120, 60_000);

  if (q.length === 0) return ok({ users: [], hashtags: [], posts: [], nextCursor: null });

  // Only the first page records history (pagination requests carry a cursor).
  if (!cursor) {
    await db
      .insert(searchHistory)
      .values({ userId: user.id, query: q })
      .onConflictDoUpdate({
        target: [searchHistory.userId, searchHistory.query],
        set: { createdAt: new Date() },
      });
  }

  const [users, hashtags, posts] = await Promise.all([
    searchUsers(user.id, q),
    searchHashtags(q),
    queryPosts({
      viewerId: user.id,
      searchQ: q,
      limit,
      cursor: cursor ? decodeCursor(cursor) : undefined,
    }),
  ]);
  return ok({ users, hashtags, posts, nextCursor: posts.at(-1)?.nextCursor ?? null });
});
