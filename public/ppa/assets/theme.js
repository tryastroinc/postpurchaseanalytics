/* ============================================================
   Light/dark theme switcher.
   - Load this in <head> (before body paints) so there's no flash.
   - Dark is the default (matches the TryAstro canvas); the choice
     persists in localStorage under "ppa-theme" and is shared by
     all pages (index / funnels / builder).
   - Any element with [data-theme-toggle] becomes a toggle button.
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

  function paintButtons() {
    var dark = document.documentElement.dataset.theme === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.textContent = dark ? "☀ Light" : "🌙 Dark";
      btn.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.setAttribute("aria-label", btn.getAttribute("title"));
    });
  }

  window.setPpaTheme = function (t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(KEY, t); } catch (e) {}
    paintButtons();
  };

  document.addEventListener("DOMContentLoaded", function () {
    paintButtons();
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.setPpaTheme(
          document.documentElement.dataset.theme === "dark" ? "light" : "dark"
        );
      });
    });
  });
})();
