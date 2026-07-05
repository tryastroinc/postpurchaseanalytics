/* ============================================================
   Light/dark theme switcher.
   - Load this in <head> (before body paints) so there's no flash.
   - Dark is the default (matches the TryAstro canvas); the choice
     persists in localStorage under "ppa-theme" and is shared by
     all pages (index / funnels / builder).
   - Any element with [data-theme-toggle] becomes a sun/moon
     segmented pill (see .theme-switch in styles.css).
   - URL override: ?theme=light|dark (also persists).
   ============================================================ */

(function () {
  var KEY = "ppa-theme";

  // precedence: ?theme=light|dark (also persists) → saved choice → dark
  var fromUrl = new URLSearchParams(location.search).get("theme");
  if (fromUrl !== "light" && fromUrl !== "dark") fromUrl = null;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode etc. */ }
  var theme = fromUrl || (saved === "light" || saved === "dark" ? saved : "dark");
  if (fromUrl) { try { localStorage.setItem(KEY, fromUrl); } catch (e) {} }
  document.documentElement.dataset.theme = theme;
  // paint the root immediately so navigation never flashes the wrong
  // theme while stylesheets load (this script runs before the CSS links)
  document.documentElement.style.background = theme === "dark" ? "#1a1a1a" : "#f9f9f7";

  var SUN =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none"/>' +
    '<path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/>' +
    "</svg>";
  var MOON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6 8.6 8.6 0 1 0 20.4 14.2z"/>' +
    "</svg>";

  function paint() {
    var dark = document.documentElement.dataset.theme === "dark";
    document.querySelectorAll("[data-theme-toggle] button").forEach(function (b) {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.mode === (dark ? "dark" : "light"))
      );
    });
  }

  window.setPpaTheme = function (t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(KEY, t); } catch (e) {}
    paint();
  };

  document.addEventListener("DOMContentLoaded", function () {
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
    paint();
  });
})();
