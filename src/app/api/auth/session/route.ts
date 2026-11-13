import { ApiError, ok } from "@/lib/api";
import { withHandler } from "@/lib/api-auth";
import { getSessionUser } from "@/lib/session";
import { toSessionUserDTO } from "@/lib/dto";

export const GET = withHandler(async (req) => {
  const user = await getSessionUser(req);
  if (!user) throw new ApiError(401, "unauthorized", "Not signed in");
  return ok({ user: toSessionUserDTO(user) });
});
