import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { postVisibilitySql, storyVisibilitySql } from "@/lib/visibility";

/**
 * Access control for serving a media file: the owner, or media attached to
 * content the viewer can see (posts via the standard visibility rules, live
 * stories via story visibility, messages in the viewer's conversations, or
 * any user's avatar).
 */
export function mediaAccessSql(viewerId: string, mediaId: string): SQL {
  return sql`
    select (
      m.owner_id = ${viewerId}
      or exists (
        select 1 from post_media pm join posts p on p.id = pm.post_id
        where pm.media_id = m.id and ${postVisibilitySql(viewerId)}
      )
      or exists (
        select 1 from stories s
        where s.media_id = m.id and (s.expires_at > now() or s.author_id = ${viewerId})
          and ${storyVisibilitySql(viewerId)}
      )
      or exists (
        select 1 from messages msg
        join conversation_participants cp on cp.conversation_id = msg.conversation_id
        where msg.media_id = m.id and cp.user_id = ${viewerId}
      )
      or exists (select 1 from users u where u.avatar_media_id = m.id)
    ) as allowed
    from media m
    where m.id = ${mediaId}
  `;
}

export async function mediaAllowed(viewerId: string, mediaId: string): Promise<boolean> {
  const acl = await db.execute(mediaAccessSql(viewerId, mediaId));
  const first =
    (acl as { rows?: Array<{ allowed: boolean }> }).rows?.[0] ??
    (acl as unknown as Array<{ allowed: boolean }>)[0];
  return Boolean(first?.allowed);
}
