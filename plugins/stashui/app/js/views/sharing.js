// Sharing: give people a link, they send you photos, videos and messages – and you do the same with theirs.
// Four tabs: Inbox (what arrived – accept or reject), My link (your name, links, what you like), Send (saved links of
// others + choose from your library), Chat. The receiver is sharing.py on your PC (see shareconn.js); nothing goes
// through a server of ours, and nothing lands in your library before you accept it.

import { esc, icon, toast, errorToast, store, fmtBytes, confirmDialog, promptDialog, menu } from "../ui.js";
import { openPhotoCutter } from "../perfcut.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { runBackend } from "../interactive.js";
import * as C from "../shareconn.js";
import { tagsCache } from "./tagpicker.js";
import { mountSend } from "./sharesend.js";
import { mountChat } from "./sharechat.js";
import { mountGuide } from "./shareguide.js";

const TABS = ["inbox", "link", "send", "chat", "guide"];
const LABEL = { inbox: "Inbox", link: "My link", send: "Send", chat: "Chat", guide: "Guide" };
const timeText = (sec) => new Date(sec * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const avatarHtml = (a, name, cls = "") =>
  a ? `<img class="kb-share-av ${cls}" alt="" src="${esc(C.safeAvatar(a))}">` : `<span class="kb-share-av ${cls}" aria-hidden="true">${esc((String(name || "?").trim()[0] || "?").toUpperCase())}</span>`;

export async function render(main, params) {
  let tab = params && TABS.includes(params.tab) ? params.tab : TABS.includes(store.get("shareTab", "")) ? store.get("shareTab") : "inbox";
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Sharing")}</h1>
        <p class="kb-sub">${t("Give people a link – they send you photos and videos you like. Use their links to send yours. Nothing reaches your library before you accept it.")}</p>
      </div>
    </header>
    <div class="kb-seg kb-share-tabs" data-tabs>${TABS.map((k) => `<button type="button" data-tab="${k}">${t(LABEL[k])}<b class="kb-share-n" data-n="${k}"></b></button>`).join("")}</div>
    <div class="kb-share" data-pane></div>`;
  const paneEl = main.querySelector("[data-pane]");
  let alive = true;
  let timer = 0;
  let st = null; // backend status: { running, roots, publicPort, lan, … }
  let s = null; // the receiver's state: { config, inbox, messages, … } (only while it runs)
  let pane = null;
  let failed = "";

  const ctx = {
    get st() { return st; },
    get s() { return s; },
    get running() { return !!(st && st.running && s); },
    go: (k, arg) => ((ctx.arg = arg), show(k)),
    arg: null,
    refresh: async () => { await poll(true); },
    async start() {
      try {
        st = await C.status(true);
        await poll(true);
        toast(t("Sharing started"), "ok");
      } catch (e) {
        errorToast(e, "Sharing");
      }
    },
    async save(patch) {
      const r = await C.adm("/admin/config", patch);
      if (s) s.config = r.config;
      return r.config;
    },
  };

  function badges() {
    const inbox = s ? s.inbox.length : 0;
    const unread = s ? s.unread : 0;
    main.querySelector('[data-n="inbox"]').textContent = inbox ? String(inbox) : "";
    main.querySelector('[data-n="chat"]').textContent = unread ? String(unread) : "";
    C.setBadge(inbox + unread);
  }

  function show(k) {
    tab = k;
    store.set("shareTab", k);
    main.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === k));
    if (pane && pane.destroy) pane.destroy();
    paneEl.innerHTML = "";
    const mk = { inbox: mountInbox, link: mountLink, send: mountSend, chat: mountChat, guide: mountGuide }[k];
    pane = mk(paneEl, ctx);
    pane.update && pane.update();
  }

  async function poll(now) {
    clearTimeout(timer);
    if (!alive) return;
    try {
      if (!st) st = await C.status(false);
      if (st.running) {
        const before = JSON.stringify([s && s.inbox, s && s.messages, s && s.config]);
        s = await C.adm("/admin/state");
        failed = "";
        badges();
        if (now || before !== JSON.stringify([s.inbox, s.messages, s.config])) pane && pane.update && pane.update();
      } else {
        s = null;
        if (now) pane && pane.update && pane.update();
      }
    } catch (e) {
      // the receiver stopped (or can't be reached from this page): ask the backend again next time
      st = null;
      s = null;
      failed = e.message;
      pane && pane.update && pane.update();
    }
    timer = setTimeout(poll, 3000);
  }

  main.querySelector("[data-tabs]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) show(b.dataset.tab);
  });

  try {
    st = await C.status(false);
    if (st.running) s = await C.adm("/admin/state");
  } catch (e) {
    failed = e.message;
  }
  badges();
  show(tab);
  timer = setTimeout(poll, 3000);
  return () => {
    alive = false;
    clearTimeout(timer);
    if (pane && pane.destroy) pane.destroy();
  };
}

// ---------- not running yet ----------
export function startCard(ctx, what) {
  return `<section class="kb-share-card">
    <h2>${t("Start sharing")}</h2>
    <p class="kb-hint">${what}</p>
    <p class="kb-hint">${t("It opens a small receiver on this PC. It only answers requests that carry one of your sharing links, and files only go to an inbox. Windows may ask once whether Python may use the network – allow it for private networks.")}</p>
    <div class="kb-phone-acts"><button type="button" class="kb-btn is-primary" data-start>${icon("share")}${t("Start now")}</button></div>
  </section>`;
}
function wireStart(host, ctx) {
  const b = host.querySelector("[data-start]");
  if (b) b.onclick = async () => ((b.disabled = true), await ctx.start(), (b.disabled = false));
}

// ---------- Inbox ----------
function mountInbox(host, ctx) {
  let showAll = false;
  let sig = "";
  const folder = () => Object.assign({ root: "", name: "Shared" }, store.get("shareFolder", {}));
  const sel = new Set();
  const clear = new Set(); // cards whose picture was uncovered
  const blur = () => store.get("shareBlur", true);

  async function accept(ids) {
    if (!ids.length) return;
    const f = folder();
    const roots = (ctx.st && ctx.st.roots) || [];
    try {
      const r = await runBackend({ mode: "share_accept", ids, root: f.root || roots[0] || "", name: f.name || "Shared" });
      ids.forEach((i) => sel.delete(i));
      if (r.moved && store.get("shareScan", true)) {
        try {
          await gql(`mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }`, { i: { paths: r.dirs && r.dirs.length ? r.dirs : [r.folder] } });
        } catch (e) { /* the scan is an extra */ }
      }
      toast(r.failed ? t("{n} accepted, {m} failed", { n: r.moved, m: r.failed }) : t("{n} accepted – saved in {folder}", { n: r.moved, folder: r.folder }), r.failed ? "err" : "ok");
    } catch (e) {
      errorToast(e, "Sharing");
    }
    await ctx.refresh();
  }
  async function reject(ids) {
    if (!ids.length) return;
    if (ids.length > 1 && !(await confirmDialog({ title: t("Reject files"), text: t("Delete {n} files that were sent to you?", { n: ids.length }), ok: t("Reject"), danger: true }))) return;
    try {
      await C.adm("/admin/inbox", { action: "reject", ids });
      ids.forEach((i) => sel.delete(i));
    } catch (e) {
      errorToast(e, "Sharing");
    }
    await ctx.refresh();
  }

  function paint() {
    if (!ctx.running) {
      host.innerHTML = startCard(ctx, t("Start it to receive files and messages. You don't need it just to send files to others."));
      wireStart(host, ctx);
      sig = "";
      return;
    }
    const items = ctx.s.inbox.slice().sort((a, b) => b.at - a.at);
    const f = folder();
    const roots = ctx.st.roots || [];
    const shown = showAll ? items : items.slice(0, 60);
    host.innerHTML = `
      <section class="kb-share-card">
        <div class="kb-share-bar">
          <h2>${t("Inbox")} <small>${items.length ? `· ${items.length} · ${fmtBytes(ctx.s.used)}` : ""}</small></h2>
          <label class="kb-check"><input type="checkbox" data-blur${blur() ? " checked" : ""}> ${t("Blur previews")}</label>
        </div>
        ${items.length ? "" : `<p class="kb-hint">${ctx.s.config.receiving ? t("Nothing waiting. Files that people send you appear here, and you decide what to keep.") : t("Receiving is switched off – nobody can send you anything right now.")}</p>`}
        ${items.length ? `<div class="kb-share-acts">
          <button type="button" class="kb-btn" data-all>${t("Select all")}</button>
          <button type="button" class="kb-btn is-primary" data-accept${sel.size ? "" : " disabled"}>${t("Accept selected")}${sel.size ? ` (${sel.size})` : ""}</button>
          <button type="button" class="kb-btn is-ghost kb-pdanger" data-reject${sel.size ? "" : " disabled"}>${t("Reject selected")}</button>
        </div>
        <p class="kb-hint">${t("Accepted files are saved in")} <b>${esc((f.root || roots[0] || "") + " / " + (f.name || "Shared"))}</b> <button type="button" class="kb-chip" data-where>${t("Change")}</button>
          <label class="kb-check"><input type="checkbox" data-scan${store.get("shareScan", true) ? " checked" : ""}> ${t("Scan the folder after accepting")}</label></p>` : ""}
        <div class="kb-share-grid">${shown.map(card).join("")}</div>
        ${items.length > shown.length ? `<div class="kb-phone-acts"><button type="button" class="kb-btn" data-more>${t("Show all")} (${items.length})</button></div>` : ""}
      </section>`;
    sig = JSON.stringify(ctx.s.inbox.map((x) => x.id));
    wire();
  }

  function card(x) {
    const src = C.fileUrl(x.id);
    const media = x.kind === "video" ? `<video src="${esc(src)}#t=0.1" muted loop playsinline preload="metadata"></video>` : `<img src="${esc(src)}" alt="" loading="lazy">`;
    const cov = blur() && !clear.has(x.id);
    return `<article class="kb-share-item${sel.has(x.id) ? " is-sel" : ""}${cov ? " is-blur" : ""}" data-id="${esc(x.id)}">
      <label class="kb-share-pick"><input type="checkbox" data-sel${sel.has(x.id) ? " checked" : ""} aria-label="${esc(t("Select"))}"></label>
      <div class="kb-share-media" data-media>${media}</div>
      <div class="kb-share-info">
        <b title="${esc(x.name)}">${esc(x.name)}</b>
        <small>${esc(x.from)} · ${fmtBytes(x.size)} · ${esc(timeText(x.at))}</small>
        ${(x.tags || []).length ? `<div class="kb-chips">${x.tags.slice(0, 8).map((g) => `<span class="kb-chip">${esc(g)}</span>`).join("")}</div>` : ""}
        <div class="kb-share-row">
          <button type="button" class="kb-btn is-primary" data-one="accept">${t("Accept")}</button>
          <button type="button" class="kb-btn" data-one="reject">${t("Reject")}</button>
          <button type="button" class="kb-btn is-ghost" data-one="block" title="${esc(t("Reject everything of this sender and block them"))}">${t("Block")}</button>
          ${x.reply && C.parseLink(x.reply) ? `<button type="button" class="kb-btn is-ghost" data-one="chat">${t("Chat")}</button>` : ""}
        </div>
      </div>
    </article>`;
  }

  function wire() {
    const q = (s) => host.querySelector(s);
    const all = ctx.s.inbox.map((x) => x.id);
    const b = q("[data-blur]");
    if (b) b.onchange = (e) => (store.set("shareBlur", e.target.checked), clear.clear(), paint());
    const a = q("[data-all]");
    if (a) a.onclick = () => ((sel.size === all.length ? sel.clear() : all.forEach((i) => sel.add(i))), paint());
    const ac = q("[data-accept]");
    if (ac) ac.onclick = () => accept([...sel]);
    const rj = q("[data-reject]");
    if (rj) rj.onclick = () => reject([...sel]);
    const more = q("[data-more]");
    if (more) more.onclick = () => ((showAll = true), paint());
    const sc = q("[data-scan]");
    if (sc) sc.onchange = (e) => store.set("shareScan", e.target.checked);
    const wh = q("[data-where]");
    if (wh) wh.onclick = () => chooseFolder(ctx, paint);
    host.querySelectorAll(".kb-share-item").forEach((el) => {
      const id = el.dataset.id;
      const x = ctx.s.inbox.find((i) => i.id === id);
      const v = el.querySelector("video");
      if (v) {
        el.addEventListener("mouseenter", () => !el.classList.contains("is-blur") && v.play().catch(() => {}));
        el.addEventListener("mouseleave", () => v.pause());
      }
      el.querySelector("[data-sel]").onchange = (e) => {
        e.target.checked ? sel.add(id) : sel.delete(id);
        el.classList.toggle("is-sel", e.target.checked);
        const n = sel.size;
        const ac2 = q("[data-accept]");
        const rj2 = q("[data-reject]");
        if (ac2) (ac2.disabled = !n), (ac2.textContent = t("Accept selected") + (n ? ` (${n})` : ""));
        if (rj2) rj2.disabled = !n;
      };
      el.querySelector("[data-media]").onclick = () => {
        if (!blur()) return;
        clear.has(id) ? clear.delete(id) : clear.add(id);
        el.classList.toggle("is-blur", !clear.has(id));
      };
      el.querySelectorAll("[data-one]").forEach((btn) => {
        btn.onclick = async () => {
          const k = btn.dataset.one;
          if (k === "accept") return accept([id]);
          if (k === "reject") return reject([id]);
          if (k === "chat") {
            const c = C.addContact({ url: x.reply, name: x.from });
            return ctx.go("chat", c.url);
          }
          if (k === "block") {
            if (!(await confirmDialog({ title: t("Block sender"), text: t("Block {name} and delete everything they sent that is still in your inbox?", { name: x.from }), ok: t("Block"), danger: true }))) return;
            try {
              await C.adm("/admin/block", { action: "block", id });
              toast(t("Blocked"), "ok");
            } catch (e) {
              errorToast(e, "Sharing");
            }
            await ctx.refresh();
          }
        };
      });
    });
  }

  return {
    update() {
      // not while someone is just selecting: the list is only redrawn when the files in it changed
      if (ctx.running && sig === JSON.stringify(ctx.s.inbox.map((x) => x.id)) && host.firstChild) return;
      paint();
    },
    destroy() {},
  };
}

async function chooseFolder(ctx, then) {
  const f = Object.assign({ root: "", name: "Shared" }, store.get("shareFolder", {}));
  const roots = ctx.st.roots || [];
  const name = await promptDialog({ title: t("Where accepted files go"), label: roots.length > 1 ? t("Subfolder of {root}", { root: f.root || roots[0] }) : t("Subfolder of {root}", { root: roots[0] || "" }), value: f.name || "Shared", ok: t("Save") });
  if (name == null) return;
  let root = f.root || roots[0] || "";
  if (roots.length > 1) {
    const pick = await promptDialog({ title: t("Library folder"), label: roots.join("\n"), value: root, ok: t("Save") });
    if (pick && roots.includes(pick)) root = pick;
  }
  store.set("shareFolder", { root, name: name.trim() || "Shared" });
  then();
}

// ---------- My link ----------
function tagEditor(host, list, onChange, listId) {
  let tags = list.slice();
  const draw = () => {
    host.innerHTML = `<div class="kb-chips">${tags.map((g, i) => `<span class="kb-chip is-on">${esc(g)}<button type="button" data-rm="${i}" aria-label="${esc(t("Remove"))}">×</button></span>`).join("")}</div>
      <input class="kb-field" list="${listId}" data-in placeholder="${esc(t("Type a tag and press Enter"))}" maxlength="60" autocomplete="off" spellcheck="false">`;
    const inp = host.querySelector("[data-in]");
    const add = () => {
      const v = inp.value.replace(/,/g, " ").replace(/\s+/g, " ").trim();
      if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase()) && tags.length < 40) {
        tags.push(v);
        onChange(tags.slice());
        draw();
        host.querySelector("[data-in]").focus();
      } else inp.value = "";
    };
    inp.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === ",") (e.preventDefault(), add());
    };
    inp.onchange = add;
    host.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => (tags.splice(Number(b.dataset.rm), 1), onChange(tags.slice()), draw())));
  };
  draw();
}

function mountLink(host, ctx) {
  let built = false;
  let netState = { running: false, providers: {} };
  let netBusy = false;
  let netLoaded = false;
  let netErr = ""; // the last message of Tailscale / cloudflared (a link in it, e.g. to allow Funnel, is clickable)
  const linkify = (s) => esc(s).replace(/https:\/\/(?:login\.)?tailscale\.com[^\s<)]*/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

  // Internet access: one button (backend share_net starts Tailscale Funnel or a Cloudflare quick tunnel that is already installed)
  async function loadNet() {
    try {
      netState = await runBackend({ mode: "share_net", action: "status" });
    } catch (e) {
      netState = { running: false, providers: {}, error: e.message };
    }
    paintNet();
  }
  async function netAct(action) {
    if (netBusy) return;
    if (action === "start" && !(await confirmDialog({ title: t("Make reachable from the internet"), text: t("This makes your receiver reachable from the internet. Only people with a valid link can send you anything, and you can switch it off here at any time."), ok: t("Make reachable") }))) return;
    if (action === "install" && !(await confirmDialog({ title: t("Install cloudflared"), text: t("Install cloudflared (Cloudflare's tunnel program) with Windows' package manager (winget)? Windows may ask for permission, and it can take a minute."), ok: t("Install") }))) return;
    netBusy = true;
    netErr = "";
    paintNet();
    try {
      const prev = netState.url;
      netState = await runBackend({ mode: "share_net", action });
      if (action === "start" && netState.url) await ctx.save({ baseUrl: netState.url });
      if (action === "stop" && prev && ctx.s.config.baseUrl === prev) await ctx.save({ baseUrl: "" });
      toast(action === "start" ? t("Internet access is on") : action === "install" ? t("cloudflared is installed") : t("Internet access is off"), "ok");
    } catch (e) {
      errorToast(e, t("Internet access"));
      netErr = e.message;
      try {
        netState = await runBackend({ mode: "share_net", action: "status" });
      } catch (e2) { /* keep the old state */ }
    }
    netBusy = false;
    paint();
  }
  function paintNet() {
    const box = host.querySelector("[data-net]");
    if (!box) return;
    const p = netState.providers || {};
    const name = netState.provider === "tailscale" ? "Tailscale" : "Cloudflare";
    if (netBusy) box.innerHTML = `<p class="kb-hint">${t("Working …")}</p>`;
    else if (netState.running)
      box.innerHTML = `<p><b class="kb-share-on">${t("Reachable from the internet")}</b> · ${t("via {name}", { name })}</p>
        <div class="kb-phone-url"><code>${esc(netState.url)}</code></div>
        ${netState.provider === "cloudflared" ? `<p class="kb-hint kb-share-warn">${t("This address changes every time it is started, so permanent links stop working after a restart.")}</p>` : ""}
        <div class="kb-phone-acts"><button type="button" class="kb-btn is-ghost kb-pdanger" data-netoff>${icon("stop")}${t("Switch internet access off")}</button></div>`;
    else if (p.tailscale || p.cloudflared)
      box.innerHTML = `<div class="kb-phone-acts"><button type="button" class="kb-btn is-primary" data-neton>${icon("share")}${t("Make reachable from the internet")}</button>
        ${!p.cloudflared && netState.canInstall ? `<button type="button" class="kb-btn" data-netinstall>${t("Install cloudflared")}</button>` : ""}</div>
        <p class="kb-hint">${p.tailscale ? t("Uses Tailscale Funnel (a fixed address).") : t("Uses a Cloudflare quick tunnel (a new address every time).")}${netState.error ? " " + esc(netState.error) : ""}</p>
        ${netErr ? `<p class="kb-hint kb-share-warn">${linkify(netErr)}</p>` : ""}
        <p class="kb-hint"><button type="button" class="kb-chip" data-toguide>${t("Open the guide")}</button></p>`;
    else
      box.innerHTML = `<p class="kb-hint">${t("To make your links work from outside, install Tailscale (free) or cloudflared on this PC – then one click here does the rest.")} <a href="https://tailscale.com/download" target="_blank" rel="noopener">${t("Get Tailscale")}</a></p>
        ${netState.canInstall ? `<div class="kb-phone-acts"><button type="button" class="kb-btn is-primary" data-netinstall>${t("Install cloudflared")}</button></div>` : ""}
        ${netErr ? `<p class="kb-hint kb-share-warn">${linkify(netErr)}</p>` : ""}
        <p class="kb-hint"><button type="button" class="kb-chip" data-toguide>${t("Open the guide")}</button></p>`;
    const on = box.querySelector("[data-neton]");
    if (on) on.onclick = () => netAct("start");
    const inst = box.querySelector("[data-netinstall]");
    if (inst) inst.onclick = () => netAct("install");
    const gd = box.querySelector("[data-toguide]");
    if (gd) gd.onclick = () => ctx.go("guide");
    const off = box.querySelector("[data-netoff]");
    if (off) off.onclick = () => netAct("stop");
  }
  const base = () => (ctx.s.config.baseUrl || (ctx.st.lan && ctx.st.lan[0]) || `http://127.0.0.1:${ctx.st.publicPort}`).replace(/\/$/, "");
  const linkUrl = (l) => `${base()}/s/${l.token}`;
  const linkState = (l) => (!l.enabled ? "paused" : l.expires && l.expires < Date.now() / 1000 ? "expired" : "ok");
  const left = (l) => {
    if (!l.expires) return t("permanent");
    const h = Math.max(0, (l.expires - Date.now() / 1000) / 3600);
    return h >= 48 ? t("{n} days left", { n: Math.round(h / 24) }) : h >= 1 ? t("{n} h left", { n: Math.round(h) }) : t("less than an hour left");
  };
  const save = async (patch) => {
    try {
      await ctx.save(patch);
    } catch (e) {
      errorToast(e, "Sharing");
    }
  };
  // The link others can answer to (used in what you send): the first permanent one that is switched on
  function syncReply() {
    const l = ctx.s.config.links.find((x) => !x.expires && x.enabled);
    C.setMyReply(l ? linkUrl(l) : "");
  }

  function paint() {
    const c = ctx.s.config;
    syncReply();
    const me = C.me();
    host.innerHTML = `
      <section class="kb-share-card">
        <h2>${t("Receiving")}</h2>
        <label class="kb-switch"><input type="checkbox" data-recv${c.receiving ? " checked" : ""}><i></i><span>${c.receiving ? t("On – people with a link can send you things") : t("Off – every link answers “not receiving”")}</span></label>
      </section>
      <section class="kb-share-card">
        <h2>${t("You")}</h2>
        <div class="kb-share-me">
          <button type="button" class="kb-share-avbtn" data-avatar title="${esc(t("Choose a picture"))}">${avatarHtml(me.avatar, me.name, "is-big")}<small>${t("Change")}</small></button>
          <input type="file" accept="image/*" data-avfile hidden>
          <div class="kb-share-mefields">
            <label class="kb-form-row"><span>${t("Name")}</span><input class="kb-field" data-name value="${esc(me.name)}" maxlength="40" placeholder="${esc(t("What others see"))}" spellcheck="false"></label>
            <label class="kb-form-row"><span>${t("About")}</span><input class="kb-field" data-about value="${esc(me.about)}" maxlength="160" placeholder="${esc(t("Optional – a line about you"))}"></label>
          </div>
        </div>
        ${me.avatar ? `<div class="kb-phone-acts"><button type="button" class="kb-btn is-ghost" data-noav>${t("Remove picture")}</button></div>` : ""}
      </section>
      <section class="kb-share-card">
        <h2>${t("What you like")}</h2>
        <p class="kb-hint">${t("People see this when they open your link, and your PC turns away files that don't fit.")}</p>
        <div class="kb-form-row"><span>${t("I like")}</span><div class="kb-share-tags" data-likes></div></div>
        <div class="kb-form-row"><span>${t("I don't want")}</span><div class="kb-share-tags" data-dislikes></div></div>
        <label class="kb-check"><input type="checkbox" data-req${c.requireLiked ? " checked" : ""}> ${t("Only accept files with at least one tag I like (if I listed any)")}</label>
        <datalist id="kb-share-taglist"></datalist>
      </section>
      <section class="kb-share-card">
        <h2>${t("Your links")}</h2>
        <p class="kb-hint">${t("Post a permanent link where people can find it, or make one that expires. Switch a link off or delete it any time.")}</p>
        <div class="kb-share-newlink">
          <input class="kb-field" data-label placeholder="${esc(t("Label (only you see it)"))}" maxlength="40">
          <select class="kb-field" data-hours><option value="">${t("Permanent")}</option><option value="24" selected>${t("24 hours")}</option><option value="168">${t("7 days")}</option></select>
          <button type="button" class="kb-btn is-primary" data-new>${icon("plus")}${t("New link")}</button>
        </div>
        <div class="kb-share-links" data-links>${c.links.length ? c.links.map(linkRow).join("") : `<p class="kb-hint">${t("No links yet.")}</p>`}</div>
        ${c.baseUrl ? "" : `<p class="kb-hint kb-share-warn">${t("These links only work inside your own network until you enter a public address below.")}</p>`}
      </section>
      <section class="kb-share-card">
        <h2>${t("Public address")}</h2>
        <p class="kb-hint">${t("Your PC isn't reachable from the internet by itself. The links use this address – inside your own network they work without it.")}</p>
        <div data-net><p class="kb-hint">${t("Checking …")}</p></div>
        <details class="kb-share-help"${c.baseUrl && !netState.running ? " open" : ""}><summary>${t("Use my own address")}</summary>
          <p>${t("If you reach this PC another way (own domain, router port forwarding …), enter that address here.")}</p>
          <input class="kb-field" data-base value="${esc(c.baseUrl)}" placeholder="https://my-pc.example.net" spellcheck="false">
        </details>
      </section>
      <details class="kb-share-card kb-share-more"><summary><h2>${t("More")}</h2></summary>
        <label class="kb-check"><input type="checkbox" data-chat${c.chat ? " checked" : ""}> ${t("Allow chat messages")}</label>
        <div class="kb-share-limits">
          <label class="kb-form-row"><span>${t("Largest file (MB)")}</span><input class="kb-field" type="number" min="1" max="20000" data-lim="maxFileMB" value="${c.maxFileMB}"></label>
          <label class="kb-form-row"><span>${t("Inbox size limit (GB)")}</span><input class="kb-field" type="number" min="1" max="2000" data-lim="maxInboxGB" value="${c.maxInboxGB}"></label>
          <label class="kb-form-row"><span>${t("Files per sender and day")}</span><input class="kb-field" type="number" min="1" max="1000" data-lim="perSenderPerDay" value="${c.perSenderPerDay}"></label>
        </div>
        <label class="kb-check"><input type="checkbox" data-auto${store.get("shareAuto", true) ? " checked" : ""}> ${t("Start the receiver when Stash UI opens")}</label>
        <h3>${t("Blocked")}</h3>
        <div data-blocked>${c.blocked.length ? c.blocked.map((b, i) => `<div class="kb-share-blocked"><span>${esc(b.name || t("Unknown"))}</span><button type="button" class="kb-btn is-ghost" data-unblock="${i}">${t("Unblock")}</button></div>`).join("") : `<p class="kb-hint">${t("Nobody.")}</p>`}</div>
        <div class="kb-phone-acts"><button type="button" class="kb-btn is-ghost kb-pdanger" data-stop>${icon("stop")}${t("Stop the receiver")}</button></div>
        <p class="kb-hint">${t("Settings, links, inbox and messages are kept in")} <b>${esc(ctx.st.dir)}</b></p>
      </details>`;
    wire();
    fillTags();
    paintNet();
    if (!netLoaded) {
      netLoaded = true;
      loadNet();
    }
  }

  function linkRow(l) {
    const st = linkState(l);
    const url = linkUrl(l);
    return `<div class="kb-share-link is-${st}" data-link="${esc(l.id)}">
      <div class="kb-share-linkhead"><b>${esc(l.label || (l.expires ? t("Temporary link") : t("Permanent link")))}</b>
        <span class="kb-share-state">${st === "paused" ? t("switched off") : st === "expired" ? t("expired") : left(l)}</span></div>
      <div class="kb-phone-url"><code>${esc(url)}</code><button type="button" class="kb-btn is-ghost" data-copy title="${esc(t("Copy the link"))}">${icon("copies")}</button></div>
      <div class="kb-share-row">
        <button type="button" class="kb-btn" data-toggle>${l.enabled ? t("Switch off") : t("Switch on")}</button>
        <button type="button" class="kb-btn is-ghost" data-rename>${t("Rename")}</button>
        <button type="button" class="kb-btn is-ghost kb-pdanger" data-del>${t("Delete")}</button>
      </div>
    </div>`;
  }

  async function fillTags() {
    try {
      const all = await tagsCache();
      const dl = host.querySelector("#kb-share-taglist");
      if (dl) dl.innerHTML = all.slice(0, 1500).map((x) => `<option value="${esc(x.name)}">`).join("");
    } catch (e) { /* suggestions are an extra */ }
  }

  function wire() {
    const q = (s) => host.querySelector(s);
    const c = ctx.s.config;
    q("[data-recv]").onchange = (e) => save({ receiving: e.target.checked }).then(paint);
    let nt = 0;
    const idSave = () => {
      clearTimeout(nt);
      nt = setTimeout(() => {
        C.setMe({ name: q("[data-name]").value.trim(), about: q("[data-about]").value.trim() });
        save({ name: C.me().name, about: C.me().about });
      }, 500);
    };
    q("[data-name]").oninput = idSave;
    q("[data-about]").oninput = idSave;
    const setAvatar = async (make) => {
      try {
        const a = await make();
        C.setMe({ avatar: a });
        await save({ avatar: a });
        paint();
      } catch (err) {
        errorToast(err, t("Picture"));
      }
    };
    // A picture: from a file, or cut out of an image / scene frame of the library
    q("[data-avatar]").onclick = (e) =>
      menu(e.currentTarget, [
        { label: t("Upload a picture"), run: () => q("[data-avfile]").click() },
        { label: t("Choose from my library"), run: () => openPhotoCutter(null, (url) => setAvatar(() => C.avatarFromDataUrl(url)), { square: true, kind: "image", title: t("Choose a picture"), maxSide: 512 }) },
      ]);
    q("[data-avfile]").onchange = async (e) => {
      const f = e.target.files[0];
      if (f) await setAvatar(() => C.avatarFromFile(f));
    };
    const na = q("[data-noav]");
    if (na) na.onclick = async () => (C.setMe({ avatar: "" }), await save({ avatar: "" }), paint());
    tagEditor(q("[data-likes]"), c.likes, (l) => save({ likes: l }), "kb-share-taglist");
    tagEditor(q("[data-dislikes]"), c.dislikes, (l) => save({ dislikes: l }), "kb-share-taglist");
    q("[data-req]").onchange = (e) => save({ requireLiked: e.target.checked });
    q("[data-new]").onclick = async () => {
      try {
        const h = q("[data-hours]").value;
        await C.adm("/admin/link", { action: "new", label: q("[data-label]").value.trim(), hours: h ? Number(h) : null });
        await ctx.refresh();
      } catch (e) {
        errorToast(e, "Sharing");
      }
    };
    host.querySelectorAll("[data-link]").forEach((el) => {
      const l = c.links.find((x) => x.id === el.dataset.link);
      el.querySelector("[data-copy]").onclick = async () => {
        try {
          await navigator.clipboard.writeText(linkUrl(l));
          toast(t("Link copied"), "ok");
        } catch (e) {
          const r = document.createRange();
          r.selectNodeContents(el.querySelector("code"));
          getSelection().removeAllRanges();
          getSelection().addRange(r);
        }
      };
      el.querySelector("[data-toggle]").onclick = () => C.adm("/admin/link", { action: "set", id: l.id, enabled: !l.enabled }).then(() => ctx.refresh()).catch((e) => errorToast(e, "Sharing"));
      el.querySelector("[data-rename]").onclick = async () => {
        const v = await promptDialog({ title: t("Rename"), label: t("Label (only you see it)"), value: l.label || "", ok: t("Save") });
        if (v != null) C.adm("/admin/link", { action: "rename", id: l.id, label: v }).then(() => ctx.refresh()).catch((e) => errorToast(e, "Sharing"));
      };
      el.querySelector("[data-del]").onclick = async () => {
        if (await confirmDialog({ title: t("Delete link"), text: t("People who have this link can't send you anything any more."), ok: t("Delete"), danger: true }))
          C.adm("/admin/link", { action: "del", id: l.id }).then(() => ctx.refresh()).catch((e) => errorToast(e, "Sharing"));
      };
    });
    q("[data-base]").onchange = async (e) => {
      const v = e.target.value.trim().replace(/\/+$/, "");
      if (v && !/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(v)) return toast(t("That isn't a web address"), "err");
      await save({ baseUrl: v });
      paint();
    };
    q("[data-chat]").onchange = (e) => save({ chat: e.target.checked });
    host.querySelectorAll("[data-lim]").forEach((i) => (i.onchange = () => save({ [i.dataset.lim]: Number(i.value) })));
    q("[data-auto]").onchange = (e) => store.set("shareAuto", e.target.checked);
    host.querySelectorAll("[data-unblock]").forEach((b) => (b.onclick = () => C.adm("/admin/block", { action: "unblock", index: Number(b.dataset.unblock) }).then(() => ctx.refresh()).catch((e) => errorToast(e, "Sharing"))));
    q("[data-stop]").onclick = async () => {
      if (!(await confirmDialog({ title: t("Stop the receiver"), text: t("Nobody can send you anything until you start it again. Your links, inbox and messages are kept."), ok: t("Stop"), danger: true }))) return;
      try {
        await runBackend({ mode: "share_stop" });
        store.set("shareAuto", false);
      } catch (e) {
        errorToast(e, "Sharing");
      }
      await ctx.refresh();
    };
  }

  return {
    update() {
      if (!ctx.running) {
        host.innerHTML = startCard(ctx, t("Start it to get your own links, an inbox and a chat."));
        wireStart(host, ctx);
        built = false;
        return;
      }
      // Don't redraw under the cursor while a field is being typed in
      if (built && host.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      // Your name / picture: the receiver and this browser should agree
      const c = ctx.s.config;
      const me = C.me();
      if (!built) {
        if (!c.name && me.name) ctx.save({ name: me.name, about: me.about, avatar: me.avatar }).catch(() => {});
        else if (c.name && !me.name) C.setMe({ name: c.name, about: c.about, avatar: c.avatar });
      }
      built = true;
      paint();
    },
    destroy() {},
  };
}
