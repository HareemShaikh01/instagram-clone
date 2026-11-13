import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { err, ok } from "@/lib/api";
import { withHandler } from "@/lib/api-auth";

export const GET = withHandler(async () => {
  try {
    await db.execute(sql`select 1`);
    return ok({ status: "ok", db: true });
  } catch {
    return err(503, "unavailable", "Database unavailable");
  }
});
