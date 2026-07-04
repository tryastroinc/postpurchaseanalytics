// ─────────────────────────────────────────────────────────────────────────────
// Separate login for the /post-purchase analytics board.
//
// A post-purchase-only password → a `post_purchase_session` cookie. The canvas /
// admin / dashboard gates NEVER check this cookie (and this gate never checks
// theirs), so /post-purchase has its OWN independent access — a user with this
// password gets the analytics board ONLY.
//
// Set POST_PURCHASE_SECRET in env (Vercel + local .env). Dev fallback below.
// ─────────────────────────────────────────────────────────────────────────────
import type { NextRequest } from "next/server";

export const POST_PURCHASE_COOKIE = "post_purchase_session";

export function postPurchaseSecret(): string {
  const s = process.env.POST_PURCHASE_SECRET?.trim();
  return s && s.length > 0 ? s : "postpurchase123";
}

export function isValidPostPurchaseSecret(provided: string | undefined | null): boolean {
  return !!provided && provided === postPurchaseSecret();
}

export function hasPostPurchaseSession(req: NextRequest): boolean {
  return req.cookies.get(POST_PURCHASE_COOKIE)?.value === "true";
}
