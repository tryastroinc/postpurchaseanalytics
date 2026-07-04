// ─────────────────────────────────────────────────────────────────────────────
// CC product ID → human-friendly label.
//
// CC's transaction/purchase API returns only the numeric productId. Support
// agents need to know what the customer actually bought ("Trial $1",
// "Subscription $49.99", "Upsell — Past Life"), not "product 17". Mapping
// lives in one place so we can add new SKUs as the funnel evolves.
//
// Trial IDs (1, 13, 15, 17) are hardcoded fallbacks — they're stable per
// the import-order route's PRODUCT_ID_BY_PRICE table. Subscription /
// upsell / one-time IDs come from env vars at build time so the mapping
// auto-tracks dev vs prod CC accounts.
// ─────────────────────────────────────────────────────────────────────────────

interface ProductLabelEntry {
  label: string;
  // Optional category for UI grouping/coloring later.
  kind: "trial" | "subscription" | "upsell" | "one_time" | "unknown";
}

function envId(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? String(v) : undefined;
}

// Build the catalog once at module load. Recomputed per-request would
// double the work and the env vars never change at runtime.
function buildCatalog(): Map<string, ProductLabelEntry> {
  const m = new Map<string, ProductLabelEntry>();

  // ── Trials (hardcoded fallbacks per import-order's PRODUCT_ID_BY_PRICE) ──
  m.set(envId("CHECKOUT_CHAMP_PRODUCT_TRIAL_1_ID") ?? "1", {
    label: "Trial · $1",
    kind: "trial",
  });
  m.set(envId("CHECKOUT_CHAMP_PRODUCT_TRIAL_5_ID") ?? "13", {
    label: "Trial · $5",
    kind: "trial",
  });
  m.set(envId("CHECKOUT_CHAMP_PRODUCT_TRIAL_9_ID") ?? "15", {
    label: "Trial · $9",
    kind: "trial",
  });
  m.set(envId("CHECKOUT_CHAMP_PRODUCT_TRIAL_1367_ID") ?? "17", {
    label: "Trial · $13.67",
    kind: "trial",
  });

  // ── Recurring subscriptions ──
  const sub4999 = envId("CHECKOUT_CHAMP_PRODUCT_SUB_4999_ID");
  if (sub4999) m.set(sub4999, { label: "Subscription · $49.99", kind: "subscription" });
  const sub1999 = envId("CHECKOUT_CHAMP_PRODUCT_SUB_1999_ID");
  if (sub1999) m.set(sub1999, { label: "Subscription · $19.99", kind: "subscription" });
  const sub7999 = envId("CHECKOUT_CHAMP_PRODUCT_SUB_7999_ID");
  if (sub7999) m.set(sub7999, { label: "Subscription · $79.99 (Pro)", kind: "subscription" });

  // ── Upsells (env-mapped in /api/cc/charge-upsell + sibling routes) ──
  const upsellMap: Array<[string, string]> = [
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_PAST_LIFE_ID", "Upsell · Past Life"],
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_PURPOSE_ID", "Upsell · Exact Purpose"],
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_CAREER_ID", "Upsell · Career"],
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_NETWORTH_ID", "Upsell · Net Worth"],
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_KIDS_ID", "Upsell · Future Kids"],
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_PLACE_ID", "Upsell · Ideal Place"],
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_CHAT_ID", "Upsell · Chat"],
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_VIDEO_READING_ID", "Upsell · Video Reading"],
    ["CHECKOUT_CHAMP_PRODUCT_UPSELL_BUNDLE_ID", "Upsell · Bundle"],
    ["CHECKOUT_CHAMP_PRODUCT_EXPEDITE_ID", "Upsell · Expedite"],
  ];
  for (const [envName, label] of upsellMap) {
    const id = envId(envName);
    if (id) m.set(id, { label, kind: "upsell" });
  }

  // ── One-time / variant pricing ──
  const onetime15 = envId("CHECKOUT_CHAMP_PRODUCT_ONETIME_15_ID");
  if (onetime15) m.set(onetime15, { label: "One-time · $15", kind: "one_time" });

  return m;
}

const CATALOG = buildCatalog();

export function productLabel(productId: string | number | null | undefined): string {
  if (productId == null) return "—";
  const key = String(productId);
  const entry = CATALOG.get(key);
  if (entry) return entry.label;
  return `Product #${key}`;
}

export function productKind(
  productId: string | number | null | undefined,
): ProductLabelEntry["kind"] {
  if (productId == null) return "unknown";
  return CATALOG.get(String(productId))?.kind ?? "unknown";
}
