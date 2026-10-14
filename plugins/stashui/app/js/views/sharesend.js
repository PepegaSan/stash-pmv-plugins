// Sharing → Send: saved links of other people, and choosing things from your own library to send them.
// The files go straight from this browser to their receiver (their link) – nothing passes through a server of ours.
// Their rules (tags they like / don't want, largest file) are shown and checked before anything is uploaded.

import { esc, icon, toast, errorToast, store, fmtBytes, confirmDialog } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import * as C from "../shareconn.js";

const avatar = (a, name, cls = "") =>
  a ? `<img class="kb-share-av ${cls}" alt="" src="${esc(C.safeAvatar(a))}">` : `<span class="kb-share-av ${cls}" aria-hidden="true">${esc((String(name || "?").trim()[0] || "?").toUpperCase())}</span>`;

const F_IMAGES = `query($f: FindFilterType, $x: ImageFilterType) { r: findImages(filter: $f, image_filter: $x) { count images { id title paths { thumbnail image } visual_files { __typename ... on ImageFile { basename size } ... on VideoFile { basename size } } tags { name } } } }`;
const F_SCENES = `query($f: FindFilterType, $x: SceneFilterType) { r: findScenes(filter: $f, scene_filter: $x) { count scenes { id title paths { screenshot stream } files { basename size } tags { name } } } }`;

// Names → ids of YOUR tags (exact name or alias, any case)
const idCache = new Map();
async function tagIds(names) {
  const out = [];
  for (const n of names) {
    const k = n.toLowerCase();
    if (!idCache.has(k)) {
      let id = null;
      try {
        const r = (await gql(`query($q: String) { findTags(filter: { q: $q, per_page: 20 }) { tags { id name aliases } } }`, { q: n })).findTags.tags;
        const hit = r.find((x) => x.name.toLowerCase() === k) || r.find((x) => (x.aliases || []).some((a) => a.toLowerCase() === k));
        id = hit ? hit.id : null;
      } catch (e) { /* no tag */ }
      idCache.set(k, id);
    }
    if (idCache.get(k)) out.push(idCache.get(k));
  }
  return out;
}

