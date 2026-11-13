import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { hashPassword, sessionTokenHash, verifyPassword } from "@/lib/password";
import { parseCookieHeader, SESSION_COOKIE } from "@/lib/session";
import { changePasswordSchema } from "@/lib/validate";

export const POST = withAuth(async (req, user) => {
  const body = changePasswordSchema.parse(await req.json());
  if (!(await verifyPassword(body.currentPassword, user.passwordHash)))
    throw new ApiError(403, "wrong_password", "Current password is incorrect");

  const passwordHash = await hashPassword(body.newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));

  // Invalidate every other session; keep the current one signed in.
  const currentToken = parseCookieHeader(req.headers.get("cookie"))[SESSION_COOKIE];
  const keepHash = currentToken ? sessionTokenHash(currentToken) : "";
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, user.id), ne(sessions.tokenHash, keepHash)));

  return ok({ message: "Password changed" });
});
