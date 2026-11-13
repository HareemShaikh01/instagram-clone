import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { passwordResetTokens, users } from "@/db/schema";
import { clientIp, ok, rateLimit } from "@/lib/api";
import { withHandler } from "@/lib/api-auth";
import { randomToken, sessionTokenHash } from "@/lib/password";
import { forgotPasswordSchema } from "@/lib/validate";

/**
 * No email provider is configured in this environment. When EMAIL_ENABLED is
 * not set, the reset link is returned to the requester and logged server-side
 * as a local-development mail stub. Configure an email provider before
 * deploying publicly.
 */
const EMAIL_ENABLED = Boolean(process.env.EMAIL_ENABLED);

export const POST = withHandler(async (req) => {
  rateLimit(`forgot:${clientIp(req)}`, 5, 3600_000);
  const body = forgotPasswordSchema.parse(await req.json());

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  let devResetUrl: string | undefined;
  if (user) {
    const token = randomToken();
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sessionTokenHash(token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const origin = req.headers.get("origin") ?? "http://localhost:3000";
    devResetUrl = `${origin}/reset-password?token=${token}`;
    console.log(`[mail] password reset link for ${body.email}: ${devResetUrl}`);
  }

  return ok({
    message: "If that email belongs to an account, a reset link has been created.",
    ...(EMAIL_ENABLED ? {} : { devResetUrl, devNote: "Email delivery is not configured in this environment; the reset link is shown here for local testing." }),
  });
});
