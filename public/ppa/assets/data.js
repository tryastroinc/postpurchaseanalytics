/* ============================================================
   DATA LAYER — real post-purchase analytics.
   Fetches the authed /api/analytics endpoint (same-origin; the
   post_purchase_session cookie rides along) and populates
   window.APP_DATA in the exact shape app.js renders, then fires
   a 'ppa:data' event so app.js renders. A zero skeleton is set
   first so nothing errors before the fetch resolves (or if it
   fails). Date range comes from sessionStorage.ppaRange (days).
   ============================================================ */

(function () {
  // ---- shared formatters (unchanged) ----
  window.APP_FMT = {
    money: (v, dp) =>
      "$" +
      Number(v).toLocaleString("en-US", {
        minimumFractionDigits: dp ?? (v % 1 ? 2 : 0),
        maximumFractionDigits: dp ?? 2,
      }),
    int: (v) => Number(v).toLocaleString("en-US"),
    pct: (v) => v + "%",
    date: (d) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };

  const SLOT_DEFS = [
    { id: "upsell1", label: "Upsell #1", cssVar: "--s-upsell1" },
    { id: "upsell2", label: "Upsell #2", cssVar: "--s-upsell2" },
    { id: "upsell3", label: "Upsell #3", cssVar: "--s-upsell3" },
    { id: "downsell1", label: "Downsell #1", cssVar: "--s-downsell1" },
    { id: "downsell2", label: "Downsell #2", cssVar: "--s-downsell2" },
    { id: "typage", label: "Thank you page", cssVar: "--s-typage" },
  ];

  // "YYYY-MM-DD" → local Date (midnight) so toLocaleDateString shows the same day.
  const toDate = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const emptySeries = () => SLOT_DEFS.map((s) => ({ ...s, values: [] }));

  // A complete zero-value APP_DATA so every view renders (blank) without errors.
  function emptyData() {
    return {
      dateRange: { label: "Last 30 days", start: "", end: "" },
      dates: [],
      seriesDefs: SLOT_DEFS,
      summary: {
        revenueTotal: 0,
        revenueDelta: null,
        revenueByDay: [],
        kpis: {
          funnelsRevenue: { value: 0, delta: 0 },
          funnelsImpressions: { value: 0, delta: 0 },
          productPageRevenue: { value: 0, delta: 0 },
          productPageImpressions: { value: 0, delta: 0 },
          roktRevenue: { value: 0, delta: 0 },
          roktTransactions: { value: 0, delta: 0 },
        },
      },
      funnels: {
        list: ["All funnels"],
        revenueTotal: 0,
        revenueByType: emptySeries(),
        revenuePerVisit: { oneClick: 0, tyPage: 0, byDay: [] },
        impressionsTotal: 0,
        impressionsByType: emptySeries(),
        conversionRate: 0,
        conversionByType: emptySeries(),
        acceptedOffersTotal: 0,
        acceptedByType: emptySeries(),
        avgUpsellValue: 0,
        avgValueByType: emptySeries(),
      },
      products: [],
      funnelList: {
        smartFunnel: { name: "Smart Funnel", status: "Inactive", tags: [], rpvPPU: 0, conversion: 0, visits: 0, revenue: 0 },
        rows: [],
        eligibleNote: "",
      },
      builder: {
        funnelName: "",
        offers: {},
        preview: { orderNumber: 0, headline: "", copy: "", timer: "", product: "", priceWas: 0, priceNow: 0, savePct: 0, urgency: "", variantLabel: "", variantValue: "", subtotal: 0 },
      },
    };
  }

  // Convert the API payload (ISO date strings) into the render shape (Date objects).
  function hydrate(raw) {
    const d = raw && typeof raw === "object" ? raw : emptyData();
    d.seriesDefs = d.seriesDefs || SLOT_DEFS;
    d.dates = (d.dates || []).map(toDate);
    return d;
  }

  function getRange() {
    try {
      const s = sessionStorage.getItem("ppaRange");
      const n = s ? parseInt(s, 10) : 30;
      return [7, 30, 60, 90, 365].includes(n) ? n : 30;
    } catch (e) {
      return 30;
    }
  }

  // Safe default until the fetch resolves.
  window.APP_DATA = emptyData();

  window.loadAppData = function () {
    const range = getRange();
    // Custom calendar range from the date picker ("YYYY-MM-DD,YYYY-MM-DD").
    // INTEGRATION POINT: /api/analytics currently only honours `range` (days);
    // when it learns start/end these params are already being sent.
    let custom = "";
    try {
      const c = sessionStorage.getItem("ppaRangeCustom");
      if (c && /^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/.test(c)) {
        const [s, e] = c.split(",");
        custom = "&start=" + s + "&end=" + e;
      }
    } catch (e) {}
    // Compare window (none | previous_period | previous_year). When set, the
    // API should also return a `deltas` map ({ metricKey: percentChange }) —
    // INTEGRATION POINT; the UI renders APP_DATA.deltas automatically.
    let compare = "";
    try {
      const cm = sessionStorage.getItem("ppaCompare");
      if (cm && cm !== "none") compare = "&compare=" + cm;
    } catch (e) {}
    // Canvas split-test variant (SKELETON). ?variant=<id> in the URL (e.g. a
    // deep link from a canvas card) wins and persists; the API should scope
    // every metric to that variant once transactions are tagged by test —
    // INTEGRATION POINT. It should also return `variants` ([{id, label}])
    // so the header selector can list them.
    let variant = "";
    try {
      const fromUrl = new URLSearchParams(location.search).get("variant");
      if (fromUrl) sessionStorage.setItem("ppaVariant", fromUrl);
      const v = sessionStorage.getItem("ppaVariant");
      if (v && v !== "all") variant = "&variant=" + encodeURIComponent(v);
    } catch (e) {}
    const url = "/api/analytics?range=" + range + custom + compare + variant;

    const publish = (raw) => {
      window.APP_DATA = hydrate(raw);
      window.APP_DATA.__ready = true;
      window.dispatchEvent(new Event("ppa:data"));
    };
    const fetchFresh = () =>
      fetch(url, { credentials: "same-origin", cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });

    // Stale-while-revalidate: switching pages re-renders from the last
    // payload instantly (no blank-then-pop), while the cache refreshes in
    // the background for the next navigation. Any filter change (range /
    // compare / variant) changes the URL → cache miss → fresh fetch.
    const CACHE_TTL = 60 * 1000;
    const cacheKey = "ppaCache:" + url;
    let cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null"); } catch (e) {}
    if (cached && cached.d && Date.now() - cached.t < CACHE_TTL) {
      publish(cached.d);
      fetchFresh()
        .then((j) => { try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), d: j })); } catch (e) {} })
        .catch(() => {});
      return Promise.resolve();
    }

    return fetchFresh()
      .then((j) => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), d: j })); } catch (e) {}
        publish(j);
      })
      .catch((e) => {
        const d = emptyData();
        d.__ready = true;
        d.__error = String((e && e.message) || e);
        window.APP_DATA = d;
        window.dispatchEvent(new Event("ppa:data"));
      });
  };

  window.loadAppData();
})();
