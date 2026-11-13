import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { messages } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";

/** Unsend a message (sender only). */
export const DELETE = withAuth(async (_req, user, ctx) => {
  const id = await param(ctx, "id");
  const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!msg) throw new ApiError(404, "not_found", "Message not found");
  if (msg.senderId !== user.id)
    throw new ApiError(403, "forbidden", "You can only delete your own messages");
  await db.delete(messages).where(eq(messages.id, id));
  return ok({ ok: true });
});
