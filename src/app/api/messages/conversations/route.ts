import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationParticipants, conversations, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { queryConversations } from "@/lib/queries";
import { dbBlockedEitherWay } from "@/lib/visibility";
import { startConversationSchema } from "@/lib/validate";

export const GET = withAuth(async (req, user) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("query")?.trim() || undefined;
  const items = await queryConversations(user.id, q);
  return ok({
    conversations: items,
    unreadCount: items.reduce((sum, c) => sum + c.unreadCount, 0),
  });
});

/** Start (or find) a 1:1 conversation with another user. */
export const POST = withAuth(async (_req, user) => {
  const body = startConversationSchema.parse(await _req.json());
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${body.username})`)
    .limit(1);
  if (!target) throw new ApiError(404, "not_found", "User not found");
  if (target.id === user.id)
    throw new ApiError(400, "cannot_message_self", "You cannot message yourself");
  if (await dbBlockedEitherWay(user.id, target.id))
    throw new ApiError(403, "blocked", "You cannot message this user");

  const existing = await db.execute(sql`
    select c.id
    from conversations c
    join conversation_participants a on a.conversation_id = c.id and a.user_id = ${user.id}
    join conversation_participants b on b.conversation_id = c.id and b.user_id = ${target.id}
    where (select count(*) from conversation_participants cp where cp.conversation_id = c.id) = 2
    limit 1
  `);
  const existingRows = (existing as { rows?: Array<{ id: string }> }).rows
    ?? (existing as unknown as Array<{ id: string }>);
  if (existingRows && existingRows[0]) return ok({ conversationId: existingRows[0].id });

  const conversationId = await db.transaction(async (tx) => {
    const [conv] = await tx.insert(conversations).values({}).returning({ id: conversations.id });
    await tx.insert(conversationParticipants).values([
      { conversationId: conv.id, userId: user.id },
      { conversationId: conv.id, userId: target.id },
    ]);
    return conv.id;
  });

  return ok({ conversationId });
});
