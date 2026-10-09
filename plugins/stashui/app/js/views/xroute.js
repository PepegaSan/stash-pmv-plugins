// A page of an extension plugin (ext.js addRoute): #/p/<pluginId>/<path>. Stash UI owns the frame – the plugin fills an element.
// Normal pages get the usual heading; an overlay page (overlay: true) is full screen, like the player.

import { esc, errorToast } from "../ui.js";
import { t } from "../i18n.js";
import { routeInfo, diagnostics } from "../ext.js";
import { closeOverlay } from "../main.js";

export async function render(host, params, query, r) {
  const rest = params.rest || "";
  const hit = routeInfo(params.plugin, rest);
  if (!hit) {
    host.innerHTML = `<div class="kb-empty"><b>${t("This page isn't there")}</b><p>${esc(t("The plugin “{id}” has no page at this address – it may be switched off or not installed any more.", { id: params.plugin }))}</p><a class="kb-btn" href="#/plugins">${t("Plugins")}</a></div>`;
    return;
  }
  const { route } = hit;
  const plug = diagnostics().find((p) => p.id === params.plugin);
  const ac = new AbortController();
  const oldTitle = document.title;
  let body;
  if (route.overlay) {
    host.classList.add("kb-xroute", "is-overlay");
    host.innerHTML = `<button type="button" class="kb-btn is-icon kb-xroute-close" data-xclose aria-label="${t("Close")}" title="${t("Close")}">×</button><div class="kb-xroute-body" data-xbody></div>`;
    host.querySelector("[data-xclose]").onclick = () => closeOverlay();
    body = host.querySelector("[data-xbody]");
  } else {
    host.classList.add("kb-xroute");
    host.innerHTML = `<header class="kb-head"><div class="kb-head-title"><h1 class="kb-h1">${esc(route.title)}</h1></div></header><div class="kb-xroute-body" data-xbody></div>`;
    body = host.querySelector("[data-xbody]");
    document.title = route.title + " – Stash";
  }
  let done = null;
  try {
    const out = await route.render(body, { params: hit.params, rest: hit.rest, query: query || {}, signal: ac.signal, path: r && r.path });
    if (typeof out === "function") done = out;
  } catch (e) {
    errorToast(e, plug ? plug.name : params.plugin);
    body.innerHTML = `<div class="kb-empty"><b>${t("That didn't work")}</b><p>${esc((e && e.message) || e)}</p></div>`;
  }
  return () => {
    document.title = oldTitle;
    ac.abort();
    try {
      done && done();
    } catch (e) { /* the plugin's own cleanup */ }
  };
}
