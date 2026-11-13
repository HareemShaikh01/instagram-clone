import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { withHandler } from "@/lib/api-auth";
import { verifyPassword } from "@/lib/password";
import { createSession, sessionCookie } from "@/lib/session";
import { toSessionUserDTO } from "@/lib/dto";
import { loginSchema } from "@/lib/validate";

export const POST = withHandler(async (req) => {
  const body = loginSchema.parse(await req.json());
  const ip = clientIp(req);
  rateLimit(`login:${ip}`, 20, 15 * 60_000);

  const identifier = body.identifier.toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${identifier} or lower(${users.email}) = ${identifier}`)
    .limit(1);

  const valid = user ? await verifyPassword(body.password, user.passwordHash) : false;
  if (!user || !valid) {
    rateLimit(`login-fail:${ip}`, 10, 15 * 60_000);
    throw new ApiError(401, "invalid_credentials", "Incorrect username or password");
  }

  const { token, expiresAt } = await createSession(user.id);
  return ok({ user: toSessionUserDTO(user) }, {
    headers: { "Set-Cookie": sessionCookie(token, expiresAt) },
  });
});
