"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import { AvatarLink, Button, Spinner } from "@/components/ui";
import { Modal, ModalHeader } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { UserSummary } from "@/lib/types";

type ConnectionRow = UserSummary & {
  isFollowing?: boolean;
  hasPendingRequest?: boolean;
  isSelf?: boolean;
};

/** Followers / following list for a profile. */
export function UserListModal({
  open,
  onClose,
  title,
  username,
  type,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  username: string;
  type: "followers" | "following";
}) {
  const toast = useToast();
  const [rows, setRows] = useState<ConnectionRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api<{ users: ConnectionRow[]; nextCursor: string | null }>(
      `/api/users/${username}/connections?type=${type}&limit=30`,
    )
      .then((data) => {
        if (!alive) return;
        setRows(data.users);
        setNextCursor(data.nextCursor);
      })
      .catch((e) => {
        if (alive) setError(e instanceof ApiClientError ? e.message : "Could not load list");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, username, type]);

  async function loadMore(cursor: string) {
    setLoading(true);
    try {
      const data = await api<{ users: ConnectionRow[]; nextCursor: string | null }>(
        `/api/users/${username}/connections?type=${type}&limit=30&cursor=${encodeURIComponent(cursor)}`,
      );
      setRows((prev) => {
        const base = prev ?? [];
        return [...base, ...data.users.filter((u) => !base.some((x) => x.id === u.id))];
      });
      setNextCursor(data.nextCursor);
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  }

  async function toggleFollow(u: ConnectionRow) {
    setBusy(u.id);
    try {
      if (u.isFollowing || u.hasPendingRequest) {
        await api(`/api/users/${u.username}/follow`, { method: "DELETE" });
        setRows((r) =>
          (r ?? []).map((x) =>
            x.id === u.id ? { ...x, isFollowing: false, hasPendingRequest: false } : x,
          ),
        );
      } else {
        const res = await api<{ status: string }>(`/api/users/${u.username}/follow`, {
          method: "POST",
        });
        setRows((r) =>
          (r ?? []).map((x) =>
            x.id === u.id
              ? {
                  ...x,
                  isFollowing: res.status === "following",
                  hasPendingRequest: res.status === "requested",
                }
              : x,
          ),
        );
      }
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not update follow");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" labelledBy="user-list-title">
      <ModalHeader title={title} onClose={onClose} />
      <div className="max-h-96 overflow-y-auto" id="user-list-title">
        {rows === null && !error && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {error && <p className="py-6 text-center text-sm text-danger">{error}</p>}
        {rows?.length === 0 && <p className="py-6 text-center text-sm text-muted">Nobody yet.</p>}
        <ul className="divide-y divide-line">
          {(rows ?? []).map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
              <AvatarLink src={u.avatarUrl} username={u.username} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{u.username}</p>
                <p className="truncate text-xs text-muted">{u.fullName}</p>
              </div>
              {!u.isSelf && (
                <Button
                  size="sm"
                  variant={u.isFollowing || u.hasPendingRequest ? "secondary" : "primary"}
                  disabled={busy === u.id}
                  onClick={() => void toggleFollow(u)}
                >
                  {u.isFollowing ? "Following" : u.hasPendingRequest ? "Requested" : "Follow"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {nextCursor && rows && (
          <button
            onClick={() => void loadMore(nextCursor)}
            disabled={loading}
            className="block w-full py-3 text-center text-xs font-semibold text-accent disabled:opacity-50"
          >
            {loading ? "Loading…" : "Show more"}
          </button>
        )}
      </div>
    </Modal>
  );
}
