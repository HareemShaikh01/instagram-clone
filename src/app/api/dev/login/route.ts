import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ok } from "@/lib/api";
import { withHandler } from "@/lib/api-auth";
import { createSession, sessionCookie } from "@/lib/session";
import { toSessionUserDTO } from "@/lib/dto";

/** Temporary dev-only helper for automated browser checks. Removed after verification. */
export const GET = withHandler(async (req) => {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: { code: "forbidden", message: "Dev only" } }, { status: 403 });
  }
  const username = new URL(req.url).searchParams.get("username");
  if (!username) return NextResponse.json({ error: { code: "bad_request", message: "username required" } }, { status: 400 });
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);
  if (!user) return NextResponse.json({ error: { code: "not_found", message: "User not found" } }, { status: 404 });
  const { token, expiresAt } = await createSession(user.id);
  return ok({ user: toSessionUserDTO(user) }, {
    headers: { "Set-Cookie": sessionCookie(token, expiresAt) },
  });
});
