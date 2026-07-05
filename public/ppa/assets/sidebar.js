/* ============================================================
   Left sidebar navigation, shared by all pages.
   Injected from JS so the markup lives in one place; the active
   item follows <body data-page>. Load at the end of <body>.
   ============================================================ */

(function () {
  var ICONS = {
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
  brand.innerHTML =
    '<span class="sn-logo">✦</span><span class="sn-name">Post-purchase</span>';
  aside.appendChild(brand);

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
