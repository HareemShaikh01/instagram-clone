"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2, MessageCircle, MoreHorizontal, Search, SendHorizontal, UserPlus } from "lucide-react";
import { api, timeAgo, uploadMedia, useApi, useInterval } from "@/lib/api-client";
import type { ConversationDTO, MessageDTO, UserSummary } from "@/lib/types";
import { useSession } from "@/components/session";
import { Avatar, Button, EmptyState, ErrorState, Input, Skeleton, Spinner } from "@/components/ui";
import { DropdownMenu, MenuItem } from "@/components/dropdown";
import { Modal, ModalHeader } from "@/components/modal";
import { useToast } from "@/components/toast";

type PendingMessage = { clientId: string; body: string | null; mediaUrl: string | null };

function otherParticipant(c: ConversationDTO, meId: string): UserSummary | null {
  return c.participants.find((p) => p.id !== meId) ?? c.participants[0] ?? null;
}

function previewOf(c: ConversationDTO, meId: string): string {
  if (!c.lastMessageBody) return "Say hi";
  return c.lastMessageSenderId === meId ? `You: ${c.lastMessageBody}` : c.lastMessageBody;
}

export function MessagesClient({ initialConversationId }: { initialConversationId?: string }) {
  const { user } = useSession();
  const router = useRouter();
  const toast = useToast();

  const conversations = useApi<{ conversations: ConversationDTO[]; unreadCount: number }>("/api/messages/conversations");
  const thread = useApi<{ messages: MessageDTO[] }>(
    initialConversationId ? `/api/messages/conversations/${initialConversationId}` : null,
  );

  const [filter, setFilter] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);

  useInterval(conversations.refresh, 5000);
  useInterval(thread.refresh, initialConversationId ? 3000 : null);

  const list = useMemo(() => {
    const items = conversations.data?.conversations ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const other = otherParticipant(c, user?.id ?? "");
      return (
        other?.username.toLowerCase().includes(q) ||
        (other?.fullName ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations.data, filter, user?.id]);

  if (conversations.error) return <ErrorState message={conversations.error.message} onRetry={conversations.refresh} />;

  const hasSelection = Boolean(initialConversationId);

  return (
    <div className="flex h-[calc(100dvh-136px)] min-h-[420px] overflow-hidden rounded-xl border border-line bg-elevated lg:h-[calc(100dvh-32px)]">
      {/* Conversation list */}
      <aside
        className={`${hasSelection ? "hidden md:flex" : "flex"} w-full flex-col border-r border-line md:w-80 md:shrink-0 lg:w-96`}
        aria-label="Conversations"
      >
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h1 className="text-base font-bold">{user?.username ?? ""}</h1>
          <button
            onClick={() => setNewChatOpen(true)}
            aria-label="New message"
            className="rounded-full p-1.5 hover:bg-(--hover)"
          >
            <UserPlus size={20} />
          </button>
        </header>
        <div className="border-b border-line px-3 py-2">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="w-full rounded-lg bg-surface py-1.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.loading && !conversations.data ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<MessageCircle size={44} strokeWidth={1} />}
              title="No chats yet"
              body="Start a conversation by sending someone a direct message."
              action={
                <Button onClick={() => setNewChatOpen(true)} size="sm">
                  Send message
                </Button>
              }
            />
          ) : (
            <ul>
              {list.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  meId={user?.id ?? ""}
                  active={c.id === initialConversationId}
                  onOpen={() => router.push(`/messages/${c.id}`)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Thread */}
      {hasSelection && (
        <ThreadPane
          key={initialConversationId}
          conversationId={initialConversationId!}
          conversations={conversations.data?.conversations ?? []}
          meId={user?.id ?? ""}
          thread={thread}
          onBack={() => router.push("/messages")}
        />
      )}

      {!hasSelection && (
        <section className="hidden flex-1 flex-col items-center justify-center md:flex">
          <EmptyState
            icon={<MessageCircle size={64} strokeWidth={0.8} />}
            title="Your messages"
            body="Send private photos and messages to a friend."
            action={
              <Button onClick={() => setNewChatOpen(true)} size="sm">
                Send message
              </Button>
            }
          />
        </section>
      )}

      <NewChatModal open={newChatOpen} onClose={() => setNewChatOpen(false)} />
    </div>
  );
}

function ConversationRow({
  conversation,
  meId,
  active,
  onOpen,
}: {
  conversation: ConversationDTO;
  meId: string;
  active: boolean;
  onOpen: () => void;
}) {
  const other = otherParticipant(conversation, meId);
  if (!other) return null;
  const unread = conversation.unreadCount > 0;
  return (
    <li>
      <button
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-(--hover) ${active ? "bg-(--hover)" : ""}`}
      >
        <Avatar src={other.avatarUrl} alt={other.username} size={56} />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center justify-between gap-2 ${unread ? "font-bold" : "font-semibold"}`}>
            <span className="truncate">{other.username}</span>
            {conversation.lastMessageAt && (
              <span className={`shrink-0 text-xs ${unread ? "text-fg" : "text-muted"}`}>{timeAgo(conversation.lastMessageAt)}</span>
            )}
          </span>
          <span className={`mt-0.5 flex items-center gap-1.5 text-sm ${unread ? "font-semibold text-fg" : "text-muted"}`}>
            <span className="truncate">{previewOf(conversation, meId)}</span>
            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label={`${conversation.unreadCount} unread`} />}
          </span>
        </span>
      </button>
    </li>
  );
}

