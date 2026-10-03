export type Role = "clerk" | "manager" | "compliance" | "admin" | "auditor";

export interface Actor {
  userId: string;
  shopId: string;
  locationIds: string[];
  role: Role;
}

export interface AuthEnv {
  PAWNGUARD_DB: D1Database;
  PAWNGUARD_AUTH_ISSUER?: string;
  PAWNGUARD_AUTH_AUDIENCE?: string;
  PAWNGUARD_AUTH_JWKS_URL?: string;
}

export interface Env extends AuthEnv {
  PAWNGUARD_ENV: string;
  PAWNGUARD_ALLOWED_ORIGINS?: string;
  ASSETS?: Fetcher;
}

export type MatchDisposition =
  | "clear"
  | "review"
  | "possible_match"
  | "confirmed_hold";

export interface NormalizedItem {
  category: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  imei?: string;
  vin?: string;
  upc?: string;
  description?: string;
  distinctiveMarks?: string;
}
