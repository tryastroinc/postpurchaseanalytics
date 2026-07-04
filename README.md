# Post-purchase Analytics

Standalone dashboard for **post-purchase / upsell analytics**, fed by live
**CheckoutChamp** data. An AfterSell-style board (vendored vanilla HTML/CSS/JS
under `public/ppa/`) embedded in a Next.js app that provides a password gate and
an authed API that queries CheckoutChamp.

Extracted from the main Astro funnel repo so it deploys and evolves on its own.

## Stack

- Next.js 16 (App Router) + TypeScript
- The board: dependency-free static files in `public/ppa/` (no build step)
- Data: CheckoutChamp `/transactions/query/` via `lib/checkout-champ.ts`

## Layout

```
app/
  page.tsx            # password gate → full-bleed iframe of the board
  layout.tsx          # root html/body
  PostPurchaseLogin.tsx
  api/
    session/route.ts    # POST password → post_purchase_session cookie (12h)
    analytics/route.ts  # authed: builds window.APP_DATA from real CC data
lib/
  checkout-champ.ts     # CC API client
  cc-product-catalog.ts # productId → trial/sub/upsell classification
  cc-timezone.ts        # EST (America/New_York) date helpers
  post-purchase-auth.ts # cookie gate
public/ppa/             # the board (index/funnels/builder + assets)
  assets/data.js        # fetches /api/analytics → window.APP_DATA (+ 'ppa:data')
  assets/app.js         # renders on 'ppa:data'; header dropdowns + CSV export
```

## Setup

```bash
npm install
cp .env.example .env.local   # fill in POST_PURCHASE_SECRET + CheckoutChamp creds
npm run dev                  # http://localhost:3000
```

Enter the `POST_PURCHASE_SECRET` password to unlock the board.

## Timezone

All dates are handled **strictly in EST** (`America/New_York`) — CheckoutChamp
operates in EST, so query bounds and day buckets are EST calendar days.

## Data model (what's real vs estimated)

Real, straight from CheckoutChamp:

- Upsell revenue (total / per-day / per-product)
- Accepted-offer counts, average upsell value (AOV)
- Eligible-order visits, revenue-per-visit (RPV), overall conversion

Estimated (CC has **no per-offer view tracking**):

- The per-offer **impression + conversion curves** are modeled as a sequential
  funnel from the real eligible base and real accepted counts (slot 0 is shown to
  every eligible order; each later slot sees the prior slot's decliners). Clearly
  a model, not measured views — see `slotImpressions()` in `app/api/analytics/route.ts`.
- The **device filter** and **Compare** dropdowns are UI-only (CC has no device
  or comparison data). **Export** downloads a CSV of the loaded data.

`data.js` is the single integration point on the board side; everything the UI
renders comes from `window.APP_DATA`.
