import { describe, expect, it } from "vitest";
import {
  createPostSchema,
  createStorySchema,
  registerSchema,
  resetPasswordSchema,
  sendMessageSchema,
  usernameSchema,
} from "@/lib/validate";

describe("usernameSchema", () => {
  it("trims and lowercases", () => {
    expect(usernameSchema.parse("  Alice  ")).toBe("alice");
  });

  it("rejects too-short, too-long and invalid characters", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("a".repeat(31)).success).toBe(false);
    expect(usernameSchema.safeParse("bad name").success).toBe(false);
    expect(usernameSchema.safeParse("-leading").success).toBe(false);
  });

  it("rejects leading or trailing period/underscore", () => {
    expect(usernameSchema.safeParse(".alice").success).toBe(false);
    expect(usernameSchema.safeParse("alice_").success).toBe(false);
    expect(usernameSchema.parse("a.l_i")).toBe("a.l_i");
  });
});

describe("registerSchema", () => {
  const valid = {
    fullName: "Alice Demo",
    username: "alice",
    email: "ALICE@example.com",
    password: "password1",
  };

  it("accepts a valid payload and normalizes email", () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed.email).toBe("alice@example.com");
  });

  it("rejects unknown keys and weak passwords", () => {
    expect(registerSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "passwordonly" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "12345678" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires matching passwords", () => {
    const base = { token: "t".repeat(10), password: "password1" };
    expect(resetPasswordSchema.safeParse({ ...base, confirmPassword: "password1" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ ...base, confirmPassword: "other" }).success).toBe(false);
  });
});

describe("createStorySchema", () => {
  it("requires text and bg color for text stories", () => {
    expect(createStorySchema.safeParse({ kind: "text" }).success).toBe(false);
    expect(
      createStorySchema.safeParse({ kind: "text", text: "hi", bgColor: "#112233" }).success,
    ).toBe(true);
    expect(
      createStorySchema.safeParse({ kind: "text", text: "hi", bgColor: "red" }).success,
    ).toBe(false);
  });

  it("requires mediaId for media stories", () => {
    expect(createStorySchema.safeParse({ kind: "image" }).success).toBe(false);
    expect(
      createStorySchema.safeParse({ kind: "image", mediaId: crypto.randomUUID() }).success,
    ).toBe(true);
  });
});

describe("sendMessageSchema", () => {
  it("accepts a body or a media attachment, but not emptiness", () => {
    expect(sendMessageSchema.safeParse({ body: "hello" }).success).toBe(true);
    expect(sendMessageSchema.safeParse({ mediaId: crypto.randomUUID() }).success).toBe(true);
    expect(sendMessageSchema.safeParse({}).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "   " }).success).toBe(false);
  });
});

describe("createPostSchema", () => {
  it("requires at least one medium and caps caption length", () => {
    expect(createPostSchema.safeParse({ caption: "hi", mediaIds: [] }).success).toBe(false);
    expect(
      createPostSchema.safeParse({ caption: "hi", mediaIds: [crypto.randomUUID()] }).success,
    ).toBe(true);
    expect(createPostSchema.safeParse({ caption: "x".repeat(2201), mediaIds: [crypto.randomUUID()] }).success).toBe(false);
  });
});
