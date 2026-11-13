import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { hashtags, media, mentions, postHashtags, postMedia, posts, users } from "@/db/schema";
import { ApiError, clientIp, decodeCursor, intParam, ok, rateLimit } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { encodeCursor } from "@/lib/api";
import { extractHashtags, extractMentions } from "@/lib/text";
import { notify } from "@/lib/notify";
import { queryPosts } from "@/lib/queries";
import { createPostSchema } from "@/lib/validate";

export const GET = withAuth(async (req, user) => {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = intParam(url.searchParams.get("limit"), 10, 30);
  const items = await queryPosts({
    viewerId: user.id,
    feedOnly: true,
    limit,
    cursor: cursor ? decodeCursor(cursor) : undefined,
  });
  return ok({ posts: items, nextCursor: items.at(-1)?.nextCursor ?? null });
});

async function syncHashtagsAndMentions(postId: string, authorId: string, text: string) {
  const tags = extractHashtags(text);
  for (const tag of tags) {
    const [h] = await db.insert(hashtags).values({ tag }).onConflictDoNothing().returning();
    const tagId =
      h?.id ??
      (await db.select({ id: hashtags.id }).from(hashtags).where(eq(hashtags.tag, tag)).limit(1))[0]
        ?.id;
    if (tagId)
      await db.insert(postHashtags).values({ postId, hashtagId: tagId }).onConflictDoNothing();
  }

  const usernames = extractMentions(text);
  if (usernames.length > 0) {
    const mentioned = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(sql`lower(${users.username})`, usernames));
    for (const m of mentioned) {
      await db.insert(mentions).values({ userId: m.id, postId }).onConflictDoNothing();
      await notify({ userId: m.id, actorId: authorId, type: "mention", postId });
    }
  }
}

export const POST = withAuth(async (req, user) => {
  rateLimit(`post-create:${user.id}:${clientIp(req)}`, 30, 3600_000);
  const body = createPostSchema.parse(await req.json());

  const mediaRows = await db
    .select()
    .from(media)
    .where(and(inArray(media.id, body.mediaIds), eq(media.ownerId, user.id)));
  if (mediaRows.length !== new Set(body.mediaIds).size)
    throw new ApiError(403, "media_forbidden", "One or more media items are not yours");
  const videos = mediaRows.filter((m) => m.kind === "video");
  if (videos.length > 0 && body.mediaIds.length > 1)
    throw new ApiError(400, "one_video_only", "A post can contain only one video");

  const postId = await db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({ authorId: user.id, caption: body.caption, location: body.location ?? null })
      .returning({ id: posts.id });
    await tx.insert(postMedia).values(
      body.mediaIds.map((mediaId, i) => ({ postId: post.id, mediaId, position: i })),
    );
    return post.id;
  });

  await syncHashtagsAndMentions(postId, user.id, body.caption);

  const [dto] = await queryPosts({ viewerId: user.id, postId, limit: 1 });
  return ok({ post: dto });
});
