// PMV Generator: a "PMV" button in the Stash navbar that opens the generator page.
(function () {
  "use strict";
  var PAGE = "/plugin/pmvGenerator/assets/index.html";
  var ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

  function inject() {
    if (document.querySelector(".pmvg-nav-btn")) return;
    var bar = document.querySelector(".navbar-buttons");
    if (!bar) return;
    var a = document.createElement("a");
    a.className = "btn nav-link d-flex align-items-center pmvg-nav-btn";
    a.href = PAGE;
    a.title = "PMV Generator";
    a.innerHTML = ICON + '<span class="d-none d-md-inline">PMV</span>';
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
