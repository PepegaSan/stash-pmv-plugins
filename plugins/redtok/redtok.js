// RedTok: a button in classic Stash's navbar that opens the feed page.
(function () {
  "use strict";
  var PAGE = "/plugin/redtok/assets/index.html";
  var ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6zM10 8v8l6-4z"/></svg>';

  function inject() {
    if (document.querySelector(".redtok-nav-btn")) return;
    var bar = document.querySelector(".navbar-buttons");
    if (!bar) return;
    var a = document.createElement("a");
    a.className = "btn nav-link d-flex align-items-center redtok-nav-btn";
    a.href = PAGE;
    a.title = "RedTok";
    a.innerHTML = ICON + '<span class="d-none d-md-inline" style="margin-left:6px">RedTok</span>';
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
