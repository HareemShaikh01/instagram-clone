"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/lib/api-client";
import { Button, EmptyState } from "@/components/ui";
import { PostCard, PostSkeleton } from "@/components/post-card";
import { CommentList } from "@/components/comment-list";
import type { PostDTO } from "@/lib/types";

export default function PostDetailPage() {
  return (
    <Suspense fallback={<PostSkeleton />}>
      <PostDetail />
    </Suspense>
  );
}

function PostDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { data, error, loading } = useApi<{ post: PostDTO }>(`/api/posts/${params.id}`);

  return (
    <div className="pb-10">
      {loading && <PostSkeleton />}

      {!loading && error && (
        <EmptyState
          title={
            error.status === 404
              ? "Post not found"
              : error.status === 403
                ? "This post is private"
                : "Could not load post"
          }
          body={error.message}
          action={
            <Button variant="secondary" onClick={() => router.back()}>
              Go back
            </Button>
          }
        />
      )}

      {data?.post && (
        <>
          <PostCard post={data.post} onDeleted={() => router.push("/")} />
          <CommentList postId={data.post.id} autoFocus={search.get("focus") === "comments"} />
        </>
      )}
    </div>
  );
}
