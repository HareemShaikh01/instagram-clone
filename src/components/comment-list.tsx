"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Pencil, Trash2 } from "lucide-react";
import { api, ApiClientError, timeAgo } from "@/lib/api-client";
import { Avatar, AvatarLink, Button, ErrorState, Skeleton, Textarea } from "@/components/ui";
import { useConfirm } from "@/components/modal";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { RichText } from "@/components/post-card";
import type { CommentDTO } from "@/lib/types";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; comments: CommentDTO[]; nextCursor: string | null };

/** Threaded comment section for a post: add, reply, like, edit, delete, paginate. */
export function CommentList({
  postId,
  autoFocus = false,
}: {
  postId: string;
  autoFocus?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user: me } = useSession();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [replies, setReplies] = useState<Record<string, CommentDTO[]>>({});
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentDTO | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await api<{ comments: CommentDTO[]; nextCursor: string | null }>(
        `/api/posts/${postId}/comments?limit=20`,
      );
      setState({ kind: "ready", comments: data.comments, nextCursor: data.nextCursor });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof ApiClientError ? e.message : "Could not load comments",
      });
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchComment(next: CommentDTO) {
    setState((s) =>
      s.kind === "ready"
        ? { ...s, comments: s.comments.map((c) => (c.id === next.id ? next : c)) }
        : s,
    );
    setReplies((r) => {
      const parentId = next.parentId;
      if (!parentId || !r[parentId]) return r;
      return { ...r, [parentId]: r[parentId].map((c) => (c.id === next.id ? next : c)) };
    });
  }

  async function loadMore() {
    if (state.kind !== "ready" || !state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api<{ comments: CommentDTO[]; nextCursor: string | null }>(
        `/api/posts/${postId}/comments?limit=20&cursor=${encodeURIComponent(state.nextCursor)}`,
      );
      setState((s) =>
        s.kind === "ready"
          ? {
              kind: "ready",
              comments: [
                ...s.comments,
                ...data.comments.filter((c) => !s.comments.some((x) => x.id === c.id)),
              ],
              nextCursor: data.nextCursor,
            }
          : s,
      );
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not load more comments");
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleReplies(c: CommentDTO) {
    const open = !openReplies[c.id];
    setOpenReplies((o) => ({ ...o, [c.id]: open }));
    if (open && !replies[c.id]) {
      try {
        const data = await api<{ comments: CommentDTO[] }>(
          `/api/posts/${postId}/comments?parentId=${c.id}&limit=50`,
        );
        setReplies((r) => ({ ...r, [c.id]: data.comments }));
      } catch (e) {
        toast("error", e instanceof ApiClientError ? e.message : "Could not load replies");
      }
    }
  }

  async function submit() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { comment } = await api<{ comment: CommentDTO }>(`/api/posts/${postId}/comments`, {
        body: { body: text, ...(replyTo ? { parentId: replyTo.id } : {}) },
      });
      if (replyTo) {
        setReplies((r) => ({ ...r, [replyTo.id]: [...(r[replyTo.id] ?? []), comment] }));
        setOpenReplies((o) => ({ ...o, [replyTo.id]: true }));
        setState((s) =>
          s.kind === "ready"
            ? {
                ...s,
                comments: s.comments.map((c) =>
                  c.id === replyTo.id ? { ...c, replyCount: c.replyCount + 1 } : c,
                ),
              }
            : s,
        );
      } else {
        setState((s) => (s.kind === "ready" ? { ...s, comments: [...s.comments, comment] } : s));
      }
      setBody("");
      setReplyTo(null);
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not post comment");
    } finally {
      setSending(false);
    }
  }

  async function toggleLike(c: CommentDTO) {
    patchComment({
      ...c,
      likedByMe: !c.likedByMe,
      likeCount: c.likeCount + (c.likedByMe ? -1 : 1),
    });
    try {
      await api(`/api/comments/${c.id}/like`, { method: c.likedByMe ? "DELETE" : "POST" });
    } catch (e) {
      patchComment(c);
      if (e instanceof ApiClientError) toast("error", e.message);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const text = editing.body.trim();
    if (!text) return;
    try {
      const { comment } = await api<{ comment: CommentDTO }>(`/api/comments/${editing.id}`, {
        method: "PATCH",
        body: { body: text },
      });
      patchComment(comment);
      setEditing(null);
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not update comment");
    }
  }

  async function remove(c: CommentDTO) {
    const ok = await confirm({
      title: "Delete comment?",
      body: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/comments/${c.id}`, { method: "DELETE" });
      if (c.parentId) {
        const pid = c.parentId;
        setReplies((r) => ({ ...r, [pid]: (r[pid] ?? []).filter((x) => x.id !== c.id) }));
        setState((s) =>
          s.kind === "ready"
            ? {
                ...s,
                comments: s.comments.map((x) =>
                  x.id === pid ? { ...x, replyCount: Math.max(0, x.replyCount - 1) } : x,
                ),
              }
            : s,
        );
      } else {
        setState((s) =>
          s.kind === "ready" ? { ...s, comments: s.comments.filter((x) => x.id !== c.id) } : s,
        );
      }
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not delete comment");
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="space-y-4 px-1 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state.kind === "error") {
    return <ErrorState message={state.message} onRetry={() => void load()} />;
  }

  const { comments, nextCursor } = state;

  return (
    <div className="px-1">
      <h2 className="py-3 text-sm font-semibold">
        Comments{comments.length > 0 ? ` · ${comments.length}` : ""}
      </h2>

      {comments.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No comments yet. Start the conversation.
        </p>
      )}

      <ul className="space-y-4">
        {comments.map((c) => (
          <li key={c.id}>
            <CommentRow
              c={c}
              meId={me?.id ?? null}
              editing={editing?.id === c.id ? editing.body : null}
              onEditChange={(v) => setEditing({ id: c.id, body: v })}
              onStartEdit={() => setEditing({ id: c.id, body: c.body })}
              onCancelEdit={() => setEditing(null)}
              onSaveEdit={() => void saveEdit()}
              onLike={() => void toggleLike(c)}
              onReply={() => {
                setReplyTo(c);
                inputRef.current?.focus();
              }}
              onDelete={() => void remove(c)}
            />
            {c.replyCount > 0 && (
              <button
                onClick={() => void toggleReplies(c)}
                className="ml-11 mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg"
              >
                <span className="h-px w-6 bg-line" aria-hidden />
                {openReplies[c.id] ? "Hide replies" : `View replies (${c.replyCount})`}
              </button>
            )}
            {openReplies[c.id] && (
              <ul className="mt-2.5 space-y-3 border-l border-line pl-3 ml-3">
                {(replies[c.id] ?? []).map((r) => (
                  <li key={r.id}>
                    <CommentRow
                      c={r}
                      meId={me?.id ?? null}
                      editing={editing?.id === r.id ? editing.body : null}
                      onEditChange={(v) => setEditing({ id: r.id, body: v })}
                      onStartEdit={() => setEditing({ id: r.id, body: r.body })}
                      onCancelEdit={() => setEditing(null)}
                      onSaveEdit={() => void saveEdit()}
                      onLike={() => void toggleLike(r)}
                      onReply={() => {
                        setReplyTo(c);
                        inputRef.current?.focus();
                      }}
                      onDelete={() => void remove(r)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {nextCursor && (
        <button
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-4 block w-full rounded-lg border border-line py-2 text-xs font-semibold text-muted hover:bg-(--hover) disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more comments"}
        </button>
      )}

      <div className="sticky bottom-0 mt-4 border-t border-line bg-bg py-2.5">
        {replyTo && (
          <div className="flex items-center gap-2 pb-1.5 text-xs text-muted">
            Replying to @{replyTo.author.username}
            <button className="underline" onClick={() => setReplyTo(null)}>
              cancel
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Avatar src={me?.avatarUrl ?? null} alt={me?.username ?? "You"} size={30} />
          <input
            ref={inputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={replyTo ? `Reply to ${replyTo.author.username}…` : "Add a comment…"}
            autoFocus={autoFocus}
            maxLength={1000}
            aria-label="Add a comment"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <Button size="sm" onClick={() => void submit()} disabled={sending || !body.trim()}>
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentRow({
  c,
  meId,
  editing,
  onEditChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onLike,
  onReply,
  onDelete,
}: {
  c: CommentDTO;
  meId: string | null;
  editing: string | null;
  onEditChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const mine = meId === c.author.id;

  return (
    <div className="flex gap-3">
      <AvatarLink src={c.author.avatarUrl} username={c.author.username} size={32} />
      <div className="min-w-0 flex-1">
        {editing !== null ? (
          <div className="space-y-1.5">
            <Textarea
              value={editing}
              onChange={(e) => onEditChange(e.target.value)}
              rows={2}
              maxLength={1000}
              aria-label="Edit comment"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSaveEdit} disabled={!editing.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm leading-snug">
              <AvatarUsernameLink username={c.author.username} />{" "}
              <RichText text={c.body} className="align-middle" />
            </p>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
              <span>{timeAgo(c.createdAt)}</span>
              {c.editedAt && <span>(edited)</span>}
              {c.likeCount > 0 && <span>{c.likeCount} likes</span>}
              <button onClick={onReply} className="font-semibold hover:text-fg">
                Reply
              </button>
              {mine && (
                <>
                  <button
                    onClick={onStartEdit}
                    aria-label="Edit comment"
                    className="hover:text-fg"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={onDelete}
                    aria-label="Delete comment"
                    className="hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <button
        onClick={onLike}
        aria-label={c.likedByMe ? "Unlike comment" : "Like comment"}
        aria-pressed={c.likedByMe}
        className={`mt-1 h-fit hover:opacity-60 ${c.likedByMe ? "text-danger" : "text-muted"}`}
      >
        <Heart size={13} fill={c.likedByMe ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

function AvatarUsernameLink({ username }: { username: string }) {
  return (
    <a href={`/profile/${username}`} className="font-semibold hover:underline">
      {username}
    </a>
  );
}
