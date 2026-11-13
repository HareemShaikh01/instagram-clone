import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { encodeCursor } from "./api";
import type {
  CommentDTO,
  ConversationDTO,
  MediaDTO,
  MessageDTO,
  PostDTO,
  ProfileDTO,
  StoryDTO,
  StoryGroupDTO,
  SuggestedUserDTO,
  UserSummary,
} from "./types";
import { postVisibilitySql, storyVisibilitySql } from "./visibility";

/** postgres.js returns a RowList (array); node-postgres returns { rows }. */
export async function rawRows<T>(query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown;
  if (Array.isArray(res)) return res as T[];
  const withRows = res as { rows?: T[] };
  return withRows.rows ?? [];
}

function avatarUrlExpr(col: SQL): SQL {
  return sql`case when ${col} is null then null else '/api/media/' || ${col} end`;
}

function userSummaryExpr(alias: string): SQL {
  return sql`json_build_object(
    'id', ${sql.raw(alias)}.id,
    'username', ${sql.raw(alias)}.username,
    'fullName', ${sql.raw(alias)}.full_name,
    'avatarUrl', ${avatarUrlExpr(sql.raw(`${alias}.avatar_media_id`))},
    'isPrivate', ${sql.raw(alias)}.is_private
  )`;
}

function mediaJsonExpr(): SQL {
  return sql`coalesce((
    select json_agg(x.j) from (
      select json_build_object(
        'id', m.id, 'kind', m.kind, 'url', '/api/media/' || m.id,
        'width', m.width, 'height', m.height, 'durationMs', m.duration_ms
      ) as j
      from post_media pm
      join media m on m.id = pm.media_id
      where pm.post_id = p.id
      order by pm.position
    ) x
  ), '[]'::json)`;
}

function latestCommentExpr(viewerId: string): SQL {
  return sql`(
    select json_build_object(
      'id', c.id, 'body', c.body, 'createdAt', c.created_at, 'editedAt', c.edited_at,
      'parentId', null,
      'author', ${userSummaryExpr("cu")},
      'likeCount', (select count(*) from comment_likes cl where cl.comment_id = c.id)::int,
      'likedByMe', exists(select 1 from comment_likes cl where cl.comment_id = c.id and cl.user_id = ${viewerId}),
      'replyCount', 0
    )
    from comments c
    join users cu on cu.id = c.author_id
    where c.post_id = p.id and c.parent_id is null
    order by c.created_at desc
    limit 1
  )`;
}

export type PostQueryOptions = {
  viewerId: string;
  authorId?: string;
  savedByUserId?: string;
  taggedUserId?: string;
  hashtag?: string;
  explore?: boolean;
  feedOnly?: boolean;
  searchQ?: string;
  cursor?: { createdAt: Date; id: string };
  limit?: number;
  postId?: string;
};

