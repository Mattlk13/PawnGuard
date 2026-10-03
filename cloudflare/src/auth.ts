import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { Actor, AuthEnv } from "./types";

const actorSchema = z.object({
  user_id: z.string().min(1),
  shop_id: z.string().min(1),
  role: z.enum(["clerk","manager","compliance","admin","auditor"]),
  location_ids: z.string()
});

const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function authenticate(request: Request, env: AuthEnv): Promise<Actor> {
  const issuer = env.PAWNGUARD_AUTH_ISSUER?.trim();
  const audience = env.PAWNGUARD_AUTH_AUDIENCE?.trim();
  const jwks = env.PAWNGUARD_AUTH_JWKS_URL?.trim();
  if (!issuer || !audience || !jwks)
    throw new ApiError(503,"AUTH_NOT_CONFIGURED","Identity provider is not configured.");

  const bearer = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const access = request.headers.get("cf-access-jwt-assertion") ?? undefined;
  const token = bearer ?? access;
  if (!token) throw new ApiError(401,"UNAUTHENTICATED","Verified sign-in is required.");

  const jwksUrl = new URL(jwks);
  if (jwksUrl.protocol !== "https:") throw new Error("JWKS must use HTTPS");
  let keys = keysets.get(jwksUrl.href);
  if (!keys) {
    keys = createRemoteJWKSet(jwksUrl);
    keysets.set(jwksUrl.href, keys);
  }

  let subject = "";
  try {
    const verified = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms:["RS256","ES256"],
      requiredClaims:["sub","iat","exp"]
    });
    subject = verified.payload.sub ?? "";
  } catch {
    throw new ApiError(401,"UNAUTHENTICATED","Invalid or expired session.");
  }

  const row = await env.PAWNGUARD_DB.withSession("first-primary")
    .prepare("SELECT user_id,shop_id,role,location_ids FROM actors WHERE issuer=? AND subject=? AND disabled=0")
    .bind(issuer,subject)
    .first();

  if (!row) throw new ApiError(403,"ACTOR_NOT_PROVISIONED","This identity has no PawnGuard role.");
  const parsed = actorSchema.parse(row);
  const locationIds = z.array(z.string()).parse(JSON.parse(parsed.location_ids));
  return {
    userId: parsed.user_id,
    shopId: parsed.shop_id,
    role: parsed.role,
    locationIds
  };
}

export function requireRole(actor: Actor, roles: Actor["role"][]) {
  if (!roles.includes(actor.role))
    throw new ApiError(403,"FORBIDDEN","Your assigned role cannot perform this action.");
}
