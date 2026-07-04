// Post-purchase analytics board — the AfterSell-style framework hosted verbatim
// under public/ppa/ (index/funnels/builder + assets), embedded in a full-bleed
// same-origin iframe so it renders exactly as designed. Real data wires in via
// public/ppa/assets/data.js → fetch /api/analytics → window.APP_DATA.
//
// Gated by its own password (post_purchase_session cookie). See
// lib/post-purchase-auth.ts + app/api/session + ./PostPurchaseLogin.

import { cookies } from "next/headers";
import { POST_PURCHASE_COOKIE } from "@/lib/post-purchase-auth";
import PostPurchaseLogin from "./PostPurchaseLogin";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const store = await cookies();
  if (store.get(POST_PURCHASE_COOKIE)?.value !== "true") {
    return <PostPurchaseLogin />;
  }

  return (
    <iframe
      src="/ppa/funnels.html"
      title="Post-purchase Analytics"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        border: "none",
        background: "#1a1a1a",
      }}
    />
  );
}
