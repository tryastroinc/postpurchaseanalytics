// POST/DELETE /api/post-purchase/session — the separate post-purchase login.
// POST { header: x-post-purchase-secret } → sets the post_purchase_session cookie.
// This cookie unlocks the /post-purchase board ONLY; the canvas/admin gates never
// read it, and this gate never reads theirs.
import { NextRequest, NextResponse } from "next/server";
import { isValidPostPurchaseSecret, POST_PURCHASE_COOKIE } from "@/lib/post-purchase-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-post-purchase-secret") || undefined;
  if (!isValidPostPurchaseSecret(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: POST_PURCHASE_COOKIE,
    value: "true",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 12 * 60 * 60, // 12 hours
    path: "/", // so both /post-purchase and /api/post-purchase see it
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete({ name: POST_PURCHASE_COOKIE, path: "/" });
  return response;
}
