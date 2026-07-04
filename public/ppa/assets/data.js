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
    return fetch("/api/analytics?range=" + range, { credentials: "same-origin", cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((j) => {
        window.APP_DATA = hydrate(j);
        window.APP_DATA.__ready = true;
      })
      .catch((e) => {
        const d = emptyData();
        d.__ready = true;
        d.__error = String((e && e.message) || e);
        window.APP_DATA = d;
      })
      .then(() => {
        window.dispatchEvent(new Event("ppa:data"));
      });
  };

  window.loadAppData();
})();
