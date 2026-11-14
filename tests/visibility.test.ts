import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { blocks, follows, users } from "@/db/schema";
import { canViewContent, dbBlockedEitherWay } from "@/lib/visibility";
import { hashPassword } from "@/lib/password";

const viewer = { username: "vis_viewer", email: "vis_viewer@test.local", fullName: "Vis Viewer" };
const author = { username: "vis_author", email: "vis_author@test.local", fullName: "Vis Author" };
let viewerId = "";
let authorId = "";

async function insertUser(u: { username: string; email: string; fullName: string }, isPrivate: boolean) {
  const [row] = await db
    .insert(users)
    .values({ ...u, passwordHash: await hashPassword("password1"), isPrivate })
    .returning({ id: users.id });
  return row.id;
}

beforeAll(async () => {
  viewerId = await insertUser(viewer, false);
  authorId = await insertUser(author, true);
});

afterAll(async () => {
  await db.delete(users).where(inArray(users.id, [viewerId, authorId]));
});

describe("dbBlockedEitherWay", () => {
  it("detects blocks in both directions", async () => {
    expect(await dbBlockedEitherWay(viewerId, authorId)).toBe(false);
    await db.insert(blocks).values({ blockerId: authorId, blockedId: viewerId });
    expect(await dbBlockedEitherWay(viewerId, authorId)).toBe(true);
    await db.delete(blocks).where(eq(blocks.blockerId, authorId));
    expect(await dbBlockedEitherWay(viewerId, authorId)).toBe(false);
  });
});

describe("canViewContent", () => {
  it("always lets authors view themselves", async () => {
    expect(await canViewContent(authorId, authorId, true)).toBe(true);
  });

  it("hides private authors from non-followers and shows them to followers", async () => {
    expect(await canViewContent(viewerId, authorId, true)).toBe(false);
    await db.insert(follows).values({ followerId: viewerId, followingId: authorId });
    expect(await canViewContent(viewerId, authorId, true)).toBe(true);
    await db.delete(follows).where(eq(follows.followerId, viewerId));
  });

  it("shows public authors to anyone not blocked", async () => {
    expect(await canViewContent(viewerId, authorId, false)).toBe(true);
    await db.insert(blocks).values({ blockerId: viewerId, blockedId: authorId });
    expect(await canViewContent(viewerId, authorId, false)).toBe(false);
    await db.delete(blocks).where(eq(blocks.blockerId, viewerId));
  });

  it("blocks win over follows", async () => {
    await db.insert(follows).values({ followerId: viewerId, followingId: authorId });
    await db.insert(blocks).values({ blockerId: authorId, blockedId: viewerId });
    expect(await canViewContent(viewerId, authorId, true)).toBe(false);
    await db.delete(follows).where(eq(follows.followerId, viewerId));
    await db.delete(blocks).where(eq(blocks.blockerId, authorId));
  });
});
