import { describe, expect, it } from "vitest";
import { hashPassword, randomToken, sessionTokenHash, sha256, verifyPassword } from "@/lib/password";

describe("hashPassword/verifyPassword", () => {
  it("round-trips a password and rejects wrong ones", async () => {
    const stored = await hashPassword("password1");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("password1", stored)).toBe(true);
    expect(await verifyPassword("password2", stored)).toBe(false);
  });

  it("salts uniquely and rejects malformed stored values", async () => {
    expect(await hashPassword("password1")).not.toBe(await hashPassword("password1"));
    expect(await verifyPassword("password1", "not-a-valid-hash")).toBe(false);
  });
});

describe("tokens", () => {
  it("generates url-safe random tokens", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomToken()).not.toBe(token);
  });

  it("hashes session tokens with the configured secret", () => {
    const token = "some-token";
    expect(sessionTokenHash(token)).toBe(sha256("test-session-secret:some-token"));
    expect(sessionTokenHash(token)).not.toBe(sha256(token));
  });
});
