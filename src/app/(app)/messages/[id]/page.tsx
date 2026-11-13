"use client";

import { use } from "react";
import { MessagesClient } from "@/components/messages-client";

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MessagesClient initialConversationId={id} />;
}
