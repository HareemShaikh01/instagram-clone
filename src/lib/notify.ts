import { sql } from "drizzle-orm";
import { db } from "@/db/client";

type NotificationType =
  | "like"
  | "comment"
  | "follow"
  | "follow_request"
  | "follow_accept"
  | "mention"
  | "message";

/**
 * Create a notification. Deduplicates on (user, type, actor, post, comment,
 * conversation). For `message` notifications the existing row is refreshed
 * (new timestamp, marked unread) so repeat messages do not pile up.
 */
export async function notify(params: {
  userId: string;
  actorId: string;
  type: NotificationType;
  postId?: string | null;
  commentId?: string | null;
  conversationId?: string | null;
}): Promise<void> {
  const { userId, actorId, type } = params;
  if (userId === actorId) return;
  const postId = params.postId ?? null;
  const commentId = params.commentId ?? null;
  const conversationId = params.conversationId ?? null;

  if (type === "message" && conversationId) {
    await db.execute(sql`
      insert into notifications (user_id, actor_id, type, conversation_id, read_at)
      values (${userId}, ${actorId}, 'message', ${conversationId}, null)
      on conflict (user_id, type, actor_id,
                   coalesce(post_id::text, ''), coalesce(comment_id::text, ''),
                   coalesce(conversation_id::text, ''))
      do update set created_at = now(), read_at = null
    `);
    return;
  }

  await db.execute(sql`
    insert into notifications (user_id, actor_id, type, post_id, comment_id, conversation_id)
    values (${userId}, ${actorId}, ${type}, ${postId}, ${commentId}, ${conversationId})
    on conflict (user_id, type, actor_id,
                 coalesce(post_id::text, ''), coalesce(comment_id::text, ''),
                 coalesce(conversation_id::text, ''))
    do nothing
  `);
}
