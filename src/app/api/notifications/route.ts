import { sql } from "drizzle-orm";
import { ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { rawRows } from "@/lib/queries";

export const GET = withAuth(async (req, user) => {
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50);

  const rows = await rawRows<{
    id: string;
    type: string;
    post_id: string | null;
    comment_id: string | null;
    conversation_id: string | null;
    read_at: Date | null;
    created_at: Date;
    actor: { id: string; username: string; fullName: string; avatarUrl: string | null; isPrivate: boolean };
    post_thumb: { url: string; kind: string } | null;
    snippet: string | null;
  }>(sql`
    select
      n.id, n.type, n.post_id, n.comment_id, n.conversation_id, n.read_at, n.created_at,
      json_build_object(
        'id', au.id, 'username', au.username, 'fullName', au.full_name,
        'avatarUrl', case when au.avatar_media_id is null then null else '/api/media/' || au.avatar_media_id end,
        'isPrivate', au.is_private
      ) as actor,
      case when p.id is null then null else (
        select json_build_object('url', '/api/media/' || m.id, 'kind', m.kind)
        from post_media pm join media m on m.id = pm.media_id
        where pm.post_id = p.id order by pm.position limit 1
      ) end as post_thumb,
      coalesce(c.body, p.caption) as snippet
    from notifications n
    join users au on au.id = n.actor_id
    left join posts p on p.id = n.post_id
    left join comments c on c.id = n.comment_id
    where n.user_id = ${user.id}
      ${before ? sql`and (n.created_at, n.id) < (${before}::timestamptz, '00000000-0000-0000-0000-000000000000'::uuid)` : sql``}
    order by n.created_at desc, n.id desc
    limit ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const [unreadRow] = await rawRows<{ count: number }>(
    sql`select count(*)::int as count from notifications where user_id = ${user.id} and read_at is null`,
  );

  return ok({
    unreadCount: unreadRow?.count ?? 0,
    notifications: page.map((r) => ({
      id: r.id,
      type: r.type,
      actor: r.actor,
      postId: r.post_id,
      commentId: r.comment_id,
      conversationId: r.conversation_id,
      postThumbUrl: r.post_thumb?.url ?? null,
      postThumbKind: r.post_thumb?.kind === "video" ? "video" : r.post_thumb ? "image" : null,
      snippet: r.snippet,
      readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    nextCursor: hasMore && page.length > 0 ? new Date(page[page.length - 1].created_at).toISOString() : null,
  });
});
