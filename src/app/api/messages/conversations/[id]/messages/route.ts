import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  conversationParticipants,
  conversations,
  media,
  messages,
  users,
} from "@/db/schema";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { notify } from "@/lib/notify";
import { queryMessages } from "@/lib/queries";
import { dbBlockedEitherWay } from "@/lib/visibility";
import { sendMessageSchema } from "@/lib/validate";

export const POST = withAuth(async (req, user, ctx) => {
  const conversationId = await param(ctx, "id");
  rateLimit(`dm:${user.id}:${clientIp(req)}`, 60, 60_000);
  const body = sendMessageSchema.parse(await req.json());

  const [me] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, user.id),
      ),
    )
    .limit(1);
  if (!me) throw new ApiError(404, "not_found", "Conversation not found");

  const others = await db
    .select({ userId: users.id, isPrivate: users.isPrivate })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        sql`${conversationParticipants.userId} <> ${user.id}`,
      ),
    );
  for (const o of others) {
    if (await dbBlockedEitherWay(user.id, o.userId))
      throw new ApiError(403, "blocked", "You cannot message this user");
  }

  if (body.mediaId) {
    const [m] = await db
      .select({ ownerId: media.ownerId })
      .from(media)
      .where(eq(media.id, body.mediaId))
      .limit(1);
    if (!m || m.ownerId !== user.id)
      throw new ApiError(403, "media_forbidden", "You do not own that media");
  }

  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      senderId: user.id,
      body: body.body ?? null,
      mediaId: body.mediaId ?? null,
    })
    .returning();

  const preview = body.body ?? "Photo";
  await db
    .update(conversations)
    .set({
      lastMessageAt: message.createdAt,
      lastMessageBody: preview,
      lastMessageSenderId: user.id,
    })
    .where(eq(conversations.id, conversationId));

  for (const o of others) {
    await notify({
      userId: o.userId,
      actorId: user.id,
      type: "message",
      conversationId,
    });
  }

  const created = (await queryMessages({ conversationId, viewerId: user.id, limit: 1 }))[0] ?? null;
  return ok({ message: created });
});
