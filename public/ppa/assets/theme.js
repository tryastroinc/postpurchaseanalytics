/* ============================================================
   Light/dark theme switcher — single authority for the WHOLE
   theme system.

   Architecture note: the board runs inside a same-origin iframe
   (app/page.tsx wrapper), so there are TWO documents whose
   background and color-scheme must agree at all times. If they
   drift, Chrome paints an opaque white canvas behind the iframe
   (its behavior when embedder/embedded color-schemes differ) —
   that is the "flash"/"glitch". Every apply() call therefore
   paints BOTH documents together.

   - Load this in <head> BEFORE the stylesheets: first paint is
     already in the right theme.
   - Dark is the default; persisted in localStorage("ppa-theme"),
     shared by all pages. URL override: ?theme=light|dark.
   - Any element with [data-theme-toggle] becomes a sun/moon pill.
   ============================================================ */

(function () {
  var KEY = "ppa-theme";
  var BG = { dark: "#1a1a1a", light: "#f9f9f7" };

  function paintDoc(doc, t) {
    if (!doc) return;
    doc.documentElement.dataset.theme = t;
    doc.documentElement.style.background = BG[t];
    doc.documentElement.style.colorScheme = t;
    if (doc.body) doc.body.style.background = BG[t];
  }

  function apply(t) {
    paintDoc(document, t);
    // keep the embedding wrapper in lockstep (same-origin iframe)
    if (window.parent && window.parent !== window) {
      try { paintDoc(window.parent.document, t); } catch (e) { /* cross-origin: skip */ }
    }
  }

  // precedence: ?theme=light|dark (also persists) → saved choice → dark
  var fromUrl = new URLSearchParams(location.search).get("theme");
  if (fromUrl !== "light" && fromUrl !== "dark") fromUrl = null;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode etc. */ }
  var theme = fromUrl || (saved === "light" || saved === "dark" ? saved : "dark");
  if (fromUrl) { try { localStorage.setItem(KEY, fromUrl); } catch (e) {} }
  apply(theme);

  var SUN =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none"/>' +
    '<path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/>' +
    "</svg>";
  var MOON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6 8.6 8.6 0 1 0 20.4 14.2z"/>' +
    "</svg>";

  function paintButtons() {
    var dark = document.documentElement.dataset.theme === "dark";
    document.querySelectorAll("[data-theme-toggle] button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === (dark ? "dark" : "light")));
    });
  }

  window.setPpaTheme = function (t) {
    if (t !== "light" && t !== "dark") return;
    apply(t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    paintButtons();
  };

  // body isn't parsed yet when this runs from <head>; paint it as soon
  // as it exists so no element ever shows the browser-default background
  document.addEventListener("DOMContentLoaded", function () {
    paintDoc(document, document.documentElement.dataset.theme);

    document.querySelectorAll("[data-theme-toggle]").forEach(function (wrap) {
      wrap.innerHTML =
        '<button type="button" data-mode="light" title="Light mode" aria-label="Light mode">' + SUN + "</button>" +
        '<button type="button" data-mode="dark" title="Dark mode" aria-label="Dark mode">' + MOON + "</button>";
      wrap.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          window.setPpaTheme(b.dataset.mode);
        });
      });
    });
    paintButtons();
  });
})();
