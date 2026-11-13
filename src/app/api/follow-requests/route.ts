import { sql } from "drizzle-orm";
import { ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { rawRows } from "@/lib/queries";

/** Incoming follow requests for the signed-in user. */
export const GET = withAuth(async (_req, user) => {
  const rows = await rawRows<{
    id: string;
    created_at: Date;
    user: { id: string; username: string; fullName: string; avatarUrl: string | null; isPrivate: boolean };
  }>(sql`
    select
      fr.id, fr.created_at,
      json_build_object(
        'id', u.id, 'username', u.username, 'fullName', u.full_name,
        'avatarUrl', case when u.avatar_media_id is null then null else '/api/media/' || u.avatar_media_id end,
        'isPrivate', u.is_private
      ) as user
    from follow_requests fr
    join users u on u.id = fr.requester_id
    where fr.target_id = ${user.id}
    order by fr.created_at desc
    limit 100
  `);
  return ok({
    requests: rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).toISOString(),
      user: r.user,
    })),
  });
});
