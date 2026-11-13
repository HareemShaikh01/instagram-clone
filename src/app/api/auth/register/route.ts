import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { media, users } from "@/db/schema";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { withHandler } from "@/lib/api-auth";
import { hashPassword } from "@/lib/password";
import { createSession, sessionCookie } from "@/lib/session";
import { toSessionUserDTO } from "@/lib/dto";
import { registerSchema } from "@/lib/validate";

export const POST = withHandler(async (req) => {
  rateLimit(`register:${clientIp(req)}`, 5, 3600_000);
  const body = registerSchema.parse(await req.json());

  const existing = await db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(
      sql`lower(${users.username}) = ${body.username} or lower(${users.email}) = ${body.email}`,
    );
  for (const row of existing) {
    if (row.username.toLowerCase() === body.username)
      throw new ApiError(409, "username_taken", "That username is already taken");
    if (row.email.toLowerCase() === body.email)
      throw new ApiError(409, "email_taken", "An account with that email already exists");
  }

  const passwordHash = await hashPassword(body.password);
  const [user] = await db
    .insert(users)
    .values({
      username: body.username,
      email: body.email,
      fullName: body.fullName,
      passwordHash,
    })
    .returning();

  if (body.avatarMediaId) {
    const m = await db
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, body.avatarMediaId), eq(media.ownerId, user.id)))
      .limit(1);
    if (!m[0]) throw new ApiError(403, "media_forbidden", "You do not own that media");
    await db.update(users).set({ avatarMediaId: body.avatarMediaId }).where(eq(users.id, user.id));
    user.avatarMediaId = body.avatarMediaId;
  }

  const { token, expiresAt } = await createSession(user.id);
  return ok({ user: toSessionUserDTO(user) }, {
    headers: { "Set-Cookie": sessionCookie(token, expiresAt) },
  });
});
