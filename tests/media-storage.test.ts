import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  conversationParticipants,
  conversations,
  follows,
  media,
  messages,
  postMedia,
  posts,
  stories,
  users,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import {
  appendBlobChunk,
  blobSize,
  createMediaRecord,
  finalizeBlob,
  initBlob,
  openMediaSource,
  putBlob,
} from "@/lib/media";
import { mediaAllowed } from "@/lib/media-acl";

const owner = { username: "blob_owner", email: "blob_owner@test.local", fullName: "Blob Owner" };
const viewer = { username: "blob_viewer", email: "blob_viewer@test.local", fullName: "Blob Viewer" };
const privateAuthor = {
  username: "blob_private",
  email: "blob_private@test.local",
  fullName: "Blob Private",
};

let ownerId = "";
let viewerId = "";
let privateId = "";

async function insertUser(u: { username: string; email: string; fullName: string }, isPrivate: boolean) {
  const [row] = await db
    .insert(users)
    .values({ ...u, passwordHash: await hashPassword("password1"), isPrivate })
    .returning({ id: users.id });
  return row.id;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

beforeAll(async () => {
  ownerId = await insertUser(owner, false);
  viewerId = await insertUser(viewer, false);
  privateId = await insertUser(privateAuthor, true);
});

afterAll(async () => {
  await db.delete(users).where(inArray(users.id, [ownerId, viewerId, privateId]));
});

describe("blob storage roundtrip", () => {
  it("stores and streams back a multi-window blob byte-exactly", async () => {
    // 5 MB of random data forces readBlobStream through more than one 4 MB window.
    const data = randomBytes(5 * 1024 * 1024);
    const row = await createMediaRecord({
      ownerId,
      kind: "image",
      mimeType: "image/png",
      sizeBytes: data.length,
    });
    try {
      await putBlob(row.id, data);
      expect(await blobSize(row.id)).toBe(data.length);

      const source = await openMediaSource(row);
      expect(source.size).toBe(data.length);
      const all = await collect(source.open(0, data.length - 1));
      expect(all.equals(data)).toBe(true);

      // Range requests (video seeking) must return the exact requested window.
      const part = await collect(source.open(1000, 6000));
      expect(part.equals(data.subarray(1000, 6001))).toBe(true);
    } finally {
      await db.delete(media).where(eq(media.id, row.id));
    }
  });

  it("falls back to file_missing when neither blob nor legacy file exists", async () => {
    const row = await createMediaRecord({
      ownerId,
      kind: "image",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    try {
      await expect(openMediaSource(row)).rejects.toMatchObject({ status: 404, code: "file_missing" });
    } finally {
      await db.delete(media).where(eq(media.id, row.id));
    }
  });
});

describe("chunked upload primitives", () => {
  it("appends chunks at the exact offset and reports conflicts", async () => {
    const row = await createMediaRecord({
      ownerId,
      kind: "video",
      mimeType: "video/mp4",
      sizeBytes: 12,
      state: "pending",
    });
    try {
      await initBlob(row.id);
      expect(await blobSize(row.id)).toBe(0);

      const chunkA = Buffer.from("AAAAAAAAAA");
      await appendBlobChunk(row.id, chunkA, 0);
      expect(await blobSize(row.id)).toBe(10);

      let conflict: ApiError | undefined;
      try {
        await appendBlobChunk(row.id, Buffer.from("BB"), 5);
      } catch (e) {
        conflict = e as ApiError;
      }
      expect(conflict).toBeInstanceOf(ApiError);
      expect(conflict?.status).toBe(409);
      expect(conflict?.code).toBe("offset_conflict");
      expect((conflict?.details as { expected: number }).expected).toBe(10);

      // The conflicting append must not have mutated the blob.
      expect(await blobSize(row.id)).toBe(10);

      await appendBlobChunk(row.id, Buffer.from("BB"), 10);
      expect(await blobSize(row.id)).toBe(12);
    } finally {
      await db.delete(media).where(eq(media.id, row.id));
    }
  });

  it("finalizes only when the received size matches the declared size", async () => {
    const row = await createMediaRecord({
      ownerId,
      kind: "video",
      mimeType: "video/mp4",
      sizeBytes: 4,
      state: "pending",
    });
    try {
      await initBlob(row.id);
      await appendBlobChunk(row.id, Buffer.from("abcd"), 0);

      await expect(finalizeBlob(row.id, 3)).rejects.toMatchObject({
        status: 400,
        code: "size_mismatch",
      });

      await finalizeBlob(row.id, 4);
      const [rowAfter] = await db.select().from(media).where(eq(media.id, row.id));
      expect(rowAfter.state).toBe("ready");
    } finally {
      await db.delete(media).where(eq(media.id, row.id));
    }
  });
});

describe("media access control", () => {
  it("lets the owner read their own media and denies strangers for unattached media", async () => {
    const row = await createMediaRecord({
      ownerId,
      kind: "image",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    try {
      expect(await mediaAllowed(ownerId, row.id)).toBe(true);
      expect(await mediaAllowed(viewerId, row.id)).toBe(false);
    } finally {
      await db.delete(media).where(eq(media.id, row.id));
    }
  });

  it("serves public-post media to any signed-in user", async () => {
    const mediaRow = await createMediaRecord({
      ownerId,
      kind: "image",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    const [post] = await db
      .insert(posts)
      .values({ authorId: ownerId, caption: "public" })
      .returning({ id: posts.id });
    await db.insert(postMedia).values({ postId: post.id, mediaId: mediaRow.id, position: 0 });
    try {
      expect(await mediaAllowed(viewerId, mediaRow.id)).toBe(true);
    } finally {
      await db.delete(media).where(eq(media.id, mediaRow.id));
      await db.delete(posts).where(eq(posts.id, post.id));
    }
  });

  it("keeps private-account post media hidden until the viewer is an approved follower", async () => {
    const mediaRow = await createMediaRecord({
      ownerId: privateId,
      kind: "image",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    const [post] = await db
      .insert(posts)
      .values({ authorId: privateId, caption: "private" })
      .returning({ id: posts.id });
    await db.insert(postMedia).values({ postId: post.id, mediaId: mediaRow.id, position: 0 });
    try {
      expect(await mediaAllowed(viewerId, mediaRow.id)).toBe(false);
      await db.insert(follows).values({ followerId: viewerId, followingId: privateId });
      expect(await mediaAllowed(viewerId, mediaRow.id)).toBe(true);
      await db.delete(follows).where(eq(follows.followerId, viewerId));
      expect(await mediaAllowed(viewerId, mediaRow.id)).toBe(false);
    } finally {
      await db.delete(media).where(eq(media.id, mediaRow.id));
      await db.delete(posts).where(eq(posts.id, post.id));
    }
  });

  it("serves live story media but withholds expired stories from non-authors", async () => {
    const mediaRow = await createMediaRecord({
      ownerId,
      kind: "video",
      mimeType: "video/mp4",
      sizeBytes: 4,
    });
    const [live] = await db
      .insert(stories)
      .values({
        authorId: ownerId,
        kind: "video",
        mediaId: mediaRow.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning({ id: stories.id });
    try {
      expect(await mediaAllowed(viewerId, mediaRow.id)).toBe(true);

      await db
        .update(stories)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(stories.id, live.id));
      expect(await mediaAllowed(viewerId, mediaRow.id)).toBe(false);
      // The author can still revisit their own expired story.
      expect(await mediaAllowed(ownerId, mediaRow.id)).toBe(true);
    } finally {
      await db.delete(media).where(eq(media.id, mediaRow.id));
      await db.delete(stories).where(eq(stories.id, live.id));
    }
  });

  it("exposes avatars to everyone but message media only to conversation participants", async () => {
    const avatarMedia = await createMediaRecord({
      ownerId,
      kind: "image",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    await db.update(users).set({ avatarMediaId: avatarMedia.id }).where(eq(users.id, ownerId));

    const messageMedia = await createMediaRecord({
      ownerId,
      kind: "image",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    const [conversation] = await db.insert(conversations).values({}).returning({ id: conversations.id });
    await db.insert(conversationParticipants).values([
      { conversationId: conversation.id, userId: ownerId },
      { conversationId: conversation.id, userId: viewerId },
    ]);
    await db
      .insert(messages)
      .values({ conversationId: conversation.id, senderId: ownerId, mediaId: messageMedia.id });
    try {
      expect(await mediaAllowed(viewerId, avatarMedia.id)).toBe(true);
      expect(await mediaAllowed(viewerId, messageMedia.id)).toBe(true);
      expect(await mediaAllowed(privateId, messageMedia.id)).toBe(false);
    } finally {
      await db.update(users).set({ avatarMediaId: null }).where(eq(users.id, ownerId));
      await db.delete(media).where(eq(media.id, avatarMedia.id));
      await db.delete(media).where(eq(media.id, messageMedia.id));
      await db.delete(conversations).where(eq(conversations.id, conversation.id));
    }
  });
});
