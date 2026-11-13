import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { searchHistory } from "@/db/schema";
import { ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (_req, user) => {
  const rows = await db
    .select({ query: searchHistory.query, createdAt: searchHistory.createdAt })
    .from(searchHistory)
    .where(eq(searchHistory.userId, user.id))
    .orderBy(sql`created_at desc`)
    .limit(10);
  return ok({ history: rows.map((r) => r.query) });
});

export const DELETE = withAuth(async (_req, user) => {
  await db.delete(searchHistory).where(eq(searchHistory.userId, user.id));
  return ok({ cleared: true });
});
