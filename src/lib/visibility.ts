import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Visibility rules enforced in SQL on every list/detail read.
 * A post/story is visible to the viewer when the author is not blocked
 * (either direction), and the author is public, or the viewer is the author,
 * or the viewer is an approved follower. Reported posts are hidden from the
 * reporter.
 */
export function postVisibilitySql(viewerId: string): SQL {
  return sql`
    not exists (
      select 1 from blocks b
      where (b.blocker_id = ${viewerId} and b.blocked_id = p.author_id)
         or (b.blocker_id = p.author_id and b.blocked_id = ${viewerId})
    )
    and not exists (
      select 1 from reports r
      where r.reporter_id = ${viewerId} and r.target_type = 'post' and r.target_id = p.id
    )
    and (
      p.author_id = ${viewerId}
      or not exists (select 1 from users pu where pu.id = p.author_id and pu.is_private)
      or exists (
        select 1 from follows f
        where f.follower_id = ${viewerId} and f.following_id = p.author_id
      )
    )
  `;
}

export function userVisibleToSql(viewerId: string): SQL {
  return sql`
    not exists (
      select 1 from blocks b
      where (b.blocker_id = ${viewerId} and b.blocked_id = u.id)
         or (b.blocker_id = u.id and b.blocked_id = ${viewerId})
    )
  `;
}

export function storyVisibilitySql(viewerId: string): SQL {
  return sql`
    not exists (
      select 1 from blocks b
      where (b.blocker_id = ${viewerId} and b.blocked_id = s.author_id)
         or (b.blocker_id = s.author_id and b.blocked_id = ${viewerId})
    )
    and (
      s.author_id = ${viewerId}
      or not exists (select 1 from users pu where pu.id = s.author_id and pu.is_private)
      or exists (
        select 1 from follows f
        where f.follower_id = ${viewerId} and f.following_id = s.author_id
      )
    )
  `;
}

export async function dbBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const rows = await db.execute<{ blocked: boolean }>(sql`
    select exists (
      select 1 from blocks
      where (blocker_id = ${a} and blocked_id = ${b})
         or (blocker_id = ${b} and blocked_id = ${a})
    ) as blocked
  `);
  return Boolean((rows as unknown as Array<{ blocked: boolean }>)[0]?.blocked);
}

/** Can `viewerId` view content authored by `author`? */
export async function canViewContent(
  viewerId: string,
  authorId: string,
  authorIsPrivate: boolean,
): Promise<boolean> {
  if (viewerId === authorId) return true;
  if (await dbBlockedEitherWay(viewerId, authorId)) return false;
  if (!authorIsPrivate) return true;
  const rows = await db.execute<{ ok: boolean }>(sql`
    select exists (
      select 1 from follows f
      where f.follower_id = ${viewerId} and f.following_id = ${authorId}
    ) as ok
  `);
  return Boolean((rows as unknown as Array<{ ok: boolean }>)[0]?.ok);
}
