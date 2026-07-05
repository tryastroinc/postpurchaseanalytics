/* ============================================================
   Page logic. Reads window.APP_DATA (data.js) and renders.
   Pages are keyed by <body data-page="...">.
   ============================================================ */

(function () {
  // Render runs once real data has arrived (data.js fetches then fires 'ppa:data').
  function boot() {
  const D = window.APP_DATA;
  const F = window.APP_FMT;
  const page = document.body.dataset.page;

  /* Date-range popover now lives in assets/datepicker.js (Shopify-style
     dual-month calendar). It owns open/close, presets, and persistence. */

  /* ---------- shared: lightweight dropdown menu (devices / compare) + export ----
     A minimal popover anchored under a header button. CC carries no per-device
     or comparison data, so these filter the LABEL/UI; Export downloads a CSV of
     the data currently loaded. */
  function makeMenu(btn, items, onPick, activeIndex = 0) {
    if (!btn) return;
    const menu = document.createElement("div");
    menu.className = "menu-popover"; // styled like the date picker (theme-aware)
    document.body.appendChild(menu);
    items.forEach((label, idx) => {
      const row = document.createElement("button");
      row.type = "button";
      row.textContent = label;
      if (idx === activeIndex) row.classList.add("active");
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === row));
        menu.style.display = "none";
        onPick(label);
      });
      menu.appendChild(row);
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.style.display === "block";
      document.querySelectorAll("[data-ppa-menu]").forEach((m) => (m.style.display = "none"));
      if (open) { menu.style.display = "none"; return; }
      const r = btn.getBoundingClientRect();
      menu.style.left = r.left + window.scrollX + "px";
      menu.style.top = r.bottom + window.scrollY + 6 + "px";
      menu.style.display = "block";
    });
    menu.setAttribute("data-ppa-menu", "");
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => (menu.style.display = "none"));
  }

  const setBtnLabel = (btn, text) => {
    if (!btn) return;
    const caret = btn.querySelector(".caret");
    btn.textContent = text + " ";
    if (caret) btn.appendChild(caret);
    else { const c = document.createElement("span"); c.className = "caret"; c.textContent = "▾"; btn.appendChild(c); }
  };

  // Devices — UI filter (CC has no device attribution).
  makeMenu(document.getElementById("deviceFilterBtn"), ["All devices", "Desktop", "Mobile", "Tablet"], (v) =>
    setBtnLabel(document.getElementById("deviceFilterBtn"), "⌗ " + v)
  );
  // Compare — drives the % deltas next to every metric. Choice persists across
  // pages; data.js forwards it as &compare= so the API can return APP_DATA.deltas
  // (a { key: percentChange } map — INTEGRATION POINT until backend computes it).
  const COMPARE_OPTS = ["Compare: None", "Previous period", "Previous year"];
  const COMPARE_KEYS = { "Compare: None": "none", "Previous period": "previous_period", "Previous year": "previous_year" };
  let compareMode = "none";
  try { compareMode = sessionStorage.getItem("ppaCompare") || "none"; } catch (e) {}
  const compareIdx = Math.max(0, Object.values(COMPARE_KEYS).indexOf(compareMode));
  const compareBtn = document.getElementById("compareBtn");
  setBtnLabel(compareBtn, "⧉ " + (compareMode === "none" ? "Compare: None" : "Compare: " + COMPARE_OPTS[compareIdx]));
  makeMenu(compareBtn, COMPARE_OPTS, (v) => {
    try { sessionStorage.setItem("ppaCompare", COMPARE_KEYS[v]); } catch (e) {}
    location.reload(); // data.js refetches with the compare window
  }, compareIdx);

  // % up / % down badges. Reads APP_DATA.deltas[key] (percent change vs the
  // compare window); "–" when compare is off or the key is missing.
  function renderDeltas() {
    const deltas = (D && D.deltas) || {};
    document.querySelectorAll(".stat-value .delta").forEach((el) => {
      const d = el.dataset.delta != null ? deltas[el.dataset.delta] : undefined;
      if (compareMode === "none" || d == null || !isFinite(d)) {
        el.textContent = "–";
        el.classList.remove("up", "down");
        return;
      }
      const up = d >= 0;
      el.textContent = (up ? "↑ " : "↓ ") + Math.abs(d).toFixed(1) + "%";
      el.classList.toggle("up", up);
      el.classList.toggle("down", !up);
    });
  }
  renderDeltas();
  // Export — real CSV download of the data currently loaded.
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportCsv());

  function exportCsv() {
    const d = window.APP_DATA || {};
    const f = d.funnels || {}, s = d.summary || {};
    const rpv = (f.revenuePerVisit || {}).oneClick || 0;
    const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [];
    lines.push("Post-purchase analytics," + (d.dateRange ? d.dateRange.label : ""));
    lines.push("Range," + esc((d.dateRange || {}).start + " to " + (d.dateRange || {}).end));
    lines.push("");
    lines.push("Metric,Value");
    lines.push("Total upsell revenue," + (s.revenueTotal || 0));
    lines.push("Eligible orders," + (f.impressionsTotal || 0));
    lines.push("Accepted offers," + (f.acceptedOffersTotal || 0));
    lines.push("Conversion %," + (f.conversionRate || 0));
    lines.push("Avg upsell value," + (f.avgUpsellValue || 0));
    lines.push("Revenue per visit," + rpv);
    lines.push("");
    lines.push("Product,Revenue,RPV,Accepted,Shown");
    (d.products || []).forEach((p) => {
      let accepted = 0, shown = 0;
      Object.values(p.slots || {}).forEach((c) => { if (c) { accepted += c.accepted || 0; shown += c.shown || 0; } });
      lines.push([esc(p.name), p.revenue || 0, p.rpv || 0, accepted, shown].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "post-purchase-analytics.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- shared: products table ---------- */
  const SLOT_COLS = [
    ["upsell1", "Upsell #1"], ["upsell2", "Upsell #2"], ["upsell3", "Upsell #3"],
    ["downsell1", "Downsell #1"], ["downsell2", "Downsell #2"], ["typage", "Thank you page"],
  ];

  function renderProductsTable(table, rows) {
    table.textContent = "";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    ["Product name", ...SLOT_COLS.map(([, l]) => l), "Revenue ⇅", "RPV"].forEach((h, i) => {
      const th = document.createElement("th");
      th.textContent = h;
      if (i === 0) th.style.textAlign = "left";
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const p of rows) {
      const tr = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = p.name;
      tr.appendChild(name);
      for (const [key] of SLOT_COLS) {
        const td = document.createElement("td");
        const cell = p.slots[key];
        if (!cell) {
          td.innerHTML = '<span class="dash"></span>';
        } else {
          const pct = document.createElement("div");
          pct.className = "cell-pct";
          pct.textContent = F.pct(cell.pct);
          const frac = document.createElement("div");
          frac.className = "cell-frac";
          frac.textContent = `${F.int(cell.accepted)} of ${F.int(cell.shown)}`;
          td.append(pct, frac);
        }
        tr.appendChild(td);
      }
      const rev = document.createElement("td");
      rev.textContent = F.money(p.revenue, 2);
      const rpv = document.createElement("td");
      rpv.textContent = F.money(p.rpv, 2);
      tr.append(rev, rpv);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }

  function wireProductsTables() {
    document.querySelectorAll("[data-products-table]").forEach((table) => {
      renderProductsTable(table, D.products);
    });
    document.querySelectorAll("[data-products-count]").forEach((el) => {
      el.textContent = `Showing 1-${D.products.length} of ${D.products.length} results`;
    });
    // live search
    ["productSearchSummary", "productSearchFunnels"].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        const rows = D.products.filter((p) => p.name.toLowerCase().includes(q));
        const table = input.closest(".table-card").querySelector("[data-products-table]");
        renderProductsTable(table, rows);
      });
    });
  }

  /* ============================================================
     ANALYTICS PAGE
     ============================================================ */
  if (page === "analytics") {
    // --- tabs (deep-linkable via #funnels etc.) ---
    const tabs = document.querySelectorAll("#mainTabs [role=tab]");
    const selectTab = (name) => {
      tabs.forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === name));
      document.querySelectorAll("[data-tabpanel]").forEach((p) =>
        p.classList.toggle("hidden", p.dataset.tabpanel !== name)
      );
    };
    tabs.forEach((t) =>
      t.addEventListener("click", () => {
        history.replaceState(null, "", "#" + t.dataset.tab);
        selectTab(t.dataset.tab);
      })
    );
    const hash = location.hash.slice(1);
    if (hash && document.querySelector(`[data-tabpanel="${hash}"]`)) selectTab(hash);

    // --- summary ---
    document.getElementById("summaryRevenueTotal").textContent = F.money(D.summary.revenueTotal, 0);
    renderChart(document.getElementById("summaryRevenueChart"), {
      dates: D.dates,
      series: [{ label: "Revenue", color: "--s-downsell1", values: D.summary.revenueByDay, fill: true }],
      yFormat: (v) => F.money(v, 2),
      height: 240,
    });


    // --- funnels tab ---
    const sel = document.getElementById("funnelSelect");
    D.funnels.list.forEach((f) => {
      const o = document.createElement("option");
      o.textContent = f;
      sel.appendChild(o);
    });

    // upsell-type checkboxes drive every funnels chart
    const typeState = Object.fromEntries(D.seriesDefs.map((s) => [s.id, true]));
    const typeList = document.getElementById("typeList");
    D.seriesDefs.forEach((s) => {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.addEventListener("change", () => {
        typeState[s.id] = cb.checked;
        renderFunnelCharts();
      });
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = `var(${s.cssVar})`;
      const t = document.createElement("span");
      t.textContent = s.label;
      label.append(cb, sw, t);
      typeList.appendChild(label);
    });

    const toSeries = (byType) =>
      byType
        .filter((s) => typeState[s.id])
        .map((s) => ({ label: s.label, color: s.cssVar, values: s.values, fill: s.id === "upsell1" }));

    function renderFunnelCharts() {
      renderChart(document.getElementById("funnelsRevenueChart"), {
        dates: D.dates, series: toSeries(D.funnels.revenueByType),
        yFormat: (v) => F.money(v, 2), height: 250,
      });
      renderChart(document.getElementById("rpvChart"), {
        dates: D.dates,
        series: [{ label: "Revenue per visit", color: "--s-upsell2", values: D.funnels.revenuePerVisit.byDay, fill: true }],
        yFormat: (v) => F.money(v, 2), height: 210,
      });
      renderChart(document.getElementById("impressionsChart"), {
        dates: D.dates, series: toSeries(D.funnels.impressionsByType),
        yFormat: F.int, height: 210,
      });
      renderChart(document.getElementById("conversionChart"), {
        dates: D.dates, series: toSeries(D.funnels.conversionByType),
        yFormat: (v) => v.toFixed(2) + "%", height: 210,
      });
      renderChart(document.getElementById("acceptedChart"), {
        dates: D.dates, series: toSeries(D.funnels.acceptedByType),
        yFormat: F.int, height: 210,
      });
      renderChart(document.getElementById("avgValueChart"), {
        dates: D.dates, series: toSeries(D.funnels.avgValueByType),
        yFormat: (v) => F.money(v, 2), height: 210,
      });
    }

    document.getElementById("funnelsRevenueTotal").textContent = F.money(D.funnels.revenueTotal, 2);
    document.getElementById("rpvOneClick").textContent = F.money(D.funnels.revenuePerVisit.oneClick, 2);
    document.getElementById("impressionsTotal").textContent = F.int(D.funnels.impressionsTotal);
    document.getElementById("conversionTotal").textContent = D.funnels.conversionRate + "%";
    document.getElementById("acceptedTotal").textContent = F.int(D.funnels.acceptedOffersTotal);
    document.getElementById("avgValueTotal").textContent = F.money(D.funnels.avgUpsellValue, 2);
    renderFunnelCharts();

    wireProductsTables();
  }

  /* ============================================================
     FUNNEL LIST PAGE
     ============================================================ */
  if (page === "funnel-list") {
    const L = D.funnelList;

    const tbody = document.getElementById("funnelRows");
    L.rows.forEach((r) => {
      const tr = document.createElement("tr");

      const cbTd = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cbTd.appendChild(cb);

      const pri = document.createElement("td");
      pri.textContent = r.priority;

      const name = document.createElement("td");
      name.innerHTML = `<a href="builder.html" style="font-weight:600;text-decoration:none">${r.name}</a>`;

      const rpv = document.createElement("td");
      rpv.className = "num";
      rpv.textContent = F.money(r.rpvPPU, 2);

      const rpvT = document.createElement("td");
      rpvT.className = "num";
      rpvT.textContent = r.rpvTYP == null ? "–" : F.money(r.rpvTYP, 2);

      const visits = document.createElement("td");
      visits.className = "num";
      visits.textContent = F.int(r.visits);

      const rev = document.createElement("td");
      rev.className = "num";
      rev.textContent = F.money(r.revenue, 2);

      const act = document.createElement("td");
      act.innerHTML = `
        <div class="row-actions">
          <button class="icon-btn" title="Edit" onclick="location.href='builder.html'">✎</button>
          <button class="icon-btn" title="Analytics" onclick="location.href='index.html'">📊</button>
          <label class="switch"><input type="checkbox" ${r.active ? "checked" : ""}><span class="track"></span></label>
        </div>`;

      tr.append(cbTd, pri, name, rpv, rpvT, visits, rev, act);
      tbody.appendChild(tr);
    });

    const listTabs = document.querySelectorAll(".list-tabs button");
    listTabs.forEach((t) =>
      t.addEventListener("click", () => listTabs.forEach((x) => x.setAttribute("aria-selected", x === t)))
    );
  }

  /* ============================================================
     BUILDER PAGE
     ============================================================ */
  if (page === "builder") {
    const B = D.builder;

    // fill offer cards
    document.querySelectorAll("[data-offer]").forEach((card) => {
      const o = B.offers[card.dataset.offer];
      if (!o) return;
      card.querySelector(".offer-name").textContent = o.product;
      const meta = card.querySelector(".offer-meta");
      const icons = ["◐", "🚚", "⏱", "🛒"];
      o.meta.forEach((m, i) => {
        const p = document.createElement("span");
        p.className = "meta-pill";
        p.textContent = (icons[i] || "") + " " + m;
        meta.appendChild(p);
      });
      const stats = card.querySelector(".offer-stats");
      stats.innerHTML =
        `<span>👁 <b>${F.int(o.views)}</b></span>` +
        `<span>💲 <b>${F.money(o.revenue, 2)}</b></span>` +
        `<span>🛒 <b>${F.money(o.rpv, 2)}/visit</b></span>` +
        `<span>↻ <b>${o.conversion.toFixed(2)}%</b></span>`;
    });

    // preview flow modal (deep-linkable via builder.html#preview)
    const modal = document.getElementById("previewModal");
    document.getElementById("previewFlowBtn").addEventListener("click", () => modal.classList.add("open"));
    if (location.hash === "#preview") modal.classList.add("open");
    modal.querySelectorAll("[data-close-modal]").forEach((b) =>
      b.addEventListener("click", () => modal.classList.remove("open"))
    );
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("open");
    });

    const P = B.preview;
    document.getElementById("ppOrder").textContent = "Order #" + P.orderNumber;
    document.getElementById("ppHeadline").textContent = P.headline;
    document.getElementById("ppCopy").textContent = P.copy;
    document.getElementById("ppTimer").textContent = P.timer;
    document.getElementById("ppTitle").textContent = P.product;
    document.getElementById("ppWas").textContent = F.money(P.priceWas, 2);
    document.getElementById("ppNow").textContent = F.money(P.priceNow, 2);
    document.getElementById("ppSave").textContent = `(Save ${P.savePct}%)`;
    document.getElementById("ppUrgency").textContent = P.urgency;
    document.getElementById("ppVariantLabel").textContent = P.variantLabel;
    document.getElementById("ppVariantValue").textContent = P.variantValue;
    document.getElementById("ppSubtotal").textContent = F.money(P.subtotal, 2);

    // flow-map node selection (visual only)
    const nodes = modal.querySelectorAll(".flow-node");
    nodes.forEach((n) =>
      n.addEventListener("click", () => nodes.forEach((x) => x.setAttribute("aria-current", x === n)))
    );

    // device toggle (visual only)
    const devBtns = document.querySelectorAll(".device-toggle button");
    devBtns.forEach((b) =>
      b.addEventListener("click", () => devBtns.forEach((x) => x.setAttribute("aria-pressed", x === b)))
    );
  }
  }

  // Render as soon as real data is ready; otherwise wait for data.js.
  if (window.APP_DATA && window.APP_DATA.__ready) boot();
  else window.addEventListener("ppa:data", boot, { once: true });
})();
