import { ApiError, ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { getProfile } from "@/lib/queries";

export const GET = withAuth(async (_req, user, ctx) => {
  const username = await param(ctx, "username");
  const profile = await getProfile(username, user.id);
  if (!profile) throw new ApiError(404, "not_found", "User not found");
  return ok({ profile });
});