export async function queryPosts(opts: PostQueryOptions): Promise<PostDTO[]> {
  const viewerId = opts.viewerId;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 30);

  const filters: SQL[] = [postVisibilitySql(viewerId)];
  if (opts.authorId) filters.push(sql`p.author_id = ${opts.authorId}`);
  if (opts.postId) filters.push(sql`p.id = ${opts.postId}`);
  if (opts.savedByUserId)
    filters.push(
      sql`exists (select 1 from saved_posts sp where sp.post_id = p.id and sp.user_id = ${opts.savedByUserId})`,
    );
  if (opts.taggedUserId)
    filters.push(
      sql`exists (select 1 from post_media pm2 join media m2 on m2.id = pm2.media_id where pm2.post_id = p.id and m2.owner_id = ${opts.taggedUserId})`,
    );
  if (opts.hashtag)
    filters.push(
      sql`exists (
        select 1 from post_hashtags ph join hashtags h on h.id = ph.hashtag_id
        where ph.post_id = p.id and h.tag = ${opts.hashtag.toLowerCase()}
      )`,
    );
  if (opts.explore) filters.push(sql`not exists (select 1 from users pu2 where pu2.id = p.author_id and pu2.is_private)`);
  if (opts.feedOnly)
    filters.push(
      sql`(p.author_id = ${viewerId} or exists (
        select 1 from follows f where f.follower_id = ${viewerId} and f.following_id = p.author_id
      ))`,
    );
  if (opts.searchQ) filters.push(sql`p.caption ilike ${"%" + opts.searchQ + "%"}`);
  if (opts.cursor)
    filters.push(sql`(p.created_at, p.id) < (${opts.cursor.createdAt}, ${opts.cursor.id})`);

  const where = sql.join(filters, sql` and `);

  const rows = await rawRows<{
    id: string;
    caption: string;
    location: string | null;
    created_at: Date;
    media: MediaDTO[];
    like_count: number;
    comment_count: number;
    liked_by_me: boolean;
    saved_by_me: boolean;
    latest_comment: CommentDTO | null;
    author: UserSummary;
  }>(sql`
    select
      p.id, p.caption, p.location, p.created_at,
      ${mediaJsonExpr()} as media,
      (select count(*) from likes l where l.post_id = p.id)::int as like_count,
      (select count(*) from comments c where c.post_id = p.id)::int as comment_count,
      exists(select 1 from likes l where l.post_id = p.id and l.user_id = ${viewerId}) as liked_by_me,
      exists(select 1 from saved_posts sp where sp.post_id = p.id and sp.user_id = ${viewerId}) as saved_by_me,
      ${latestCommentExpr(viewerId)} as latest_comment,
      ${userSummaryExpr("u")} as author
    from posts p
    join users u on u.id = p.author_id
    where ${where}
    order by p.created_at desc, p.id desc
    limit ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return page.map((r) => ({
    id: r.id,
    caption: r.caption,
    location: r.location,
    createdAt: new Date(r.created_at).toISOString(),
    author: r.author,
    media: r.media ?? [],
    likeCount: r.like_count,
    commentCount: r.comment_count,
    likedByMe: r.liked_by_me,
    savedByMe: r.saved_by_me,
    latestComment: r.latest_comment ?? null,
    nextCursor: hasMore
      ? Buffer.from(`${new Date(r.created_at).toISOString()}|${r.id}`).toString("base64url")
      : undefined,
  }));
}

/* ------------------------------------------------------------------ comments */

export async function queryComments(params: {
  postId: string;
  viewerId: string;
  parentId?: string | null;
  limit?: number;
  after?: { createdAt: Date; id: string };
}): Promise<{ items: CommentDTO[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 50);
  const filters: SQL[] = [sql`c.post_id = ${params.postId}`];
  filters.push(
    params.parentId === undefined
      ? sql`c.parent_id is null`
      : sql`c.parent_id = ${params.parentId}`,
  );
  if (params.after)
    filters.push(sql`(c.created_at, c.id) > (${params.after.createdAt}, ${params.after.id})`);
  const where = sql.join(filters, sql` and `);

  const rows = await rawRows<{
    id: string;
    body: string;
    created_at: Date;
    edited_at: Date | null;
    parent_id: string | null;
    like_count: number;
    liked_by_me: boolean;
    reply_count: number;
    author: UserSummary;
  }>(sql`
    select
      c.id, c.body, c.created_at, c.edited_at, c.parent_id,
      (select count(*) from comment_likes cl where cl.comment_id = c.id)::int as like_count,
      exists(select 1 from comment_likes cl where cl.comment_id = c.id and cl.user_id = ${params.viewerId}) as liked_by_me,
      (select count(*) from comments cc where cc.parent_id = c.id)::int as reply_count,
      ${userSummaryExpr("au")} as author
    from comments c
    join users au on au.id = c.author_id
    where ${where}
    order by c.created_at asc, c.id asc
    limit ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items: CommentDTO[] = page.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: new Date(r.created_at).toISOString(),
    editedAt: r.edited_at ? new Date(r.edited_at).toISOString() : null,
    parentId: r.parent_id,
    author: r.author,
    likeCount: r.like_count,
    likedByMe: r.liked_by_me,
    replyCount: r.reply_count,
  }));
  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1];
    nextCursor = encodeCursor(new Date(last.created_at), last.id);
  }
  return { items, nextCursor };
}

