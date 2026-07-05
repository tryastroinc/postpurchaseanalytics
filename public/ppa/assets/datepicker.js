/* ============================================================
   Shopify-style date-range picker.
   Replaces the old preset-list popover: preset rail on the left,
   dual-month calendar with range selection, Cancel / Apply.

   Renders into #datePopover, anchored to #dateRangeBtn.

   Persistence contract (read by assets/data.js on reload):
     sessionStorage.ppaRange       — "7|30|60|90|365" (preset days)
     sessionStorage.ppaRangeCustom — "YYYY-MM-DD,YYYY-MM-DD" for
                                     custom / Today / Yesterday picks
                                     (sent as &start=&end= — backend
                                     support is an INTEGRATION POINT)
     sessionStorage.ppaRangeLabel  — header button label
   ============================================================ */

(function () {
  var pop = document.getElementById("datePopover");
  var btn = document.getElementById("dateRangeBtn");
  if (!pop || !btn) return;

  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DOW = ["S","M","T","W","T","F","S"];
  var API_PRESETS = { "Last 7 days": 7, "Last 30 days": 30, "Last 60 days": 60, "Last 90 days": 90, "Last 365 days": 365 };

  function today() { var d = new Date(); d.setHours(0,0,0,0); return d; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  function fromIso(s) { var p = s.split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }
  function sameDay(a, b) { return a && b && a.getTime() === b.getTime(); }
  function fmtShort(d) {
    return MONTHS[d.getMonth()].slice(0,3) + " " + d.getDate() + ", " + d.getFullYear();
  }

  var PRESETS = [
    { label: "Today",         range: function () { return [today(), today()]; } },
    { label: "Yesterday",     range: function () { return [addDays(today(),-1), addDays(today(),-1)]; } },
    { label: "Last 7 days",   range: function () { return [addDays(today(),-6), today()]; } },
    { label: "Last 30 days",  range: function () { return [addDays(today(),-29), today()]; } },
    { label: "Last 60 days",  range: function () { return [addDays(today(),-59), today()]; } },
    { label: "Last 90 days",  range: function () { return [addDays(today(),-89), today()]; } },
    { label: "Last 365 days", range: function () { return [addDays(today(),-364), today()]; } },
  ];

  // ---- state ----
  var savedLabel = null, savedCustom = null, savedDays = null;
  try {
    savedLabel = sessionStorage.getItem("ppaRangeLabel");
    savedCustom = sessionStorage.getItem("ppaRangeCustom");
    savedDays = sessionStorage.getItem("ppaRange");
  } catch (e) {}

  var start, end, activePreset;
  if (savedCustom) {
    var parts = savedCustom.split(",");
    start = fromIso(parts[0]); end = fromIso(parts[1]);
    activePreset = savedLabel;
  } else {
    var days = parseInt(savedDays || "30", 10) || 30;
    end = today(); start = addDays(end, -(days - 1));
    activePreset = savedLabel || "Last " + days + " days";
  }
  var view = new Date(start.getFullYear(), start.getMonth(), 1); // left month

  // restore header label
  var labelEl = document.getElementById("dateRangeLabel");
  if (labelEl && savedLabel) labelEl.textContent = savedLabel;

  // ---- render ----
  function render() {
    pop.textContent = "";
    pop.classList.add("dp");

    var wrap = document.createElement("div");
    wrap.className = "dp-wrap";

    // preset rail
    var rail = document.createElement("div");
    rail.className = "dp-presets";
    PRESETS.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dp-preset" + (p.label === activePreset ? " active" : "");
      b.textContent = p.label;
      b.addEventListener("click", function () {
        var r = p.range();
        start = r[0]; end = r[1];
        activePreset = p.label;
        view = new Date(start.getFullYear(), start.getMonth(), 1);
        render();
      });
      rail.appendChild(b);
    });
    wrap.appendChild(rail);

    // calendars
    var cals = document.createElement("div");
    cals.className = "dp-cals";
    cals.appendChild(calendar(view, true));
    cals.appendChild(calendar(new Date(view.getFullYear(), view.getMonth()+1, 1), false));
    wrap.appendChild(cals);
    pop.appendChild(wrap);

    // footer: inputs + actions
    var foot = document.createElement("div");
    foot.className = "dp-foot";
    var ins = document.createElement("div");
    ins.className = "dp-inputs";
    var i1 = document.createElement("input");
    i1.readOnly = true; i1.value = iso(start);
    var arrow = document.createElement("span");
    arrow.className = "muted"; arrow.textContent = "→";
    var i2 = document.createElement("input");
    i2.readOnly = true; i2.value = iso(end);
    ins.append(i1, arrow, i2);

    var acts = document.createElement("div");
    acts.className = "dp-actions";
    var cancel = document.createElement("button");
    cancel.className = "btn"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", close);
    var apply = document.createElement("button");
    apply.className = "btn primary"; apply.textContent = "Apply";
    apply.addEventListener("click", applyRange);
    acts.append(cancel, apply);

    foot.append(ins, acts);
    pop.appendChild(foot);
  }

  function calendar(month, isLeft) {
    var cal = document.createElement("div");
    cal.className = "dp-cal";

    var head = document.createElement("div");
    head.className = "dp-cal-head";
    var prev = document.createElement("button");
    prev.type = "button"; prev.className = "dp-nav"; prev.textContent = "‹";
    prev.style.visibility = isLeft ? "visible" : "hidden";
    prev.addEventListener("click", function () {
      view = new Date(view.getFullYear(), view.getMonth()-1, 1); render();
    });
    var title = document.createElement("b");
    title.textContent = MONTHS[month.getMonth()] + " " + month.getFullYear();
    var next = document.createElement("button");
    next.type = "button"; next.className = "dp-nav"; next.textContent = "›";
    next.style.visibility = isLeft ? "hidden" : "visible";
    next.addEventListener("click", function () {
      view = new Date(view.getFullYear(), view.getMonth()+1, 1); render();
    });
    head.append(prev, title, next);
    cal.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "dp-grid";
    DOW.forEach(function (d) {
      var c = document.createElement("span");
      c.className = "dp-dow"; c.textContent = d;
      grid.appendChild(c);
    });

    var first = new Date(month.getFullYear(), month.getMonth(), 1);
    var gridStart = addDays(first, -first.getDay());
    for (var i = 0; i < 42; i++) {
      (function (day) {
        var c = document.createElement("button");
        c.type = "button";
        c.className = "dp-day";
        c.textContent = day.getDate();
        if (day.getMonth() !== month.getMonth()) c.classList.add("out");
        if (sameDay(day, today())) c.classList.add("today");
        if (start && end && day > start && day < end) c.classList.add("mid");
        if (sameDay(day, start)) c.classList.add("edge", "range-start");
        if (sameDay(day, end)) c.classList.add("edge", "range-end");
        c.addEventListener("click", function () {
          if (!start || (start && end && !sameDay(start, end))) {
            start = day; end = day;              // begin a fresh pick
          } else if (day < start) {
            start = day;                          // extend backwards
          } else {
            end = day;                            // complete the range
          }
          activePreset = null;                    // custom selection
          render();
        });
        grid.appendChild(c);
      })(addDays(gridStart, i));
    }
    cal.appendChild(grid);
    return cal;
  }

  // ---- apply / persistence ----
  function applyRange() {
    var label = activePreset || fmtShort(start) + " – " + fmtShort(end);
    try {
      sessionStorage.setItem("ppaRangeLabel", label);
      if (activePreset && API_PRESETS[activePreset]) {
        sessionStorage.setItem("ppaRange", String(API_PRESETS[activePreset]));
        sessionStorage.removeItem("ppaRangeCustom");
      } else {
        // custom / Today / Yesterday → exact dates; data.js forwards them
        // as &start=&end= (backend support = INTEGRATION POINT)
        sessionStorage.setItem("ppaRangeCustom", iso(start) + "," + iso(end));
        var span = Math.round((end - start) / 864e5) + 1;
        var fallback = [7, 30, 60, 90, 365].find(function (n) { return span <= n; }) || 365;
        sessionStorage.setItem("ppaRange", String(fallback));
      }
    } catch (e) {}
    if (labelEl) labelEl.textContent = label;
    close();
    location.reload(); // data.js refetches /api/analytics for the new window
  }

  // ---- open / close ----
  function close() { pop.classList.remove("open"); }
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    pop.classList.toggle("open");
    if (pop.classList.contains("open")) render();
  });
  pop.addEventListener("click", function (e) { e.stopPropagation(); });
  document.addEventListener("click", close);

  // QA hook: ?dp=open renders the picker expanded on load
  if (new URLSearchParams(location.search).get("dp") === "open") {
    pop.classList.add("open");
    render();
  }
})();
