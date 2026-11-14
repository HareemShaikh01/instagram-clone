import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { ApiError, err } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { mediaAllowed } from "@/lib/media-acl";
import { openMediaSource } from "@/lib/media";

export const GET = withAuth(async (req, viewer, ctx) => {
  const id = await param(ctx, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(400, "invalid_id", "Invalid media id");

  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row) return err(404, "not_found", "Media not found");
  if (row.state !== "ready") return err(404, "not_found", "Media not found");

  // Access control: owner, or media attached to content the viewer can see.
  if (!(await mediaAllowed(viewer.id, id)))
    return err(403, "forbidden", "You do not have access to this media");

  const source = await openMediaSource(row);
  const size = source.size;
  const etag = `"${row.id}-${size}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  }

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
        return new Response(source.open(start, end), {
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

  return new Response(source.open(0, size - 1), {
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
});
