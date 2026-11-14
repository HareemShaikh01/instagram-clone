import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { ApiError, err } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { readStoredFile, streamRange } from "@/lib/media";
import { postVisibilitySql, storyVisibilitySql } from "@/lib/visibility";

export const GET = withAuth(async (req, viewer, ctx) => {
  const id = await param(ctx, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(400, "invalid_id", "Invalid media id");

  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row) return err(404, "not_found", "Media not found");

  // Access control: owner, or media attached to content the viewer can see.
  const acl = await db.execute(sql`
    select (
      m.owner_id = ${viewer.id}
      or exists (
        select 1 from post_media pm join posts p on p.id = pm.post_id
        where pm.media_id = m.id and ${postVisibilitySql(viewer.id)}
      )
      or exists (
        select 1 from stories s
        where s.media_id = m.id and (s.expires_at > now() or s.author_id = ${viewer.id})
          and ${storyVisibilitySql(viewer.id)}
      )
      or exists (
        select 1 from messages msg
        join conversation_participants cp on cp.conversation_id = msg.conversation_id
        where msg.media_id = m.id and cp.user_id = ${viewer.id}
      )
      or exists (select 1 from users u where u.avatar_media_id = m.id)
    ) as allowed
    from media m
    where m.id = ${id}
  `);
  const first = (acl as { rows?: Array<{ allowed: boolean }> }).rows?.[0]
    ?? (acl as unknown as Array<{ allowed: boolean }>)[0];
  if (!first?.allowed) return err(403, "forbidden", "You do not have access to this media");

  const filePath = await readStoredFile(row.storageKey);
  const etag = `"${row.id}-${row.sizeBytes}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  }

  const size = row.sizeBytes;
  const baseHeaders: Record<string, string> = {
    "Content-Type": row.mimeType,
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
    "Accept-Ranges": "bytes",
  };

  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === "" ? NaN : parseInt(m[1], 10);
      let end = m[2] === "" ? NaN : parseInt(m[2], 10);
      if (Number.isNaN(start)) {
        start = size - (Number.isNaN(end) ? 1 : end);
        end = size - 1;
      } else if (Number.isNaN(end)) {
        end = size - 1;
      }
      end = Math.min(end, size - 1);
      if (start >= 0 && start <= end) {
        return new Response(streamRange(filePath, start, end), {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
          },
        });
      }
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }
  }

  return new Response(streamRange(filePath, 0, size - 1), {
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
});
