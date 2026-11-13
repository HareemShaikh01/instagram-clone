import { ok } from "@/lib/api";
import { withHandler } from "@/lib/api-auth";
import { clearedSessionCookie, destroySession } from "@/lib/session";

export const POST = withHandler(async (req) => {
  await destroySession(req);
  return ok({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie() } });
});
