import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { followRequests, follows } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { notify } from "@/lib/notify";

const actionSchema = z.object({ action: z.enum(["accept", "reject"]) }).strict();

export const POST = withAuth(async (req, user, ctx) => {
  const id = await param(ctx, "id");
  const { action } = actionSchema.parse(await req.json());

  const [request] = await db
    .select()
    .from(followRequests)
    .where(and(eq(followRequests.id, id), eq(followRequests.targetId, user.id)))
    .limit(1);
  if (!request) throw new ApiError(404, "not_found", "Request not found");

  await db.delete(followRequests).where(eq(followRequests.id, id));

  if (action === "accept") {
    await db
      .insert(follows)
      .values({ followerId: request.requesterId, followingId: user.id })
      .onConflictDoNothing();
    await notify({ userId: request.requesterId, actorId: user.id, type: "follow_accept" });
    return ok({ status: "accepted" });
  }
  return ok({ status: "rejected" });
});
