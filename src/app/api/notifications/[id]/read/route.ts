import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";

export const POST = withAuth(async (_req, user, ctx) => {
  const id = await param(ctx, "id");
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .returning({ id: notifications.id });
  if (rows.length === 0) throw new ApiError(404, "not_found", "Notification not found");
  return ok({ ok: true });
});
