import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { reportSchema } from "@/lib/validate";

export const POST = withAuth(async (req, user) => {
  rateLimit(`report:${user.id}:${clientIp(req)}`, 20, 3600_000);
  const body = reportSchema.parse(await req.json());
  await db
    .insert(reports)
    .values({
      reporterId: user.id,
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason,
    })
    .onConflictDoNothing();
  return ok({ reported: true, message: "Thanks for reporting. We will review it." });
});
