import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationParticipants } from "@/db/schema";
import { ApiError, intParam, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { queryMessages } from "@/lib/queries";

async function requireParticipant(conversationId: string, userId: string) {
  const [p] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  if (!p) throw new ApiError(404, "not_found", "Conversation not found");
}

/** Fetch messages and mark the conversation read for the viewer. */
export const GET = withAuth(async (req, user, ctx) => {
  const id = await param(ctx, "id");
  await requireParticipant(id, user.id);

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = intParam(url.searchParams.get("limit"), 30, 100);

  const items = await queryMessages({
    conversationId: id,
    viewerId: user.id,
    before: before ? new Date(before) : undefined,
    limit,
  });

  await db
    .update(conversationParticipants)
    .set({ lastReadAt: sql`now()` })
    .where(
      and(
        eq(conversationParticipants.conversationId, id),
        eq(conversationParticipants.userId, user.id),
      ),
    );

  return ok({ messages: items });
});
