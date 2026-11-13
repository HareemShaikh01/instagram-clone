import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { withHandler } from "@/lib/api-auth";
import { hashPassword, sessionTokenHash } from "@/lib/password";
import { resetPasswordSchema } from "@/lib/validate";

export const POST = withHandler(async (req) => {
  rateLimit(`reset:${clientIp(req)}`, 10, 3600_000);
  const body = resetPasswordSchema.parse(await req.json());

  const [row] = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, sessionTokenHash(body.token)),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .limit(1);

  if (!row) throw new ApiError(400, "invalid_token", "This reset link is invalid or has expired");

  const passwordHash = await hashPassword(body.password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });

  return ok({ message: "Password updated. Sign in with your new password." });
});
