import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";

export const POST = withAuth(async (_req, user) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  return ok({ ok: true });
});
