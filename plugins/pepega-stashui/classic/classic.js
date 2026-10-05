// Stash UI inside classic Stash:
// 1. Embedded in Stash UI → hide the own navigation (CSS class kb-embed).
// 2. Home page "/" → redirect to Stash UI (can be turned off; "/?classic=1" stays classic for this tab).
// 3. "Stash UI" button in the navigation (back to Stash UI).
(function () {
  "use strict";
  var APP = "/plugin/pepega-stashui/assets/index.html";
  var html = document.documentElement;
  var embedded = false;
  try {
    embedded = window.self !== window.top;
  } catch (e) {
    embedded = true;
  }
  html.classList.add("kb-classic");
  if (embedded) html.classList.add("kb-embed");

  var params = new URLSearchParams(location.search);
  try {
    if (params.get("classic") === "1") sessionStorage.setItem("stashui.classic", "1");
  } catch (e) { /* ignore */ }

  function keepClassic() {
    try {
      return localStorage.getItem("stashui.keepClassicHome") === "true" || sessionStorage.getItem("stashui.classic") === "1";
    } catch (e) {
      return false;
    }
  }

  // Jump marker: after loading, switch internally to a plugin page (e.g. /plugin/example)
  var jump = params.get("kbroute");
  if (jump && /^\/[^/]/.test(jump)) {
    var tries = 0;
    var go = function () {
      if (document.querySelector(".main") || ++tries > 60) {
        history.replaceState(null, "", jump);
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      } else setTimeout(go, 100);
    };
    setTimeout(go, 150);
  } else if (!embedded && location.pathname === "/" && !keepClassic()) {
    location.replace(APP);
    return;
  }

  // Refresh the setting in the background (for the next visit)
  fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: 'query { configuration { plugins(include: ["pepega-stashui"]) } }' }),
  })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var c = (j.data && j.data.configuration.plugins && j.data.configuration.plugins["pepega-stashui"]) || {};
      localStorage.setItem("stashui.keepClassicHome", String(!!c.keepClassicHome));
    })
    .catch(function () {});

  if (embedded) return;

  // Button back to Stash UI
  function inject() {
    if (document.querySelector(".kb-back-btn")) return;
    var bar = document.querySelector(".navbar-buttons");
    if (!bar) return;
    var a = document.createElement("a");
    a.className = "btn nav-link kb-back-btn";
    a.href = APP;
    a.title = "Back to Stash UI";
    a.innerHTML = '<span class="kb-back-dot"></span><span>Stash UI</span>';
    bar.insertBefore(a, bar.firstChild);
  }
  var queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    setTimeout(function () {
      queued = false;
      inject();
    }, 80);
  }).observe(document.body, { childList: true, subtree: true });
  inject();
})();