function ThreadPane({
  conversationId,
  conversations,
  meId,
  thread,
  onBack,
}: {
  conversationId: string;
  conversations: ConversationDTO[];
  meId: string;
  thread: ReturnType<typeof useApi<{ messages: MessageDTO[] }>>;
  onBack: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchor = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState<MessageDTO[]>([]);
  const [older, setOlder] = useState<MessageDTO[]>([]);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const serverMessages = thread.data?.messages ?? [];
  const conversation = conversations.find((c) => c.id === conversationId) ?? null;
  const other = conversation ? otherParticipant(conversation, meId) : null;

  // Cached sends/pages are hidden once the polled server list contains them;
  // derived during render so polling can never trigger a setState loop.
  const serverIds = useMemo(() => new Set(serverMessages.map((m) => m.id)), [serverMessages]);
  const extraLive = useMemo(() => extra.filter((m) => !serverIds.has(m.id)), [extra, serverIds]);
  const olderLive = useMemo(() => older.filter((m) => !serverIds.has(m.id)), [older, serverIds]);

  const messages = useMemo((): MessageDTO[] => {
    const seen = new Set<string>();
    const merged = [...olderLive, ...serverMessages, ...extraLive].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    const pendingViews: (MessageDTO & { clientId: string })[] = pending.map((p) => ({
      id: p.clientId,
      clientId: p.clientId,
      conversationId,
      sender: { id: meId, username: "me", fullName: "", avatarUrl: null, isPrivate: false },
      body: p.body,
      media: p.mediaUrl ? { id: p.clientId, kind: "image", url: p.mediaUrl, width: null, height: null, durationMs: null } : null,
      createdAt: new Date().toISOString(),
      seen: false,
    }));
    return [...merged, ...pendingViews];
  }, [olderLive, serverMessages, extraLive, pending, meId, conversationId]);

  // Keep the view pinned to the newest message.
  useEffect(() => {
    bottomAnchor.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending.length]);

  const loadOlder = useCallback(async () => {
    const oldest = serverMessages[0] ?? older[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await api<{ messages: MessageDTO[] }>(
        `/api/messages/conversations/${conversationId}?before=${encodeURIComponent(oldest.createdAt)}&limit=30`,
      );
      if (res.messages.length < 30) setOlderExhausted(true);
      setOlder((prev) => [...res.messages, ...prev]);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not load earlier messages");
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, older, loadingOlder, serverMessages, toast]);

  const send = useCallback(
    async (payload: { body?: string; mediaId?: string }, clientId?: string) => {
      setSending(true);
      try {
        const res = await api<{ message: MessageDTO | null }>(`/api/messages/conversations/${conversationId}/messages`, {
          body: payload,
        });
        if (res.message) setExtra((prev) => [...prev, res.message!]);
        if (clientId) setPending((prev) => prev.filter((p) => p.clientId !== clientId));
        setDraft("");
      } catch (e) {
        if (clientId) setPending((prev) => prev.filter((p) => p.clientId !== clientId));
        toast("error", e instanceof Error ? e.message : "Could not send message");
      } finally {
        setSending(false);
      }
    },
    [conversationId, toast],
  );

  const onSendText = useCallback(() => {
    const body = draft.trim();
    if (!body || sending) return;
    const clientId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPending((prev) => [...prev, { clientId, body, mediaUrl: null }]);
    setDraft("");
    send({ body }, clientId).then(() => undefined);
  }, [draft, sending, send]);

  const onPickPhoto = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("error", "Only photos can be attached");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast("error", "Images must be under 20 MB");
      return;
    }
    setUploading(true);
    try {
      const { media } = await uploadMedia(file);
      await send({ mediaId: media.id });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [send, toast]);

  const unsend = useCallback(
    async (messageId: string) => {
      try {
        await api(`/api/messages/${messageId}`, { method: "DELETE" });
        setExtra((prev) => prev.filter((m) => m.id !== messageId));
        thread.refresh();
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Could not unsend message");
      }
    },
    [thread, toast],
  );

  const lastOwn = [...messages].reverse().find((m) => m.sender.id === meId && !("clientId" in m));

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button onClick={onBack} aria-label="Back to conversations" className="rounded-full p-1.5 hover:bg-(--hover) md:hidden">
          <ArrowLeft size={22} />
        </button>
        {other ? (
          <>
            <Avatar src={other.avatarUrl} alt={other.username} size={40} />
            <button onClick={() => router.push(`/profile/${other.username}`)} className="min-w-0 text-left">
              <span className="block truncate text-sm font-semibold">{other.fullName || other.username}</span>
              <span className="block truncate text-sm text-muted">@{other.username}</span>
            </button>
          </>
        ) : (
          <Skeleton className="h-10 w-40" />
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" aria-label="Message thread">
        {thread.error ? (
          <ErrorState message={thread.error.message} onRetry={thread.refresh} />
        ) : thread.loading && !thread.data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className={`h-10 ${i % 2 ? "ml-auto w-40" : "w-52"}`} />
            ))}
          </div>
        ) : (
          <>
            {!olderExhausted && serverMessages.length + older.length >= 30 && (
              <div className="mb-4 flex justify-center">
                <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? <Spinner size={14} /> : "Load earlier messages"}
                </Button>
              </div>
            )}
            <ul className="flex flex-col gap-1.5">
              {messages.map((m, i) => {
                const own = m.sender.id === meId;
                const isPending = "clientId" in m;
                const prev = messages[i - 1];
                const grouped = prev && prev.sender.id === m.sender.id;
                return (
                  <li key={m.id} className={`group flex items-center gap-2 ${own ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}>
                    {own && !isPending ? (
                      <DropdownMenu
                        trigger={() => <MoreHorizontal size={14} className="text-muted opacity-0 transition group-hover:opacity-100" />}
                      >
                        {(close) => <MenuItem danger onClick={() => { close(); void unsend(m.id); }}>Unsend</MenuItem>}
                      </DropdownMenu>
                    ) : (
                      <span className="w-6" />
                    )}
                    <div
                      className={`relative max-w-[70%] ${own ? "self-end" : "self-start"}`}
                    >
                      {m.media ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.media.url}
                          alt={m.body ?? "Shared photo"}
                          className={`max-h-72 w-auto max-w-full rounded-2xl object-cover ${own ? "" : "ring-1 ring-line"}`}
                          loading="lazy"
                        />
                      ) : null}
                      {m.body && (
                        <p
                          title={new Date(m.createdAt).toLocaleString()}
                          className={`w-fit rounded-2xl px-3.5 py-2 text-sm leading-snug ${own ? "bg-accent text-white" : "bg-surface text-fg ring-1 ring-line"} ${m.media ? "mt-1" : ""}`}
                        >
                          {m.body}
                        </p>
                      )}
                      {isPending && <span className="absolute -bottom-4 right-0 text-xs text-muted">Sending…</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div ref={bottomAnchor} />
      </div>

      {lastOwn && (
        <p className="px-4 pb-1 text-right text-xs text-muted">{lastOwn.seen ? "Seen" : "Sent"}</p>
      )}

      <footer className="border-t border-line p-3">
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={() => void onPickPhoto()}
            aria-label="Attach a photo"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || sending}
            aria-label="Attach a photo"
            className="rounded-full p-2 text-accent hover:bg-(--hover) disabled:opacity-50"
          >
            {uploading ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSendText();
              }
            }}
            rows={1}
            placeholder="Message…"
            aria-label="Message"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-muted"
          />
          <button
            onClick={onSendText}
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="rounded-full p-2 text-accent hover:bg-(--hover) disabled:opacity-40"
          >
            {sending ? <Loader2 size={22} className="animate-spin" /> : <SendHorizontal size={22} />}
          </button>
        </div>
      </footer>
    </section>
  );
}

function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    const uname = username.trim().toLowerCase().replace(/^@/, "");
    if (!uname) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ conversationId: string }>("/api/messages/conversations", { body: { username: uname } });
      onClose();
      router.push(`/messages/${res.conversationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start conversation");
    } finally {
      setBusy(false);
    }
  }, [username, onClose, router]);

  return (
    <Modal open={open} onClose={onClose} labelledBy="new-chat-title">
      <ModalHeader title="New message" onClose={onClose} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <div className="space-y-4 p-5">
          <Input
            label="To"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={error}
            autoFocus
          />
          <Button type="submit" disabled={busy || !username.trim()} className="w-full">
            {busy ? <Spinner size={16} /> : "Chat"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
