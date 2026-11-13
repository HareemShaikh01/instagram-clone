"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Lock, MoreHorizontal } from "lucide-react";
import { api, ApiClientError, formatCount, useApi } from "@/lib/api-client";
import { Avatar, Button, EmptyState, ErrorState, Skeleton, Spinner, Textarea } from "@/components/ui";
import { DropdownMenu } from "@/components/dropdown";
import { Modal, ModalHeader, useConfirm } from "@/components/modal";
import { useToast } from "@/components/toast";
import { PostTile } from "@/components/post-tile";
import { UserListModal } from "@/components/user-list-modal";
import { usePostFeed } from "@/lib/use-post-feed";
import type { ProfileDTO, UserSummary } from "@/lib/types";

type Tab = "posts" | "saved" | "tagged";

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, refresh } = useApi<{ profile: ProfileDTO }>(
    `/api/users/${username}`,
  );
  const profile = data?.profile;

  const [tab, setTab] = useState<Tab>("posts");
  const [busy, setBusy] = useState(false);
  const [listModal, setListModal] = useState<"followers" | "following" | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);

  const feed = usePostFeed(
    profile ? `/api/users/${username}/posts?tab=${tab}` : null,
    12,
  );

  // Resolve the incoming follow request id for this user, if any.
  useEffect(() => {
    if (!profile?.hasIncomingRequest) return;
    let alive = true;
    api<{ requests: { id: string; user: UserSummary }[] }>("/api/follow-requests")
      .then((d) => {
        if (alive) {
          setIncomingRequestId(d.requests.find((r) => r.user.id === profile.id)?.id ?? null);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [profile?.hasIncomingRequest, profile?.id]);

  async function toggleFollow() {
    if (!profile || busy) return;
    if (profile.isFollowing) {
      const ok = await confirm({
        title: `Unfollow ${profile.username}?`,
        confirmLabel: "Unfollow",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (profile.isFollowing || profile.hasPendingRequest) {
        await api(`/api/users/${profile.username}/follow`, { method: "DELETE" });
      } else {
        await api(`/api/users/${profile.username}/follow`, { method: "POST" });
      }
      void refresh();
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not update follow");
    } finally {
      setBusy(false);
    }
  }

  async function respondRequest(action: "accept" | "reject") {
    if (!incomingRequestId) return;
    setBusy(true);
    try {
      await api(`/api/follow-requests/${incomingRequestId}`, { method: "POST", body: { action } });
      setIncomingRequestId(null);
      toast("success", action === "accept" ? "Request accepted" : "Request declined");
      void refresh();
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not respond to request");
    } finally {
      setBusy(false);
    }
  }

  async function startChat() {
    if (!profile) return;
    try {
      const { conversationId } = await api<{ conversationId: string }>(
        "/api/messages/conversations",
        { method: "POST", body: { username: profile.username } },
      );
      router.push(`/messages?c=${conversationId}`);
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not start conversation");
    }
  }

  async function toggleBlock() {
    if (!profile) return;
    const ok = await confirm({
      title: profile.isBlocked ? `Unblock ${profile.username}?` : `Block ${profile.username}?`,
      body: profile.isBlocked
        ? "They will be able to interact with you again."
        : "They will not be able to interact with you or see your posts.",
      confirmLabel: profile.isBlocked ? "Unblock" : "Block",
      danger: !profile.isBlocked,
    });
    if (!ok) return;
    try {
      if (profile.isBlocked) {
        await api(`/api/blocks?username=${encodeURIComponent(profile.username)}`, {
          method: "DELETE",
        });
      } else {
        await api("/api/blocks", { method: "POST", body: { username: profile.username } });
      }
      toast("success", profile.isBlocked ? "Unblocked" : "Blocked");
      void refresh();
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not update block");
    }
  }

  async function submitReport() {
    if (!profile) return;
    const reason = reportReason.trim();
    if (reason.length < 3) return;
    try {
      await api("/api/reports", {
        method: "POST",
        body: { targetType: "user", targetId: profile.id, reason },
      });
      setReporting(false);
      setReportReason("");
      toast("success", "Thanks for the report");
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : "Could not send report");
    }
  }

  if (loading) {
    return (
      <div className="py-6">
        <div className="flex items-center gap-6">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <ErrorState
        message={error?.message ?? "Profile not found"}
        onRetry={() => void refresh()}
      />
    );
  }

  const canSeePosts = profile.isSelf || profile.isFollowing || !profile.isPrivate;

  return (
    <div className="pb-10">
      <header className="flex flex-col gap-5 py-6 sm:flex-row sm:items-start sm:gap-14">
        <div className="flex items-center gap-8 sm:block">
          <Avatar src={profile.avatarUrl} alt={profile.username} size={88} />
          <div className="flex sm:hidden">
            <Stat label="posts" value={profile.postCount} />
            <Stat
              label="followers"
              value={profile.followerCount}
              onClick={() => setListModal("followers")}
            />
            <Stat
              label="following"
              value={profile.followingCount}
              onClick={() => setListModal("following")}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-1.5 text-lg font-semibold">
              {profile.username}
              {profile.isPrivate && <Lock size={14} className="text-muted" />}
            </h1>
            <div className="ml-auto flex items-center gap-2">
              {profile.isSelf ? (
                <Link href="/settings">
                  <Button variant="secondary" size="sm">
                    Edit profile
                  </Button>
                </Link>
              ) : profile.hasIncomingRequest ? (
                <>
                  <Button size="sm" disabled={busy} onClick={() => void respondRequest("accept")}>
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void respondRequest("reject")}
                  >
                    Decline
                  </Button>
                </>
              ) : profile.isBlocked ? (
                <Button variant="danger" size="sm" onClick={() => void toggleBlock()}>
                  Unblock
                </Button>
              ) : (
                <>
                  <Button
                    variant={profile.isFollowing || profile.hasPendingRequest ? "secondary" : "primary"}
                    size="sm"
                    disabled={busy}
                    onClick={() => void toggleFollow()}
                  >
                    {profile.isFollowing
                      ? "Following"
                      : profile.hasPendingRequest
                        ? "Requested"
                        : "Follow"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void startChat()}>
                    Message
                  </Button>
                </>
              )}
              {!profile.isSelf && (
                <DropdownMenu
                  trigger={() => <MoreHorizontal size={20} aria-label="Profile options" />}
                >
                  {(close) => (
                    <div className="py-1 text-sm" role="menu">
                      <button
                        role="menuitem"
                        className="block w-full px-4 py-2.5 text-left hover:bg-(--hover)"
                        onClick={() => {
                          close();
                          void toggleBlock();
                        }}
                      >
                        {profile.isBlocked ? "Unblock" : "Block"}
                      </button>
                      <button
                        role="menuitem"
                        className="block w-full px-4 py-2.5 text-left hover:bg-(--hover)"
                        onClick={() => {
                          close();
                          setReporting(true);
                        }}
                      >
                        Report user
                      </button>
                    </div>
                  )}
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="mt-4 hidden gap-8 sm:flex">
            <Stat label="posts" value={profile.postCount} />
            <Stat
              label="followers"
              value={profile.followerCount}
              onClick={() => setListModal("followers")}
            />
            <Stat
              label="following"
              value={profile.followingCount}
              onClick={() => setListModal("following")}
            />
          </div>

          <div className="mt-4 text-sm">
            <p className="font-semibold">{profile.fullName}</p>
            {profile.bio && <p className="mt-1 whitespace-pre-wrap">{profile.bio}</p>}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 inline-block font-semibold text-accent hover:underline"
              >
                {profile.website}
              </a>
            )}
          </div>
        </div>
      </header>

      <nav className="flex gap-8 border-t border-line pt-1 text-sm font-semibold uppercase tracking-wide">
        {(
          [
            ["posts", "Posts"],
            ...(profile.isSelf ? ([["saved", "Saved"]] as const) : []),
            ["tagged", "Tagged"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mt-px border-t py-3 ${tab === key ? "border-fg" : "border-transparent text-muted"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "posts" && !canSeePosts ? (
        <EmptyState
          icon={<Lock size={44} strokeWidth={1} />}
          title="This account is private"
          body="Follow this account to see their photos and posts."
          action={
            !profile.hasPendingRequest ? (
              <Button className="mt-1" disabled={busy} onClick={() => void toggleFollow()}>
                Follow
              </Button>
            ) : (
              <Button variant="secondary" className="mt-1" disabled={busy} onClick={() => void toggleFollow()}>
                Requested
              </Button>
            )
          }
        />
      ) : (
        <ProfileGrid
          key={tab}
          path={`/api/users/${username}/posts?tab=${tab}`}
          emptyHint={
            tab === "saved"
              ? "Save posts to see them here. Only you can see your saved posts."
              : tab === "tagged"
                ? "No tagged posts yet."
                : profile.isSelf
                  ? "Share your first photo — your posts will appear here."
                  : `${profile.username} hasn't posted yet.`
          }
        />
      )}

      {listModal && (
        <UserListModal
          open
          onClose={() => setListModal(null)}
          title={listModal === "followers" ? "Followers" : "Following"}
          username={profile.username}
          type={listModal}
        />
      )}

      <Modal open={reporting} onClose={() => setReporting(false)} size="sm" labelledBy="report-title">
        <ModalHeader title={`Report ${profile.username}`} onClose={() => setReporting(false)} />
        <div className="space-y-3" id="report-title">
          <p className="text-sm text-muted">
            Tell us what is going on with this account.
          </p>
          <Textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Reason for reporting"
            aria-label="Report reason"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReporting(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={reportReason.trim().length < 3}
              onClick={() => void submitReport()}
            >
              Submit report
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="font-semibold">{formatCount(value)}</span>{" "}
      <span className="text-muted">{label}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="text-sm hover:underline">
      {content}
    </button>
  ) : (
    <span className="text-sm">{content}</span>
  );
}

function ProfileGrid({ path, emptyHint }: { path: string; emptyHint: string }) {
  const feed = usePostFeed(path, 12);
  const sentinel = useSentinel(feed);

  if (feed.loading) {
    return (
      <div className="grid grid-cols-3 gap-1 pt-4 sm:gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-sm" />
        ))}
      </div>
    );
  }

  if (feed.error) {
    return <ErrorState message={feed.error} onRetry={() => void feed.retry()} />;
  }

  if (feed.posts.length === 0) {
    return <EmptyState title="Nothing here yet" body={emptyHint} />;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1 pt-4 sm:gap-2">
        {feed.posts.map((p) => (
          <PostTile key={p.id} post={p} />
        ))}
      </div>
      {feed.moreError && (
        <ErrorState message="Could not load more posts" onRetry={() => void feed.loadMore()} />
      )}
      {feed.loadingMore && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      <div ref={sentinel} aria-hidden />
    </>
  );
}

function useSentinel(feed: ReturnType<typeof usePostFeed>) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void feed.loadMore();
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [feed.loadMore]);
  return sentinel;
}
