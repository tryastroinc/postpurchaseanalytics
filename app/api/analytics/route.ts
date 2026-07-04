// Real post-purchase / upsell analytics for the /post-purchase board.
//
// Feeds public/ppa (the AfterSell-style dashboard) with LIVE CheckoutChamp data
// in the exact window.APP_DATA shape data.js expects — replacing the mock layer.
//
// Auth: gated by the post_purchase_session cookie (hasPostPurchaseSession). The
// board's iframe is same-origin, so its fetch carries the cookie. Never expose
// this without the gate — it returns real revenue.
//
// What's REAL (straight from CC /transactions/query/):
//   upsell revenue (total / per-day / per-product), accepted-offer counts, AOV,
//   RPV, eligible-order visits, overall conversion.
// What's ESTIMATED (CC has no per-offer VIEW tracking): the per-offer impression
//   + conversion CURVES. We model a sequential funnel from the real eligible base
//   and real accepted counts (imp[0]=eligible; each next slot sees the prior
//   slot's decliners). Clearly a model, not measured views — see buildSlots().

import { NextRequest, NextResponse } from "next/server";
import { hasPostPurchaseSession } from "@/lib/post-purchase-auth";
import { queryTransactions, type QueryTransactionsRow } from "@/lib/checkout-champ";
import { productKind, productLabel } from "@/lib/cc-product-catalog";
import { ccDateYmd } from "@/lib/cc-timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOT_IDS = ["upsell1", "upsell2", "upsell3", "downsell1", "downsell2", "typage"] as const;
const SLOT_DEFS = [
  { id: "upsell1", label: "Upsell #1", cssVar: "--s-upsell1" },
  { id: "upsell2", label: "Upsell #2", cssVar: "--s-upsell2" },
  { id: "upsell3", label: "Upsell #3", cssVar: "--s-upsell3" },
  { id: "downsell1", label: "Downsell #1", cssVar: "--s-downsell1" },
  { id: "downsell2", label: "Downsell #2", cssVar: "--s-downsell2" },
  { id: "typage", label: "Thank you page", cssVar: "--s-typage" },
];

