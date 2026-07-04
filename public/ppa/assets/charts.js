/* ============================================================
   Tiny SVG chart engine — line/area charts with a crosshair
   and an all-series tooltip. No dependencies.

   renderChart(container, {
     dates:   Date[],
     series:  [{ label, color, values: number[], fill?: bool }],
     yFormat: (v) => string,       // axis + tooltip value format
     height:  number,              // px, default 220
     legend:  bool,                // default true when >1 series
   })
   ============================================================ */

(function () {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  const cssColor = (ref) => {
    // series color may be a CSS var name ("--s-upsell1") or raw hex
    if (ref.startsWith("--")) {
      return getComputedStyle(document.documentElement).getPropertyValue(ref).trim();
    }
    return ref;
  };

  function niceTicks(max, count) {
    if (max <= 0) max = 1;
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const ticks = [];
    for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(v);
    return ticks;
  }

  window.renderChart = function renderChart(container, opts) {
    const { dates, yFormat = (v) => String(v) } = opts;
    const H = opts.height || 220;
    const W = 720; // viewBox width; scales to container via CSS
    const PAD = { top: 12, right: 12, bottom: 26, left: 64 };
    const iw = W - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;

    const series = opts.series.map((s) => ({ ...s, hex: cssColor(s.color) }));
    const visible = series.filter((s) => !s.hidden);

    const dataMax = Math.max(1, ...visible.flatMap((s) => s.values));
    const ticks = niceTicks(dataMax, 3);
    const yMax = ticks[ticks.length - 1];

    const x = (i) => PAD.left + (i / (dates.length - 1)) * iw;
    const y = (v) => PAD.top + ih - (v / yMax) * ih;

    container.classList.add("chart-wrap");
    container.textContent = "";

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

    // gridlines + y labels
    for (const t of ticks) {
      svg.appendChild(el("line", {
        x1: PAD.left, x2: W - PAD.right, y1: y(t), y2: y(t),
        stroke: t === 0 ? "var(--baseline)" : "var(--grid)", "stroke-width": 1,
      }));
      const lbl = el("text", {
        x: PAD.left - 10, y: y(t) + 4, "text-anchor": "end",
        fill: "var(--ink-muted)", "font-size": 11,
        style: "font-variant-numeric: tabular-nums",
      });
      lbl.textContent = yFormat(t);
      svg.appendChild(lbl);
    }

    // x labels (~5)
    const xStep = Math.ceil(dates.length / 5);
    for (let i = 0; i < dates.length; i += xStep) {
      const lbl = el("text", {
        x: x(i), y: H - 6, "text-anchor": i === 0 ? "start" : "middle",
        fill: "var(--ink-muted)", "font-size": 11,
      });
      lbl.textContent = dates[i].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      svg.appendChild(lbl);
    }

    // marks — 2px lines, optional soft area fill
    for (const s of visible) {
      const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
      if (s.fill) {
        const area = el("polygon", {
          points: `${PAD.left},${y(0)} ${pts} ${W - PAD.right},${y(0)}`,
          fill: s.hex, opacity: 0.14,
        });
        svg.appendChild(area);
      }
      svg.appendChild(el("polyline", {
        points: pts, fill: "none", stroke: s.hex,
        "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
      }));
    }

    // crosshair + hover dots
    const cross = el("line", {
      y1: PAD.top, y2: PAD.top + ih, stroke: "var(--baseline)",
      "stroke-width": 1, visibility: "hidden",
    });
    svg.appendChild(cross);
    const dots = visible.map((s) => {
      const d = el("circle", { r: 4, fill: s.hex, stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" });
      svg.appendChild(d);
      return d;
    });

    container.appendChild(svg);

    // tooltip (HTML, positioned over the chart)
    const tip = document.createElement("div");
    tip.className = "viz-tooltip";
    container.appendChild(tip);

    const showAt = (i, clientX) => {
      cross.setAttribute("x1", x(i));
      cross.setAttribute("x2", x(i));
      cross.setAttribute("visibility", "visible");
      visible.forEach((s, k) => {
        dots[k].setAttribute("cx", x(i));
        dots[k].setAttribute("cy", y(s.values[i]));
        dots[k].setAttribute("visibility", "visible");
      });

      tip.textContent = "";
      const dt = document.createElement("div");
      dt.className = "tt-date";
      dt.textContent = dates[i].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      tip.appendChild(dt);
      for (const s of visible) {
        const row = document.createElement("div");
        row.className = "tt-row";
        const key = document.createElement("span");
        key.className = "tt-key";
        key.style.background = s.hex;
        const name = document.createElement("span");
        name.className = "tt-name";
        name.textContent = s.label;
        const val = document.createElement("span");
        val.className = "tt-val";
        val.textContent = s.values[i] ? yFormat(s.values[i]) : "–";
        row.append(key, name, val);
        tip.appendChild(row);
      }
      tip.style.display = "block";
      const rect = container.getBoundingClientRect();
      const px = clientX - rect.left;
      const flip = px > rect.width * 0.62;
      tip.style.left = flip ? px - tip.offsetWidth - 14 + "px" : px + 14 + "px";
      tip.style.top = "18px";
    };

    const hide = () => {
      cross.setAttribute("visibility", "hidden");
      dots.forEach((d) => d.setAttribute("visibility", "hidden"));
      tip.style.display = "none";
    };

    svg.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * W;
      const frac = (sx - PAD.left) / iw;
      const i = Math.max(0, Math.min(dates.length - 1, Math.round(frac * (dates.length - 1))));
      showAt(i, e.clientX);
    });
    svg.addEventListener("pointerleave", hide);

    // legend (line keys) — only for multi-series
    const wantLegend = opts.legend ?? visible.length > 1;
    if (wantLegend) {
      const lg = document.createElement("div");
      lg.className = "legend";
      for (const s of visible) {
        const k = document.createElement("span");
        k.className = "key";
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = s.hex;
        const t = document.createElement("span");
        t.textContent = s.label;
        k.append(sw, t);
        lg.appendChild(k);
      }
      container.appendChild(lg);
    }
  };
})();
