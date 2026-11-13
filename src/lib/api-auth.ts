import { ApiError, errorResponse } from "./api";
import { getSessionUser, type SessionUser } from "./session";

export type RouteCtx = { params: Promise<Record<string, string>> };

/** Await and extract a dynamic segment, rejecting malformed requests. */
export async function param(ctx: RouteCtx, name: string): Promise<string> {
  const value = (await ctx.params)[name];
  if (!value) throw new ApiError(400, "invalid_params", `Missing ${name}`);
  return value;
}

export function withAuth(
  fn: (req: Request, user: SessionUser, ctx: RouteCtx) => Promise<Response>,
): (req: Request, ctx: RouteCtx) => Promise<Response> {
  return async (req, ctx = { params: Promise.resolve({}) }) => {
    try {
      const user = await getSessionUser(req);
      if (!user) throw new ApiError(401, "unauthorized", "Sign in to continue");
      return await fn(req, user, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function withHandler(
  fn: (req: Request, ctx: RouteCtx) => Promise<Response>,
): (req: Request, ctx: RouteCtx) => Promise<Response> {
  return async (req, ctx = { params: Promise.resolve({}) }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
