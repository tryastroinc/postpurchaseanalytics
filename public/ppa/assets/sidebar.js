/* ============================================================
   Left sidebar navigation, shared by all pages.
   Injected from JS so the markup lives in one place; the active
   item follows <body data-page>. Load at the end of <body>.

   Concept: this board lives under the CANVAS umbrella. Canvas is
   the body (all split tests, whole funnel); post-purchase is one
   limb of it. The sidebar reflects that: a link up to Canvas, then
   this board's own pages grouped under a "Post-purchase" section.
   The Canvas link is just a URL — nothing here touches /canvas.
   ============================================================ */

(function () {
  var CANVAS_URL = "https://tryastro.org/canvas";

  var ICONS = {
    canvas:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    analytics:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    funnels:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 4h18l-7 8v6l-4 2v-8L3 4z"/></svg>',
  };

  var ITEMS = [
    { href: "funnels.html", label: "Funnels", icon: "funnels", pages: ["funnel-list", "builder"] },
    { href: "index.html", label: "Analytics", icon: "analytics", pages: ["analytics"] },
  ];

  var page = document.body.dataset.page;

  var aside = document.createElement("aside");
  aside.className = "sidenav";

  var brand = document.createElement("div");
  brand.className = "sn-brand";
  brand.innerHTML = '<span class="sn-logo">✦</span><span class="sn-name">Canvas</span>';
  aside.appendChild(brand);

  // link up to the canvas board (external for now; becomes a sibling
  // route once this app is proxied under tryastro.org/canvas/post-purchase)
  var up = document.createElement("nav");
  up.className = "sn-nav";
  var canvasLink = document.createElement("a");
  canvasLink.className = "sn-item";
  canvasLink.href = CANVAS_URL;
  canvasLink.innerHTML = ICONS.canvas + "<span>Canvas board</span><span class='sn-ext'>↗</span>";
  up.appendChild(canvasLink);
  aside.appendChild(up);

  var section = document.createElement("div");
  section.className = "sn-section";
  section.textContent = "Post-purchase";
  aside.appendChild(section);

  var nav = document.createElement("nav");
  nav.className = "sn-nav";
  ITEMS.forEach(function (it) {
    var a = document.createElement("a");
    a.className = "sn-item" + (it.pages.indexOf(page) !== -1 ? " active" : "");
    a.href = it.href;
    a.innerHTML = ICONS[it.icon] + "<span>" + it.label + "</span>";
    nav.appendChild(a);
  });
  aside.appendChild(nav);

  document.body.classList.add("with-sidebar");
  document.body.prepend(aside);
})();
