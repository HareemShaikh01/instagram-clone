import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { verifyPassword } from "@/lib/password";
import { changeEmailSchema } from "@/lib/validate";

export const POST = withAuth(async (req, user) => {
  const body = changeEmailSchema.parse(await req.json());
  if (!(await verifyPassword(body.password, user.passwordHash)))
    throw new ApiError(403, "wrong_password", "Password is incorrect");

  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${body.email} and ${users.id} <> ${user.id}`)
    .limit(1);
  if (clash[0]) throw new ApiError(409, "email_taken", "That email is already in use");

  await db
    .update(users)
    .set({ email: body.email, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return ok({ message: "Email updated" });
});
