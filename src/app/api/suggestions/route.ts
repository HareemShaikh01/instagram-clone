import { ok } from "@/lib/api";
import { param, withAuth } from "@/lib/api-auth";
import { suggestAccounts } from "@/lib/queries";

export const GET = withAuth(async (_req, user) => {
  const suggestions = await suggestAccounts(user.id, 5);
  return ok({ suggestions });
});