/* ------------------------------------------------------------------ profiles */

export async function getProfile(username: string, viewerId: string): Promise<ProfileDTO | null> {
  const rows = await rawRows<{
    dto: Omit<ProfileDTO, "bio" | "website" | "postCount" | "followerCount" | "followingCount" | "isFollowing" | "isFollowedBy" | "hasPendingRequest" | "hasIncomingRequest" | "isSelf" | "isBlocked">;
    bio: string;
    website: string | null;
    post_count: number;
    follower_count: number;
    following_count: number;
    is_following: boolean;
    is_followed_by: boolean;
    has_pending_request: boolean;
    has_incoming_request: boolean;
    is_blocked: boolean;
  }>(sql`
    select
      json_build_object(
        'id', u.id, 'username', u.username, 'fullName', u.full_name,
        'avatarUrl', ${avatarUrlExpr(sql.raw("u.avatar_media_id"))},
        'isPrivate', u.is_private
      ) as dto,
      u.bio, u.website,
      (select count(*) from posts p where p.author_id = u.id)::int as post_count,
      (select count(*) from follows f where f.following_id = u.id)::int as follower_count,
      (select count(*) from follows f where f.follower_id = u.id)::int as following_count,
      exists(select 1 from follows f where f.follower_id = ${viewerId} and f.following_id = u.id) as is_following,
      exists(select 1 from follows f where f.following_id = ${viewerId} and f.follower_id = u.id) as is_followed_by,
      exists(select 1 from follow_requests fr where fr.requester_id = ${viewerId} and fr.target_id = u.id) as has_pending_request,
      exists(select 1 from follow_requests fr where fr.requester_id = u.id and fr.target_id = ${viewerId}) as has_incoming_request,
      exists(select 1 from blocks b where b.blocker_id = ${viewerId} and b.blocked_id = u.id) as is_blocked
    from users u
    where lower(u.username) = lower(${username})
    limit 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    ...r.dto,
    bio: r.bio,
    website: r.website,
    postCount: r.post_count,
    followerCount: r.follower_count,
    followingCount: r.following_count,
    isFollowing: r.is_following,
    isFollowedBy: r.is_followed_by,
    hasPendingRequest: r.has_pending_request,
    hasIncomingRequest: r.has_incoming_request,
    isSelf: r.dto.id === viewerId,
    isBlocked: r.is_blocked,
  };
}

/* -------------------------------------------------------------------- stories */

export async function queryStoryGroups(params: {
  viewerId: string;
  authorId?: string;
  onlyUnseen?: boolean;
}): Promise<StoryGroupDTO[]> {
  const viewerId = params.viewerId;
  const filters: SQL[] = [
    sql`s.expires_at > now()`,
    storyVisibilitySql(viewerId),
  ];
  if (params.authorId) filters.push(sql`s.author_id = ${params.authorId}`);
  if (params.onlyUnseen)
    filters.push(
      sql`not exists (select 1 from story_views sv where sv.story_id = s.id and sv.user_id = ${viewerId})`,
    );
  const where = sql.join(filters, sql` and `);

  const rows = await rawRows<{
    author: UserSummary;
    stories: Array<{
      id: string;
      kind: "image" | "video" | "text";
      media: MediaDTO | null;
      bgColor: string | null;
      text: string | null;
      caption: string | null;
      overlayText: string | null;
      createdAt: Date;
      expiresAt: Date;
      seenByMe: boolean;
      viewCount: number;
    }>;
  }>(sql`
    select
      ${userSummaryExpr("su")} as author,
      json_agg(json_build_object(
        'id', s.id, 'kind', s.kind,
        'media', case when s.media_id is null then null else json_build_object(
          'id', m.id, 'kind', m.kind, 'url', '/api/media/' || m.id,
          'width', m.width, 'height', m.height, 'durationMs', m.duration_ms
        ) end,
        'bgColor', s.bg_color, 'text', s.text, 'caption', s.caption, 'overlayText', s.overlay_text,
        'createdAt', s.created_at, 'expiresAt', s.expires_at,
        'seenByMe', exists(select 1 from story_views sv where sv.story_id = s.id and sv.user_id = ${viewerId}),
        'viewCount', (select count(*) from story_views sv2 where sv2.story_id = s.id)::int
      ) order by s.created_at asc) as stories
    from stories s
    join users su on su.id = s.author_id
    left join media m on m.id = s.media_id
    where ${where}
    group by su.id
    order by bool_and(exists(select 1 from story_views sv3 where sv3.story_id = s.id and sv3.user_id = ${viewerId})) asc,
             max(s.created_at) desc
    limit 50
  `);

  return rows.map((r) => ({
    author: r.author,
    allSeen: r.stories.every((s) => s.seenByMe),
    stories: r.stories.map((s) => ({
      ...s,
      createdAt: new Date(s.createdAt).toISOString(),
      expiresAt: new Date(s.expiresAt).toISOString(),
    })),
  }));
}

/* ----------------------------------------------------------------- messaging */

export async function queryConversations(viewerId: string, searchQ?: string): Promise<ConversationDTO[]> {
  const rows = await rawRows<{
    id: string;
    participants: UserSummary[];
    last_message_at: Date | null;
    last_message_body: string | null;
    last_message_sender_id: string | null;
    unread_count: number;
  }>(sql`
    select
      c.id, c.last_message_at, c.last_message_body, c.last_message_sender_id,
      (
        select count(*)::int from messages m2
        where m2.conversation_id = c.id
          and m2.sender_id <> ${viewerId}
          and (cp.last_read_at is null or m2.created_at > cp.last_read_at)
      ) as unread_count,
      (
        select json_agg(json_build_object(
          'id', pu.id, 'username', pu.username, 'fullName', pu.full_name,
          'avatarUrl', ${avatarUrlExpr(sql.raw("pu.avatar_media_id"))},
          'isPrivate', pu.is_private
        ))
        from conversation_participants cp2
        join users pu on pu.id = cp2.user_id
        where cp2.conversation_id = c.id and cp2.user_id <> ${viewerId}
      ) as participants
    from conversations c
    join conversation_participants cp on cp.conversation_id = c.id and cp.user_id = ${viewerId}
    where not exists (
      select 1 from conversation_participants cp3
      join users pu3 on pu3.id = cp3.user_id
      where cp3.conversation_id = c.id and cp3.user_id <> ${viewerId}
        and exists (
          select 1 from blocks b
          where (b.blocker_id = ${viewerId} and b.blocked_id = pu3.id)
             or (b.blocker_id = pu3.id and b.blocked_id = ${viewerId})
        )
    )
    ${searchQ ? sql`and exists (
      select 1 from conversation_participants cp4
      join users pu4 on pu4.id = cp4.user_id
      where cp4.conversation_id = c.id and cp4.user_id <> ${viewerId}
        and (pu4.username ilike ${"%" + searchQ + "%"} or pu4.full_name ilike ${"%" + searchQ + "%"})
    )` : sql``}
    order by c.last_message_at desc nulls last, c.created_at desc
    limit 50
  `);
  return rows.map((r) => ({
    id: r.id,
    participants: r.participants ?? [],
    lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
    lastMessageBody: r.last_message_body,
    lastMessageSenderId: r.last_message_sender_id,
    unreadCount: r.unread_count,
  }));
}

export async function queryMessages(params: {
  conversationId: string;
  viewerId: string;
  before?: Date;
  limit?: number;
}): Promise<MessageDTO[]> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const filters: SQL[] = [sql`m.conversation_id = ${params.conversationId}`];
  if (params.before) filters.push(sql`m.created_at < ${params.before}`);
  const where = sql.join(filters, sql` and `);
  const rows = await rawRows<{
    id: string;
    conversation_id: string;
    body: string | null;
    created_at: Date;
    seen: boolean;
    media: MediaDTO | null;
    sender: UserSummary;
  }>(sql`
    select
      m.id, m.conversation_id, m.body, m.created_at,
      m.created_at <= coalesce(cp.last_read_at, to_timestamp(0)) as seen,
      case when m.media_id is null then null else json_build_object(
        'id', md.id, 'kind', md.kind, 'url', '/api/media/' || md.id,
        'width', md.width, 'height', md.height, 'durationMs', md.duration_ms
      ) end as media,
      ${userSummaryExpr("su")} as sender
    from messages m
    join users su on su.id = m.sender_id
    join conversation_participants cp
      on cp.conversation_id = m.conversation_id and cp.user_id <> m.sender_id
    left join media md on md.id = m.media_id
    where ${where}
    order by m.created_at desc, m.id desc
    limit ${limit}
  `);
  return rows.reverse().map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    sender: r.sender,
    body: r.body,
    media: r.media,
    createdAt: new Date(r.created_at).toISOString(),
    seen: r.seen,
  }));
}

/* ------------------------------------------------------------------ search & discovery */

function notBlockedWith(viewerId: string): SQL {
  return sql`not exists (
    select 1 from blocks b
    where (b.blocker_id = ${viewerId} and b.blocked_id = u.id)
       or (b.blocker_id = u.id and b.blocked_id = ${viewerId})
  )`;
}

export async function searchUsers(viewerId: string, q: string, limit = 10): Promise<UserSummary[]> {
  const pattern = `%${q}%`;
  return rawRows<UserSummary>(sql`
    select u.id, u.username, u.full_name as "fullName",
      ${avatarUrlExpr(sql`u.avatar_media_id`)} as "avatarUrl",
      u.is_private as "isPrivate"
    from users u
    where (u.username ilike ${pattern} or u.full_name ilike ${pattern})
      and u.id <> ${viewerId}
      and ${notBlockedWith(viewerId)}
    order by (u.username ilike ${pattern}) desc, u.username
    limit ${limit}
  `);
}

export type HashtagSummary = { tag: string; postCount: number };

export async function searchHashtags(q: string, limit = 10): Promise<HashtagSummary[]> {
  const pattern = `%${q.replace(/^#/, "")}%`;
  return rawRows<HashtagSummary>(sql`
    select h.tag, count(ph.post_id)::int as "postCount"
    from hashtags h
    join post_hashtags ph on ph.hashtag_id = h.id
    where h.tag ilike ${pattern}
    group by h.tag
    order by count(ph.post_id) desc, h.tag
    limit ${limit}
  `);
}

export async function trendingHashtags(limit = 8): Promise<HashtagSummary[]> {
  return rawRows<HashtagSummary>(sql`
    select h.tag, count(ph.post_id)::int as "postCount"
    from hashtags h
    join post_hashtags ph on ph.hashtag_id = h.id
    join posts p on p.id = ph.post_id
    where p.created_at > now() - interval '30 days'
    group by h.tag
    order by count(ph.post_id) desc, h.tag
    limit ${limit}
  `);
}

export async function suggestAccounts(viewerId: string, limit = 5): Promise<SuggestedUserDTO[]> {
  return rawRows<SuggestedUserDTO>(sql`
    select u.id, u.username, u.full_name as "fullName",
      ${avatarUrlExpr(sql`u.avatar_media_id`)} as "avatarUrl",
      u.is_private as "isPrivate",
      (select count(*) from follows f where f.following_id = u.id)::int as "followerCount",
      exists(select 1 from follows f where f.follower_id = ${viewerId} and f.following_id = u.id) as "isFollowing",
      exists(select 1 from follow_requests fr where fr.requester_id = ${viewerId} and fr.target_id = u.id) as "hasPendingRequest"
    from users u
    where u.id <> ${viewerId}
      and not exists (select 1 from follows f where f.follower_id = ${viewerId} and f.following_id = u.id)
      and ${notBlockedWith(viewerId)}
    order by (select count(*) from follows f2 where f2.following_id = u.id) desc, u.created_at desc
    limit ${limit}
  `);
}