// All dates are handled STRICTLY in EST (America/New_York) — CC operates in EST,
// so the query bounds AND the day buckets must be EST calendar days, never the
// server's local time.
function ymdToMmdd(ymdStr: string): string {
  const [y, m, d] = ymdStr.split("-");
  return `${m}/${d}/${y}`;
}
function addDaysYmd(ymdStr: string, delta: number): string {
  const [y, m, d] = ymdStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // noon anchor avoids DST edges
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function readAmount(row: QueryTransactionsRow): number {
  const r = row as Record<string, unknown>;
  const raw = r.totalAmount ?? r.amount ?? r.amountTotal ?? 0;
  return parseFloat(String(raw)) || 0;
}
function isApprovedSale(row: QueryTransactionsRow): boolean {
  const r = row as Record<string, unknown>;
  if (r.isChargedback === "YES" || (parseFloat(String(r.chargebackAmount ?? 0)) || 0) > 0) return false;
  if (r.refundReason) return false;
  return String(r.responseType ?? "").toUpperCase() === "SUCCESS";
}
// The transaction date as YYYY-MM-DD (CC returns e.g. "2026-06-14 03:11:22").
function rowDateYmd(row: QueryTransactionsRow): string | null {
  const r = row as Record<string, unknown>;
  const raw = String(r.transactionDate ?? r.dateCreated ?? r.orderDate ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`; // CC stamps in EST already
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : ccDateYmd(d);
}

// Pull the upsell productId (+ amount) out of a transaction: prefer top-level
// productId if it maps to an upsell, else the first UPSALE line item.
function upsellFromRow(row: QueryTransactionsRow): { productId: string; amount: number } | null {
  const r = row as Record<string, unknown>;
  if (r.productId != null && productKind(r.productId as string | number) === "upsell") {
    return { productId: String(r.productId), amount: readAmount(row) };
  }
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  for (const it of items) {
    const pt = String(it.productType ?? "").toUpperCase();
    const pid = it.productId as string | number | null | undefined;
    if ((pt === "UPSALE" || pt === "UPSELL" || (pid != null && productKind(pid) === "upsell")) && pid != null) {
      const amt = parseFloat(String(it.price ?? it.amount ?? it.totalPrice ?? 0)) || readAmount(row);
      return { productId: String(pid), amount: amt };
    }
  }
  return null;
}

interface ProductAgg {
  productId: string;
  name: string;
  revenue: number;
  accepted: number;
  revenueByDay: Map<string, number>;
  acceptedByDay: Map<string, number>;
}

// Model per-offer impressions as a sequential funnel from real accepted counts:
// slot 0 is shown to every eligible order; each later slot is shown to the prior
// slot's decliners. Conversion = accepted / modeled-impressions. Estimate only.
function slotImpressions(eligible: number, accepted: number[]): number[] {
  const imp: number[] = [];
  let carry = eligible;
  for (let i = 0; i < accepted.length; i++) {
    const shown = Math.max(carry, accepted[i]);
    imp.push(shown);
    carry = Math.max(shown - accepted[i], accepted[i + 1] ?? 0);
  }
  return imp;
}

export async function GET(req: NextRequest) {
  if (!hasPostPurchaseSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const RANGES = [7, 30, 60, 90, 365];
  const reqRange = parseInt(req.nextUrl.searchParams.get("range") || "30", 10);
  const rangeDays = RANGES.includes(reqRange) ? reqRange : 30;

  // Today + range window as EST calendar days (never server-local).
  const endYmd = ccDateYmd(new Date());              // YYYY-MM-DD in EST
  const startYmd = addDaysYmd(endYmd, -(rangeDays - 1));

  // Ordered list of EST day keys covering the range.
  const dayKeys: string[] = [];
  for (let i = 0; i < rangeDays; i++) dayKeys.push(addDaysYmd(startYmd, i));
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));

  // ── Pull every SUCCESS transaction in range (paginated like demographics) ──
  const products = new Map<string, ProductAgg>();
  const revenueByDay = new Array(rangeDays).fill(0);
  const eligibleCustomers = new Set<string>();
  let ccError: string | null = null;

  try {
    const sd = ymdToMmdd(startYmd), ed = ymdToMmdd(endYmd);
    for (let page = 1; page <= 200; page++) {
      let rows: QueryTransactionsRow[] = [];
      try {
        const res = await queryTransactions({ startDate: sd, endDate: ed, pageNum: page, resultsPerPage: 200 });
        rows = (res.data ?? []) as QueryTransactionsRow[];
      } catch (e) {
        if (e instanceof Error && /no orders? matching/i.test(e.message)) break;
        throw e;
      }
      for (const row of rows) {
        if (!isApprovedSale(row)) continue;
        const dk = rowDateYmd(row);
        const di = dk != null ? dayIndex.get(dk) : undefined;

        const up = upsellFromRow(row);
        if (up) {
          let agg = products.get(up.productId);
          if (!agg) {
            agg = { productId: up.productId, name: productLabel(up.productId), revenue: 0, accepted: 0, revenueByDay: new Map(), acceptedByDay: new Map() };
            products.set(up.productId, agg);
          }
          agg.revenue += up.amount;
          agg.accepted += 1;
          if (dk) {
            agg.revenueByDay.set(dk, (agg.revenueByDay.get(dk) || 0) + up.amount);
            agg.acceptedByDay.set(dk, (agg.acceptedByDay.get(dk) || 0) + 1);
          }
          if (di !== undefined) revenueByDay[di] += up.amount;
        } else {
          // Base order (trial / sub / one-time) — the post-purchase-eligible population.
          const kind = productKind((row as Record<string, unknown>).productId as string | number | null | undefined);
          if (kind === "trial" || kind === "subscription" || kind === "one_time" || kind === "unknown") {
            const cust = (row as Record<string, unknown>).customerId;
            if (cust != null) eligibleCustomers.add(String(cust));
          }
        }
      }
      if (rows.length < 200) break;
    }
  } catch (e) {
    ccError = e instanceof Error ? e.message : "cc query failed";
  }

  // ── Rank upsell products → slots (by revenue), build per-slot series ──
  const ranked = [...products.values()].sort((a, b) => b.revenue - a.revenue);
  const slotProduct = ranked.slice(0, SLOT_IDS.length); // one product per slot
  const acceptedPerSlot = slotProduct.map((p) => p.accepted);
  const eligibleVisits = Math.max(eligibleCustomers.size, slotProduct[0]?.accepted ?? 0);
  const impPerSlot = slotImpressions(eligibleVisits, acceptedPerSlot);

  const seriesByDay = (pick: (p: ProductAgg, day: string) => number) =>
    SLOT_DEFS.map((def, i) => {
      const p = slotProduct[i];
      return { ...def, values: dayKeys.map((day) => (p ? pick(p, day) : 0)) };
    });

  const revenueByType = seriesByDay((p, day) => Math.round((p.revenueByDay.get(day) || 0) * 100) / 100);
  const acceptedByType = seriesByDay((p, day) => p.acceptedByDay.get(day) || 0);
  const avgValueByType = seriesByDay((p, day) => {
    const acc = p.acceptedByDay.get(day) || 0;
    return acc ? Math.round(((p.revenueByDay.get(day) || 0) / acc) * 100) / 100 : 0;
  });
  // Impressions/conversion per type: distribute the modeled slot impressions
  // across days proportional to that slot's real accepted-per-day.
  const impressionsByType = SLOT_DEFS.map((def, i) => {
    const p = slotProduct[i];
    const totalAcc = acceptedPerSlot[i] || 0;
    const totalImp = impPerSlot[i] || 0;
    const factor = totalAcc ? totalImp / totalAcc : 0;
    return { ...def, values: dayKeys.map((day) => (p ? Math.round((p.acceptedByDay.get(day) || 0) * factor) : 0)) };
  });
  const conversionByType = SLOT_DEFS.map((def, i) => {
    const rate = impPerSlot[i] ? (acceptedPerSlot[i] / impPerSlot[i]) * 100 : 0;
    return { ...def, values: dayKeys.map((day) => ((slotProduct[i]?.acceptedByDay.get(day) || 0) > 0 ? Math.round(rate * 100) / 100 : 0)) };
  });

  const upsellRevenue = ranked.reduce((s, p) => s + p.revenue, 0);
  const acceptedTotal = ranked.reduce((s, p) => s + p.accepted, 0);
  const rpvOneClick = eligibleVisits ? Math.round((upsellRevenue / eligibleVisits) * 100) / 100 : 0;
  const conversionRate = eligibleVisits ? Math.round((acceptedTotal / eligibleVisits) * 10000) / 100 : 0;
  const avgUpsellValue = acceptedTotal ? Math.round((upsellRevenue / acceptedTotal) * 100) / 100 : 0;

  // ── Products table: one row per real upsell product ──
  const productRows = ranked.map((p) => {
    const slotIdx = slotProduct.findIndex((s) => s.productId === p.productId);
    const slots: Record<string, { pct: number; accepted: number; shown: number } | null> = {
      upsell1: null, upsell2: null, upsell3: null, downsell1: null, downsell2: null, typage: null,
    };
    if (slotIdx >= 0 && slotIdx < SLOT_IDS.length) {
      const shown = impPerSlot[slotIdx] || p.accepted;
      slots[SLOT_IDS[slotIdx]] = { pct: shown ? Math.round((p.accepted / shown) * 1000) / 10 : 0, accepted: p.accepted, shown };
    }
    return {
      name: p.name,
      slots,
      revenue: Math.round(p.revenue * 100) / 100,
      rpv: eligibleVisits ? Math.round((p.revenue / eligibleVisits) * 100) / 100 : 0,
    };
  });

  const rangeLabel = `Last ${rangeDays} days`;

  const data = {
    dateRange: { label: rangeLabel, start: startYmd, end: endYmd },
    dates: dayKeys, // EST YYYY-MM-DD strings; data.js converts to Date objects
    generatedAt: new Date().toISOString(),
    ccError, // surfaced so the board can show a soft error instead of silent zeros
    seriesDefs: SLOT_DEFS,

    summary: {
      revenueTotal: Math.round(upsellRevenue),
      revenueDelta: null,
      revenueByDay,
      kpis: {
        funnelsRevenue: { value: Math.round(upsellRevenue * 100) / 100, delta: 0 },
        funnelsImpressions: { value: eligibleVisits, delta: 0 },
        productPageRevenue: { value: 0, delta: 0 },
        productPageImpressions: { value: 0, delta: 0 },
        roktRevenue: { value: 0, delta: 0 },
        roktTransactions: { value: 0, delta: 0 },
      },
    },

    funnels: {
      list: ["All funnels", "Classic upsell"],
      revenueTotal: Math.round(upsellRevenue * 100) / 100,
      revenueByType,
      revenuePerVisit: {
        oneClick: rpvOneClick,
        tyPage: 0,
        byDay: revenueByDay.map((rev) => (eligibleVisits ? Math.round((rev / eligibleVisits) * 100) / 100 : 0)),
      },
      impressionsTotal: eligibleVisits,
      impressionsByType,
      conversionRate,
      conversionByType,
      acceptedOffersTotal: acceptedTotal,
      acceptedByType,
      avgUpsellValue,
      avgValueByType,
    },

    products: productRows,

    funnelList: {
      smartFunnel: { name: "Smart Funnel", status: "Inactive", tags: ["100% traffic", "30% max discount", "Free shipping"], rpvPPU: 0, conversion: 0, visits: 0, revenue: 0 },
      rows: [
        { priority: 1, name: "Classic upsell", rpvPPU: rpvOneClick, rpvTYP: null, visits: eligibleVisits, revenue: Math.round(upsellRevenue * 100) / 100, active: true },
      ],
      eligibleNote: `${acceptedTotal} accepted upsells from ${eligibleVisits} eligible orders in the ${rangeLabel.toLowerCase()}`,
    },

    builder: {
      funnelName: "Classic upsell",
      offers: Object.fromEntries(
        slotProduct.map((p, i) => {
          const imp = impPerSlot[i] || p.accepted;
          return [SLOT_IDS[i], {
            slot: SLOT_DEFS[i].label,
            product: p.name,
            meta: ["", "Free", "5 min", "1+"],
            views: imp,
            revenue: Math.round(p.revenue * 100) / 100,
            rpv: eligibleVisits ? Math.round((p.revenue / eligibleVisits) * 100) / 100 : 0,
            conversion: imp ? Math.round((p.accepted / imp) * 10000) / 100 : 0,
          }];
        }),
      ),
      preview: {
        orderNumber: 0,
        headline: "Your order is still open — add this personalized reading now before it's gone.",
        copy: "A deep-dive reading decoded from your chart, prepared just for you. Add it to your order in one click — no extra checkout.",
        timer: "Offer expires in: 4:59",
        product: slotProduct[0]?.name || "Personalized Reading",
        priceWas: 0,
        priceNow: slotProduct[0] && slotProduct[0].accepted ? Math.round((slotProduct[0].revenue / slotProduct[0].accepted) * 100) / 100 : 0,
        savePct: 0,
        urgency: "This offer disappears after you leave this page.",
        variantLabel: "Reading",
        variantValue: slotProduct[0]?.name || "—",
        subtotal: slotProduct[0] && slotProduct[0].accepted ? Math.round((slotProduct[0].revenue / slotProduct[0].accepted) * 100) / 100 : 0,
      },
    },
  };

  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=60" } });
}
