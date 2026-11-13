import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { randomToken, sessionTokenHash } from "./password";

export const SESSION_COOKIE = "ig_session";
const SESSION_DAYS = 30;

export type SessionUser = typeof users.$inferSelect;

export function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(sessions).values({ userId, tokenHash: sessionTokenHash(token), expiresAt });
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sessionTokenHash(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

/** Resolve the session user from a route-handler Request (reads Cookie header). */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const cookiesMap = parseCookieHeader(req.headers.get("cookie"));
  return userForToken(cookiesMap[SESSION_COOKIE]);
}

/** Resolve the session user inside a server component. */
export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  const store = await cookies();
  return userForToken(store.get(SESSION_COOKIE)?.value);
}

export async function destroySession(req: Request): Promise<void> {
  const cookiesMap = parseCookieHeader(req.headers.get("cookie"));
  const token = cookiesMap[SESSION_COOKIE];
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sessionTokenHash(token)));
}