export function mountSend(host, ctx) {
  let sel = null; // the contact that is open: { url, name, avatar }
  let hi = null; // its hello answer (or an Error)
  let pick = null; // the picker state while open
  let sending = null; // { rows, cancel }
  let alive = true;

  const selUrl = () => (sel ? sel.url : "");

  function paint() {
    const list = C.contacts();
    host.innerHTML = `
      <div class="kb-share-two">
        <section class="kb-share-card kb-share-side">
          <h2>${t("Saved links")}</h2>
          <form class="kb-share-add" data-addform>
            <input class="kb-field" data-link placeholder="${esc(t("Paste a sharing link"))}" spellcheck="false" autocomplete="off">
            <button type="submit" class="kb-btn is-primary">${icon("plus")}${t("Add")}</button>
          </form>
          <div class="kb-share-contacts">${list.length ? list.map((c) => `<button type="button" class="kb-share-contact${C.sameLink(c.url, selUrl()) ? " is-on" : ""}" data-url="${esc(c.url)}">${avatar(c.avatar, c.name)}<span>${esc(c.name || t("Unknown"))}</span></button>`).join("") : `<p class="kb-hint">${t("Links you save appear here. Ask someone for their sharing link.")}</p>`}</div>
        </section>
        <div class="kb-share-main" data-main></div>
      </div>`;
    wire();
    paintMain();
  }

  function paintMain() {
    const m = host.querySelector("[data-main]");
    if (!m) return;
    if (!sel) {
      m.innerHTML = `<section class="kb-share-card"><p class="kb-hint">${t("Pick a saved link on the left – or paste one – to see what they like and send them something.")}</p></section>`;
      return;
    }
    const me = C.me();
    let body;
    if (!hi) body = `<p class="kb-hint">${t("Asking …")}</p>`;
    else if (hi instanceof Error) body = `<p class="kb-hint kb-share-warn">${esc(hi.message)}</p><div class="kb-phone-acts"><button type="button" class="kb-btn" data-retry>${t("Try again")}</button></div>`;
    else
      body = `${hi.about ? `<p>${esc(hi.about)}</p>` : ""}
        <div class="kb-share-pref"><span>${t("Likes")}</span><div class="kb-chips">${(hi.likes || []).length ? hi.likes.map((g) => `<span class="kb-chip is-like">${esc(g)}</span>`).join("") : `<small class="kb-hint">${t("nothing listed")}</small>`}</div></div>
        <div class="kb-share-pref"><span>${t("Doesn't want")}</span><div class="kb-chips">${(hi.dislikes || []).length ? hi.dislikes.map((g) => `<span class="kb-chip is-not">${esc(g)}</span>`).join("") : `<small class="kb-hint">${t("nothing listed")}</small>`}</div></div>
        <p class="kb-hint">${t("Up to {n} MB per file.", { n: hi.maxFileMB })}${hi.requireLiked && (hi.likes || []).length ? " " + t("Files need at least one tag they like.") : ""}</p>`;
    m.innerHTML = `
      <section class="kb-share-card">
        <div class="kb-share-who">${avatar(hi && !(hi instanceof Error) ? hi.avatar : sel.avatar, sel.name, "is-big")}<div><h2>${esc(sel.name || t("Unknown"))}</h2><small class="kb-hint">${esc(C.parseLink(sel.url).base)}</small></div></div>
        ${body}
        ${hi && !(hi instanceof Error) && !me.name ? `<div class="kb-share-warn"><label class="kb-form-row"><span>${t("Your name (they see it)")}</span><input class="kb-field" data-myname maxlength="40"></label><button type="button" class="kb-btn" data-savename>${t("Save")}</button></div>` : ""}
        <div class="kb-share-row">
          <button type="button" class="kb-btn is-primary" data-choose${hi && !(hi instanceof Error) ? "" : " disabled"}>${icon("image")}${t("Choose from my library")}</button>
          <button type="button" class="kb-btn" data-chat${hi && !(hi instanceof Error) && hi.chat ? "" : " disabled"}>${icon("chat")}${t("Chat")}</button>
          <button type="button" class="kb-btn is-ghost kb-pdanger" data-remove>${t("Remove link")}</button>
        </div>
      </section>
      <div data-picker></div>
      <div data-sending></div>`;
    wireMain(m);
    if (pick) paintPicker();
    if (sending) paintSending();
  }

  async function open(c) {
    sel = c;
    hi = null;
    pick = null;
    sending = null;
    paint();
    try {
      hi = await C.hello(c.url);
      if (!alive) return;
      if (hi.name && (hi.name !== c.name || hi.avatar !== c.avatar)) {
        sel = C.addContact({ url: c.url, name: hi.name, avatar: hi.avatar });
      }
    } catch (e) {
      hi = e;
    }
    if (alive && sel && C.sameLink(sel.url, c.url)) {
      paint();
    }
  }

  function wire() {
    host.querySelector("[data-addform]").onsubmit = async (e) => {
      e.preventDefault();
      const inp = host.querySelector("[data-link]");
      const l = C.parseLink(inp.value);
      if (!l) return toast(t("That isn't a sharing link"), "err");
      try {
        const h = await C.hello(l.url);
        const c = C.addContact({ url: l.url, name: h.name, avatar: h.avatar });
        toast(t("Saved {name}", { name: h.name }), "ok");
        inp.value = "";
        sel = c;
        hi = h;
        pick = null;
        paint();
      } catch (err) {
        // still saved? A link that is offline right now can be saved and tried later
        if (err.code === "offline" && (await confirmDialog({ title: t("Couldn't reach them"), text: t("Save the link anyway and try again later?"), ok: t("Save") }))) {
          const c = C.addContact({ url: l.url, name: t("Unknown") });
          await open(c);
        } else errorToast(err, t("Sharing"));
      }
    };
    host.querySelectorAll("[data-url]").forEach((b) => (b.onclick = () => open(C.contacts().find((c) => C.sameLink(c.url, b.dataset.url)))));
  }

  function wireMain(m) {
    const q = (s) => m.querySelector(s);
    const r = q("[data-retry]");
    if (r) r.onclick = () => open(sel);
    const sn = q("[data-savename]");
    if (sn)
      sn.onclick = async () => {
        const v = q("[data-myname]").value.trim();
        if (!v) return;
        C.setMe({ name: v });
        if (ctx.running) await ctx.save({ name: v }).catch(() => {});
        paintMain();
      };
    q("[data-choose]").onclick = () => {
      if (pick) pick = null;
      else openPicker();
      paintMain();
    };
    q("[data-chat]").onclick = () => ctx.go("chat", sel.url);
    q("[data-remove]").onclick = async () => {
      if (!(await confirmDialog({ title: t("Remove link"), text: t("Remove {name} from your saved links?", { name: sel.name }), ok: t("Remove"), danger: true }))) return;
      C.removeContact(sel.url);
      sel = null;
      hi = null;
      pick = null;
      paint();
    };
  }

  // ---------- choosing from your library ----------
  function openPicker() {
    pick = { kind: "images", q: "", match: !!((hi.likes || []).length), page: 0, items: [], total: 0, more: true, loading: false, chosen: new Map(), token: 0, empty: "" };
    loadMore();
  }

  async function loadMore() {
    const p = pick;
    if (!p || p.loading || !p.more) return;
    p.loading = true;
    paintPicker();
    const my = ++p.token;
    try {
      // their rules go into the query (so Stash only returns what fits) and are checked again here
      const like = p.match && (hi.likes || []).length ? await tagIds(hi.likes) : null;
      const dis = p.match && (hi.dislikes || []).length ? await tagIds(hi.dislikes) : [];
      if (my !== p.token) return;
      if (like && !like.length) {
        p.more = false;
        p.empty = t("None of your tags matches what they like.");
      }
      const x = {};
      if (like && like.length) {
        x.tags = { value: like, modifier: "INCLUDES", depth: 0 };
        if (dis.length) x.AND = { tags: { value: dis, modifier: "EXCLUDES", depth: 0 } };
      } else if (dis.length) x.tags = { value: dis, modifier: "EXCLUDES", depth: 0 };
      // client-side rules can hide items: keep asking until there are enough on screen (or no more)
      for (let tries = 0; p.more && tries < 6 && visible(p).length < 24; tries++) {
        const f = { page: ++p.page, per_page: 48, sort: "created_at", direction: "DESC" };
        if (p.q.trim()) f.q = p.q.trim();
        const d = (await gql(p.kind === "images" ? F_IMAGES : F_SCENES, { f, x })).r;
        if (my !== p.token) return;
        p.total = d.count;
        const rows = (p.kind === "images" ? d.images : d.scenes).map((i) => normalise(p.kind, i));
        p.items.push(...rows);
        if (!rows.length || p.items.length >= d.count) p.more = false;
      }
    } catch (e) {
      p.more = false;
      p.empty = e.message;
    }
    p.loading = false;
    paintPicker();
  }

  const normalise = (kind, i) => {
    if (kind === "images") {
      const v = (i.visual_files || [])[0] || {};
      return { key: "i" + i.id, id: i.id, kind, title: i.title || v.basename || "Image " + i.id, thumb: i.paths.thumbnail, src: i.paths.image, name: v.basename || `image-${i.id}.jpg`, size: v.size || 0, tags: (i.tags || []).map((x) => x.name) };
    }
    const f = (i.files || [])[0] || {};
    return { key: "s" + i.id, id: i.id, kind, title: i.title || f.basename || "Scene " + i.id, thumb: i.paths.screenshot, src: i.paths.stream, name: f.basename || `scene-${i.id}.mp4`, size: f.size || 0, tags: (i.tags || []).map((x) => x.name) };
  };
  // what the rules of the other side let through (always checked here too – the server of a real Stash may ignore a filter)
  const visible = (p) => (p.match ? p.items.filter((i) => !C.tagProblem(hi, i.tags)) : p.items);
  const problem = (i) => C.tagProblem(hi, i.tags) || (hi.maxFileMB && i.size > hi.maxFileMB * 1048576 ? t("Bigger than their limit") : "");

  function paintPicker() {
    const host2 = host.querySelector("[data-picker]");
    if (!host2) return;
    const p = pick;
    if (!p) return void (host2.innerHTML = "");
    // The bar with the search box is built once and never replaced – only the list and the buttons below it are redrawn,
    // so typing isn't interrupted while the pictures load
    if (!host2.querySelector("[data-ptools]")) buildPicker(host2, p);
    const items = visible(p);
    const chosen = [...p.chosen.values()];
    const total = chosen.reduce((a, i) => a + (i.size || 0), 0);
    const q = (s) => host2.querySelector(s);
    host2.querySelectorAll("[data-k]").forEach((b) => b.classList.toggle("is-on", p.kind === b.dataset.k));
    const fit = q("[data-fit]");
    if (fit) fit.checked = !!p.match;
    const em = q("[data-pempty]");
    em.hidden = !p.empty;
    em.textContent = p.empty || "";
    q("[data-pgrid]").innerHTML = items
      .map((i) => {
        const bad = problem(i);
        return `<button type="button" class="kb-share-tile${p.chosen.has(i.key) ? " is-sel" : ""}${bad ? " is-bad" : ""}" data-key="${esc(i.key)}" title="${esc(bad || i.title)}"${bad ? " disabled" : ""}>
            <img src="${esc(i.thumb)}" alt="" loading="lazy"><span>${esc(i.title)}</span>${bad ? `<em>${esc(bad)}</em>` : ""}<b aria-hidden="true">✓</b>
          </button>`;
      })
      .join("");
    q("[data-pnone]").hidden = !(!items.length && !p.loading && !p.empty);
    const mo = q("[data-more]");
    mo.hidden = !p.more;
    mo.disabled = p.loading;
    mo.textContent = p.loading ? t("Loading …") : t("Load more");
    const sb = q("[data-send]");
    sb.disabled = !(chosen.length && !sending);
    sb.innerHTML = `${icon("share")}${t("Send")}${chosen.length ? ` ${chosen.length} (${fmtBytes(total) || "0 B"})` : ""}`;
  }

  function buildPicker(host2, p) {
    host2.innerHTML = `<section class="kb-share-card" data-ptools>
      <div class="kb-share-bar">
        <div class="kb-seg" data-kind><button type="button" data-k="images">${t("Images")}</button><button type="button" data-k="scenes">${t("Scenes")}</button></div>
        <input class="kb-field" data-q value="${esc(p.q)}" placeholder="${esc(t("Search your library"))}" spellcheck="false" autocomplete="off">
      </div>
      ${(hi.likes || []).length || (hi.dislikes || []).length ? `<label class="kb-check"><input type="checkbox" data-fit> ${t("Only what fits what they like and don't want")}</label>` : ""}
      <p class="kb-hint" data-pempty hidden></p>
      <div class="kb-share-grid is-pick" data-pgrid></div>
      <p class="kb-hint" data-pnone hidden>${t("Nothing to show.")}</p>
      <div class="kb-share-acts">
        <button type="button" class="kb-btn" data-more hidden>${t("Load more")}</button>
        <button type="button" class="kb-btn is-primary" data-send disabled>${icon("share")}${t("Send")}</button>
      </div></section>`;
    const q = (s) => host2.querySelector(s);
    const restart = (patch) => {
      Object.assign(pick, patch, { page: 0, items: [], total: 0, more: true, empty: "", token: pick.token + 1, loading: false });
      loadMore();
    };
    host2.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => pick.kind !== b.dataset.k && restart({ kind: b.dataset.k })));
    let qt = 0;
    q("[data-q]").oninput = (e) => {
      clearTimeout(qt);
      qt = setTimeout(() => restart({ q: e.target.value }), 450);
    };
    const mt = q("[data-fit]");
    if (mt) mt.onchange = (e) => restart({ match: e.target.checked });
    q("[data-pgrid]").addEventListener("click", (e) => {
      const b = e.target.closest("[data-key]");
      if (!b || !pick) return;
      const i = pick.items.find((x) => x.key === b.dataset.key);
      pick.chosen.has(i.key) ? pick.chosen.delete(i.key) : pick.chosen.set(i.key, i);
      paintPicker();
    });
    q("[data-more]").onclick = loadMore;
    q("[data-send]").onclick = send;
  }

  // ---------- sending ----------
  async function send() {
    const items = [...pick.chosen.values()];
    if (!items.length || sending) return;
    const me = C.me();
    if (!me.name) return toast(t("Enter your name first"), "err");
    const url = sel.url;
    const state = { rows: items.map((i) => ({ i, s: "wait", msg: t("waiting"), pct: 0 })), cancel: false };
    sending = state;
    paintSending();
    paintPicker();
    let ok = 0;
    for (const r of state.rows) {
      if (state.cancel) {
        r.s = "err";
        r.msg = t("cancelled");
        continue;
      }
      r.s = "up";
      r.msg = t("loading the file …");
      paintSending();
      try {
        const bad = problem(r.i);
        if (bad) throw new Error(bad);
        const res = await fetch(r.i.src, { credentials: "same-origin" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        r.msg = t("sending");
        await C.sendFile(url, blob, { name: r.i.name, tags: r.i.tags }, (f) => ((r.pct = f), (r.msg = t("sending") + " " + Math.round(f * 100) + "%"), paintSending()));
        r.s = "done";
        r.msg = t("sent");
        r.pct = 1;
        ok++;
        pick.chosen.delete(r.i.key);
      } catch (e) {
        r.s = "err";
        r.msg = e.message;
        // they are gone / blocked / switched off: no point in trying the rest
        if (/block|isn't valid|expired|aren't receiving|reach them/i.test(e.message)) state.cancel = true;
      }
      paintSending();
    }
    toast(ok === items.length ? t("Sent {n}", { n: ok }) : t("Sent {n} of {m}", { n: ok, m: items.length }), ok === items.length ? "ok" : "err");
    sending = { ...state, done: true };
    paintSending();
    paintPicker();
  }

  function paintSending() {
    const el = host.querySelector("[data-sending]");
    if (!el) return;
    if (!sending) return void (el.innerHTML = "");
    el.innerHTML = `<section class="kb-share-card"><h2>${t("Sending")}</h2>
      <div class="kb-share-send">${sending.rows
        .map((r) => `<div class="kb-share-sendrow is-${r.s}"><b>${esc(r.i.name)}</b><small>${esc(r.msg)}</small><div class="kb-share-bar2"><i style="width:${Math.round(r.pct * 100)}%"></i></div></div>`)
        .join("")}</div>
      <div class="kb-phone-acts">${sending.done ? `<button type="button" class="kb-btn" data-closesend>${t("Close")}</button>` : `<button type="button" class="kb-btn is-ghost kb-pdanger" data-cancelsend>${t("Cancel")}</button>`}</div></section>`;
    const c = el.querySelector("[data-cancelsend]");
    if (c) c.onclick = () => (sending.cancel = true);
    const x = el.querySelector("[data-closesend]");
    if (x) x.onclick = () => ((sending = null), paintSending());
  }

  return {
    update() {
      if (!host.firstChild) {
        paint();
        // a link was handed over (Inbox → Chat / Save)
        if (ctx.arg && C.parseLink(ctx.arg)) {
          const c = C.contacts().find((x) => C.sameLink(x.url, ctx.arg));
          ctx.arg = null;
          if (c) open(c);
        }
      }
    },
    destroy() {
      alive = false;
      if (sending) sending.cancel = true;
    },
  };
}
