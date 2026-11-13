import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { media, users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { toSessionUserDTO } from "@/lib/dto";
import { verifyPassword } from "@/lib/password";
import { clearedSessionCookie } from "@/lib/session";
import { updateProfileSchema } from "@/lib/validate";

export const GET = withAuth(async (_req, user) => {
  return ok({ user: toSessionUserDTO(user) });
});

export const PATCH = withAuth(async (req, user) => {
  const body = updateProfileSchema.parse(await req.json());

  if (body.username && body.username !== user.username) {
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${body.username} and ${users.id} <> ${user.id}`)
      .limit(1);
    if (clash[0]) throw new ApiError(409, "username_taken", "That username is already taken");
  }

  if (body.avatarMediaId) {
    const m = await db
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, body.avatarMediaId), eq(media.ownerId, user.id)))
      .limit(1);
    if (!m[0]) throw new ApiError(403, "media_forbidden", "You do not own that media");
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
      ...(body.username !== undefined ? { username: body.username } : {}),
      ...(body.bio !== undefined ? { bio: body.bio } : {}),
      ...(body.website !== undefined ? { website: body.website ?? null } : {}),
      ...(body.avatarMediaId !== undefined ? { avatarMediaId: body.avatarMediaId } : {}),
      ...(body.isPrivate !== undefined ? { isPrivate: body.isPrivate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  return ok({ user: toSessionUserDTO(updated) });
});

const deleteSchema = z.object({ password: z.string().min(1, "Password is required") }).strict();

export const DELETE = withAuth(async (req, user) => {
  const body = deleteSchema.parse(await req.json());
  if (!(await verifyPassword(body.password, user.passwordHash)))
    throw new ApiError(403, "wrong_password", "Incorrect password");
  await db.delete(users).where(eq(users.id, user.id));
  return ok({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie() } });
});
