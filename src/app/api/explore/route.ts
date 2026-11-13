import { decodeCursor, intParam, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { queryPosts, suggestAccounts, trendingHashtags } from "@/lib/queries";

export const GET = withAuth(async (req, user) => {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = intParam(url.searchParams.get("limit"), 12, 30);

  const posts = await queryPosts({
    viewerId: user.id,
    explore: true,
    limit,
    cursor: cursor ? decodeCursor(cursor) : undefined,
  });

  // Discovery metadata only ships on the first page.
  const [tags, suggestions] = cursor
    ? [[], []]
    : await Promise.all([trendingHashtags(8), suggestAccounts(user.id, 6)]);

  return ok({
    posts,
    nextCursor: posts.at(-1)?.nextCursor ?? null,
    trendingTags: tags,
    suggestions,
  });
});
