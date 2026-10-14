// Common model for scenes, images and galleries ("pieces") and the salon hanging.

import { esc, icon, fmtDuration, fmtRes, fmtDate, fmtBytes, invNo, plural, store, menu, errorToast, inlineSvg, ratingText } from "./ui.js";
import { t } from "./i18n.js";
import { tierNow } from "./tiers.js";
import { tierBadge } from "./versusx.js";
import { critOf } from "./ratingx.js";
import { cardAspect, previewsOn } from "./display.js";

// Stash files animated GIFs as video files (codec "gif") but serves the GIF itself: those are images
export const isGif = (vf) => !!vf && vf.__typename === "VideoFile" && (/gif/i.test(vf.format || "") || /gif/i.test(vf.video_codec || "") || /\.gif$/i.test(vf.basename || vf.path || ""));

export function toPiece(kind, x, favId) {
  const tags = x.tags || [];
  const fav = !!favId && tags.some((t) => t.id === favId);
  if (kind === "scene") {
    const f = (x.files || [])[0] || {};
    const res = fmtRes(f.width, f.height);
    const dur = f.duration || 0;
    return {
      kind, id: x.id, raw: x, fav,
      title: x.title || f.basename || t("Scene {id}", { id: x.id }),
      w: f.width || 16, h: f.height || 9,
      thumb: x.paths && x.paths.screenshot,
      preview: x.paths && x.paths.preview,
      stamp: (store.get("cardRes", false) && res ? res + " · " : "") + fmtDuration(dur),
      meta: [t("Video"), fmtDuration(dur), res, x.date ? fmtDate(x.date) : ""].filter(Boolean).join(", "),
      resume: dur && x.resume_time ? Math.min(1, x.resume_time / dur) : 0,
      rating: x.rating100 || 0,
      studio: x.studio || null,
      interactive: !!x.interactive,
      tier: tierNow("scene", x.id),
      crit: critOf("scene", x),
    };
  }
  if (kind === "image") {
    const vf = (x.visual_files || [])[0] || {};
    const gif = isGif(vf);
    const isVid = vf.__typename === "VideoFile" && !gif;
    return {
      kind, id: x.id, raw: x, fav,
      title: x.title || vf.basename || t("Image {id}", { id: x.id }),
      w: vf.width || 3, h: vf.height || 4,
      thumb: x.paths && x.paths.thumbnail,
      preview: isVid ? x.paths.preview || x.paths.image : gif ? x.paths.image : null,
      previewImg: gif, // the GIF itself moves on hover (the thumbnail is a still)
      isVid,
      stamp: isVid ? (vf.duration ? fmtDuration(vf.duration) : t("Clip")) : gif ? "GIF" : "",
      meta: [isVid ? t("Clip") : gif ? "GIF" : t("Image"), vf.width ? `${vf.width} × ${vf.height}` : "", fmtBytes(vf.size)].filter(Boolean).join(", "),
      rating: x.rating100 || 0,
      tier: tierNow("image", x.id),
    };
  }
  // Gallery
  const cv = (x.cover && x.cover.visual_files && x.cover.visual_files[0]) || {};
  const path = (x.folder && x.folder.path) || ((x.files || [])[0] || {}).path || "";
  const base = path.split(/[\\/]/).filter(Boolean).pop();
  return {
    kind, id: x.id, raw: x, fav,
    title: x.title || base || t("Gallery {id}", { id: x.id }),
    w: cv.width || 4, h: cv.height || 3,
    thumb: x.paths && x.paths.cover,
    stamp: plural(x.image_count, "image", "images"),
    meta: [t("Gallery"), plural(x.image_count, "image", "images"), x.date ? fmtDate(x.date) : ""].filter(Boolean).join(", "),
    rating: x.rating100 || 0,
  };
}

// The studio on a scene: its logo, otherwise its name (Settings → General → "Studio on scenes")
function studioBadge(p) {
  if (!p.studio || !store.get("studioLogos", false)) return "";
  const logo = p.studio.image_path && !/default=true/.test(p.studio.image_path);
  return `<span class="kb-studio${logo ? "" : " is-name"}" title="${esc(p.studio.name)}">${logo ? `<img alt="${esc(p.studio.name)}" loading="lazy" src="${esc(p.studio.image_path)}">` : esc(p.studio.name)}</span>`;
}

// A card from an extension (see ext.js): own link in a new tab, no selection, favourites, tiers or previews
function foreignHtml(p) {
  const badges = (p.badges || []).map((b) => `<span class="kb-xbadge"${b.title ? ` title="${esc(b.title)}"` : ""}>${esc(b.text)}</span>`).join("");
  const tag = p.href ? "a" : "div";
  // Buttons drawn by Stash UI (piece.actions): they don't open the link; an icon is one of ours by name, or an inline <svg>
  const acts = (p.actions || []).slice(0, 4).map((a, i) => `<button type="button" class="kb-xact" data-xact="${i}" title="${esc(a.title || "")}" aria-label="${esc(a.title || "")}">${/^\s*<svg/i.test(a.icon || "") ? inlineSvg(a.icon) : icon(a.icon || "plug")}</button>`).join("");
  return (
    `<${tag} class="kb-piece kb-xpiece${p.dim ? " is-dim" : ""}${p.className ? " " + esc(p.className) : ""}" data-key="${esc(p.kind + ":" + p.id)}"${p.href ? ` href="${esc(p.href)}" target="_blank" rel="noopener"` : ""} aria-label="${esc(p.title || "")}">` +
    (p.thumb ? `<img alt="" loading="lazy" decoding="async" src="${esc(p.thumb)}">` : "") +
    (p.stamp ? `<span class="kb-stamp">${esc(p.stamp)}</span>` : "") +
    (badges ? `<span class="kb-xbadges">${badges}</span>` : "") +
    (acts ? `<span class="kb-xacts">${acts}</span>` : "") +
    `<span class="kb-placard"><b>${esc(p.title || "")}</b><small>${esc(p.meta || "")}</small></span>` +
    `</${tag}>`
  );
}

function pieceHtml(p) {
  if (p.foreign) return foreignHtml(p);
  const tag = p.kind === "image" ? "button" : "a";
  const href = p.kind === "scene" ? `#/scene/${p.id}` : p.kind === "gallery" ? `#/gallery/${p.id}` : "";
  return (
    `<${tag} class="kb-piece" data-key="${p.kind}:${p.id}"${href ? ` href="${href}"` : ' type="button"'} aria-label="${esc(p.title)}">` +
    (p.thumb ? `<img alt="" loading="lazy" decoding="async" src="${esc(p.thumb)}">` : "") +
    (p.stamp ? `<span class="kb-stamp">${p.interactive ? `<i class="kb-ia" title="${esc(t("Funscript – plays on The Handy"))}">${icon("plug")}</i>` : ""}${esc(p.stamp)}</span>` : "") +
    (p.resume ? `<span class="kb-resume"><i style="width:${(p.resume * 100).toFixed(1)}%"></i></span>` : "") +
    (p.fav ? `<span class="kb-dot" title="${t("Favorite")}"></span>` : "") +
    (p.tier ? `<span class="kb-tierpos">${tierBadge(p.tier)}</span>` : "") +
    (p.crit ? `<span class="kb-critbars" aria-hidden="true">${p.crit.slice(0, 6).map((c) => `<i style="--v:${c.score * 20}%" title="${esc(c.name)}: ${c.score} / 5"></i>`).join("")}</span>` : "") +
    studioBadge(p) +
    `<span class="kb-pick" role="checkbox" aria-checked="false" aria-label="${t("Select")}">${icon("check")}</span>` +
    `<span class="kb-placard"><b>${esc(p.title)}</b><small>${esc(p.meta)}</small></span>` +
    `</${tag}>`
  );
}

// The card view of a scene follows the card of classic Stash: on the picture the studio logo (top right), the rating (top left),
// resolution and length (bottom right); below it the title, the date, a piece of the details and a row of small icon buttons with
// numbers – performers, tags, galleries (a click or the mouse resting on one opens the list), plays, O counter and "organized".
function cardOverlays(p) {
  const x = p.raw || {};
  const logo = x.studio && x.studio.image_path && !/default=true/.test(x.studio.image_path);
  return (
    `<div class="kb-scard-over">` +
    (x.studio ? `<a class="kb-scard-studio${logo ? "" : " is-name"}" href="#/studio/${x.studio.id}" title="${esc(x.studio.name)}">${logo ? `<img alt="${esc(x.studio.name)}" loading="lazy" src="${esc(x.studio.image_path)}">` : esc(x.studio.name)}</a>` : "") +
    (x.rating100 ? `<span class="kb-scard-rating" title="${esc(t("Rating"))}">${esc(/★/.test(ratingText(x.rating100)) ? ratingText(x.rating100) : "★ " + ratingText(x.rating100))}</span>` : "") +
    `</div>`
  );
}

function cardBody(p) {
  const x = p.raw || {};
  const perfs = x.performers || [];
  const tags = x.tags || [];
  const gals = x.galleries || [];
  const pop = (kind, ic, n, label) => (n ? `<button type="button" class="kb-scard-pop" data-pop="${kind}" title="${esc(label)}">${icon(ic)}<span>${n}</span></button>` : "");
  const stat = (ic, n, label) => (n ? `<span class="kb-scard-stat" title="${esc(label)}">${icon(ic)}<span>${n}</span></span>` : "");
  return (
    `<a class="kb-scard-title" href="#/scene/${p.id}" title="${esc(p.title)}">${esc(p.title)}</a>` +
    (x.date ? `<div class="kb-scard-date">${esc(fmtDate(x.date))}</div>` : "") +
    (x.details ? `<p class="kb-scard-details">${esc(x.details)}</p>` : "") +
    `<div class="kb-scard-pops">` +
    pop("perfs", "person", perfs.length, t("Performers")) +
    pop("tags", "tag", tags.length, t("Tags")) +
    pop("gals", "image", gals.length, t("Galleries")) +
    stat("play", x.play_count, t("Plays")) +
    stat("drop", x.o_counter, t("O counter")) +
    (x.organized ? `<span class="kb-scard-stat" title="${esc(t("Organized"))}">${icon("check")}</span>` : "") +
    `</div>`
  );
}

// The list that opens from one of the icon buttons (one panel at a time, next to the button)
let scPop = null;
let scPopFor = null;
let scPopTimer = 0;
let scPopHide = 0;
export function closeScPop() {
  clearTimeout(scPopTimer);
  clearTimeout(scPopHide);
  if (scPop) scPop.remove();
  scPop = scPopFor = null;
}
function openScPop(btn, p) {
  closeScPop();
  const x = p.raw || {};
  const kind = btn.dataset.pop;
  const items =
    kind === "perfs"
      ? (x.performers || []).map((q) => `<a class="kb-scpop-row" href="#/performer/${q.id}">${q.image_path ? `<img alt="" loading="lazy" src="${esc(q.image_path)}">` : "<i></i>"}<span>${esc(q.name)}</span></a>`)
      : kind === "gals"
        ? (x.galleries || []).map((q) => `<a class="kb-scpop-row" href="#/gallery/${q.id}"><i>${icon("image")}</i><span>${esc(q.title || t("Gallery {id}", { id: q.id }))}</span></a>`)
        : (x.tags || []).map((q) => `<a class="kb-chip" href="#/tag/${q.id}">${esc(q.name)}</a>`);
  if (!items.length) return;
  scPop = document.createElement("div");
  scPop.className = "kb-scpop" + (kind === "tags" ? " is-tags" : "");
  scPop.innerHTML = items.join("");
  scPopFor = btn;
  document.body.appendChild(scPop);
  const r = btn.getBoundingClientRect();
  const w = scPop.offsetWidth;
  const h = scPop.offsetHeight;
  scPop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
  scPop.style.top = (r.bottom + 6 + h > innerHeight && r.top - 6 - h > 8 ? r.top - 6 - h : r.bottom + 6) + "px";
  scPop.addEventListener("pointerenter", () => clearTimeout(scPopHide));
  scPop.addEventListener("pointerleave", () => (scPopHide = setTimeout(closeScPop, 250)));
  scPop.addEventListener("click", (e) => e.target.closest("a") && closeScPop());
}

// ---------- Salon hanging ----------
// Justified rows, loads more while scrolling, preview video on hover, multi-select.

export class Hang {
  constructor(el, opts) {
    this.el = el;
    this.opts = opts; // { fetchPage(page) → {count, pieces}, onOpen(piece, index, list), onSelect(set), rowHeight }
    this.pieces = [];
    this.extras = []; // cards of extensions: { before: key | null, last: key of the page's last item, piece } - not part of this.pieces
    this.cleanups = []; // (of the extensions' cards: key → function)
    this.cleanupBy = new Map();
    this.nodes = new Map();
    this.cardNodes = new Map(); // (card view: the wrapper with the details under a picture)
    this.page = 0;
    this.count = null;
    this.done = false;
    this.busy = false;
    this.selected = new Set();
    this.lastPick = null;
    this.rowH = opts.rowHeight || 240;
    this.gap = 10;
    el.classList.add("kb-hang");
    el.innerHTML = `<div class="kb-rows"></div><div class="kb-loading" hidden>${t("Loading …")}</div><div class="kb-sentinel"></div>`;
    this.rowsEl = el.querySelector(".kb-rows");
    this.loadingEl = el.querySelector(".kb-loading");
    this.sentinel = el.querySelector(".kb-sentinel");
    this.io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && this.more(), { rootMargin: "900px 0px" });
    this.io.observe(this.sentinel);
    this.ro = new ResizeObserver(() => {
      const w = this.el.clientWidth;
      if (w && w !== this.lastW) {
        this.lastW = w;
        this.layout();
      }
    });
    this.ro.observe(el);
    this.bind();
    this.more();
  }

  destroy() {
    closeScPop();
    window.removeEventListener("scroll", closeScPop, true);
    this.io.disconnect();
    this.ro.disconnect();
    this.stopPreview();
    this.cleanupBy.forEach((f) => {
      try {
        f();
      } catch (e) { /* the extension's own cleanup */ }
    });
    this.cleanupBy.clear();
  }

  // New cards of one extension source (keys start with prefix) in place of the old ones – the list isn't rebuilt
  replaceExtras(prefix, entries) {
    this.extras = this.extras.filter((x) => {
      if (!String(x.piece.key).startsWith(prefix)) return true;
      const k = x.piece.kind + ":" + x.piece.id;
      const f = this.cleanupBy.get(k);
      if (f) {
        try {
          f();
        } catch (e) { /* the extension's own cleanup */ }
        this.cleanupBy.delete(k);
      }
      this.nodes.delete(k);
      return false;
    });
    entries.forEach((x) => this.extras.push({ before: x.before == null ? null : x.before, last: x.last, piece: x.piece }));
    this.layout();
  }

  setRowHeight(h) {
    this.rowH = h;
    this.layout();
  }

  async more() {
    if (this.busy || this.done) return;
    this.busy = true;
    this.loadingEl.hidden = false;
    try {
      const { count, pieces, extras } = await this.opts.fetchPage(++this.page);
      this.count = count;
      const last = pieces.length ? pieces[pieces.length - 1].kind + ":" + pieces[pieces.length - 1].id : null;
      (extras || []).forEach((x) => this.extras.push({ before: x.before == null ? null : x.before, last, piece: x.piece }));
      this.pieces.push(...pieces);
      if (!pieces.length || this.pieces.length >= count) this.done = true;
      this.layout();
      this.opts.onLoaded && this.opts.onLoaded(this);
    } catch (e) {
      this.done = true;
      this.opts.onError && this.opts.onError(e);
    } finally {
      this.busy = false;
      this.loadingEl.hidden = true;
      // Still room on screen? Load more right away.
      if (!this.done && this.sentinel.getBoundingClientRect().top < innerHeight + 900) setTimeout(() => this.more(), 0);
    }
  }

  node(p) {
    const key = p.kind + ":" + p.id;
    let n = this.nodes.get(key);
    if (!n) {
      const tpl = document.createElement("template");
      tpl.innerHTML = pieceHtml(p);
      n = tpl.content.firstChild;
      const img = n.querySelector("img");
      if (img) {
        if (img.complete && img.naturalWidth) img.classList.add("is-loaded");
        else img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
        img.addEventListener("error", () => img.classList.add("is-loaded"), { once: true });
      }
      n._piece = p;
      this.nodes.set(key, n);
      if (p.foreign && typeof p.mount === "function") {
        try {
          const done = p.mount(n);
          if (typeof done === "function") this.cleanupBy.set(key, done);
        } catch (e) {
          console.warn("[Stash UI] extension card", e);
        }
      }
    }
    n.classList.toggle("is-picked", this.selected.has(key));
    return n;
  }

  layout() {
    const W = this.el.clientWidth;
    if (!W) return;
    const H = this.rowH;
    const G = this.gap;
    const rows = [];
    let row = [];
    let sum = 0;
    // library items, with the extensions' cards in front of the item they asked for (or after the page's last item)
    const keyOf = (p) => p.kind + ":" + p.id;
    const placed = new Set();
    const ahead = new Map();
    const after = new Map();
    const have = new Set(this.pieces.map(keyOf));
    for (const x of this.extras) {
      const dest = x.before != null && have.has(x.before) ? ahead : x.before == null && x.last && have.has(x.last) ? after : null;
      if (!dest) continue;
      const k = dest === ahead ? x.before : x.last;
      (dest.get(k) || dest.set(k, []).get(k)).push(x.piece);
      placed.add(x);
    }
    const seq = [];
    for (const p of this.pieces) {
      (ahead.get(keyOf(p)) || []).forEach((f) => seq.push(f));
      seq.push(p);
      (after.get(keyOf(p)) || []).forEach((f) => seq.push(f));
    }
    // (an anchor that is gone, or a page without items: at the end)
    this.extras.forEach((x) => placed.has(x) || seq.push(x.piece));
    // Card view (scenes): a grid of cards, the picture with its details below – instead of the justified rows
    const cards = !!(this.opts.cards && this.opts.cards());
    this.rowsEl.classList.toggle("is-cards", cards);
    if (cards) {
      this.rowsEl.style.setProperty("--cardw", Math.round(H * 1.4) + "px");
      const grid = document.createDocumentFragment();
      for (const p of seq) {
        const key = keyOf(p);
        const n = this.node(p);
        n.style.width = n.style.height = "";
        let c = this.cardNodes.get(key);
        if (!c) {
          c = document.createElement("div");
          if (p.kind === "scene" && !p.foreign) {
            c.className = "kb-scard";
            c.dataset.key = key;
            const body = document.createElement("div");
            body.className = "kb-scard-body";
            body.innerHTML = cardBody(p);
            c.append(n);
            c.insertAdjacentHTML("beforeend", cardOverlays(p));
            c.append(body);
          } else {
            c.className = "kb-scard is-plain"; // (images, galleries, an extension's card: only the picture)
            c.append(n);
          }
          this.cardNodes.set(key, c);
        } else if (c.firstElementChild !== n) c.prepend(n);
        grid.appendChild(c);
      }
      this.rowsEl.replaceChildren(grid);
      return;
    }
    for (const p of seq) {
      const ar = cardAspect() || Math.min(3, Math.max(0.42, p.w / p.h || 1)); // (posters / scenes: every thumbnail the same shape)
      row.push([p, ar]);
      sum += ar;
      if (sum * H + G * (row.length - 1) >= W) {
        rows.push({ items: row, h: (W - G * (row.length - 1)) / sum });
        row = [];
        sum = 0;
      }
    }
    if (row.length) rows.push({ items: row, h: Math.min(H, (W - G * (row.length - 1)) / sum) });
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "kb-row";
      for (const [p, ar] of r.items) {
        const n = this.node(p);
        n.style.width = (ar * r.h).toFixed(2) + "px";
        n.style.height = r.h.toFixed(2) + "px";
        div.appendChild(n);
      }
      frag.appendChild(div);
    }
    this.rowsEl.replaceChildren(frag);
  }

  // Update one piece (e.g. after favorite/edit) without reloading everything
  update(p) {
    const key = p.kind + ":" + p.id;
    const i = this.pieces.findIndex((x) => x.kind === p.kind && x.id === p.id);
    if (i < 0) return;
    this.pieces[i] = p;
    this.nodes.delete(key);
    this.cardNodes.delete(key);
    this.layout();
  }
  remove(keys) {
    this.pieces = this.pieces.filter((p) => !keys.includes(p.kind + ":" + p.id));
    keys.forEach((k) => {
      this.nodes.delete(k);
      this.cardNodes.delete(k);
      this.selected.delete(k);
    });
    if (this.count != null) this.count -= keys.length;
    this.layout();
    this.emitSelect();
  }

  // ---------- Selection ----------

  toggle(key, range) {
    const keys = this.pieces.map((p) => p.kind + ":" + p.id);
    if (range && this.lastPick) {
      const a = keys.indexOf(this.lastPick);
      const b = keys.indexOf(key);
      if (a >= 0 && b >= 0) {
        const on = !this.selected.has(key);
        keys.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((k) => (on ? this.selected.add(k) : this.selected.delete(k)));
      }
    } else if (this.selected.has(key)) this.selected.delete(key);
    else this.selected.add(key);
    this.lastPick = key;
    this.syncPicks();
  }
  selectAll() {
    this.pieces.forEach((p) => this.selected.add(p.kind + ":" + p.id));
    this.syncPicks();
  }
  // Select by key, also ones that aren't loaded (everything a search found, not only the first pages)
  selectKeys(keys) {
    keys.forEach((k) => this.selected.add(k));
    this.syncPicks();
  }
  clearSelection() {
    this.selected.clear();
    this.syncPicks();
  }
  syncPicks() {
    this.nodes.forEach((n, k) => {
      const on = this.selected.has(k);
      n.classList.toggle("is-picked", on);
      const pick = n.querySelector(".kb-pick");
      if (pick) pick.setAttribute("aria-checked", on);
    });
    this.el.classList.toggle("is-selecting", this.selected.size > 0);
    this.emitSelect();
  }
  emitSelect() {
    this.opts.onSelect && this.opts.onSelect(this.selected, this);
  }
  // The selected ones: loaded pieces, and bare ones (kind, id) for selected items that were never loaded
  selectedPieces() {
    const have = new Set();
    const out = this.pieces.filter((p) => this.selected.has(p.kind + ":" + p.id) && have.add(p.kind + ":" + p.id));
    this.selected.forEach((k) => {
      if (have.has(k)) return;
      const [kind, id] = k.split(":");
      out.push({ kind, id, title: "#" + id, thumb: null, bare: true });
    });
    return out;
  }

  // ---------- Events ----------

  bind() {
    this.el.addEventListener("click", (e) => {
      const n = e.target.closest(".kb-piece");
      if (!n || !this.el.contains(n)) return;
      const xa = e.target.closest("[data-xact]");
      if (xa && n._piece && n._piece.foreign) {
        // a button of an extension's card: it runs, the card's link doesn't open; it may answer with a menu
        e.preventDefault();
        e.stopPropagation();
        const act = (n._piece.actions || [])[Number(xa.dataset.xact)];
        if (!act || typeof act.run !== "function") return;
        Promise.resolve()
          .then(() => act.run(n))
          .then((items) => Array.isArray(items) && items.length && menu(xa, items.map((it) => ({ label: it.label, detail: it.detail, disabled: it.disabled, run: it.run }))))
          .catch((err) => errorToast(err, "Action failed"));
        return;
      }
      if (n._piece && n._piece.foreign) return; // an extension's card: its link opens in a new tab
      const key = n.dataset.key;
      if (e.target.closest(".kb-pick") || this.selected.size || e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.toggle(key, e.shiftKey);
        return;
      }
      e.preventDefault();
      const i = this.pieces.findIndex((p) => p.kind + ":" + p.id === key);
      this.opts.onOpen && this.opts.onOpen(this.pieces[i], i, this);
    });
    // the icon buttons of a card: the mouse resting on one (or a click, on touch screens) opens its list
    const popPiece = (b) => {
      const c = b.closest(".kb-scard");
      return c && this.pieces.find((q) => q.kind + ":" + q.id === c.dataset.key);
    };
    this.el.addEventListener("pointerover", (e) => {
      const b = e.target.closest && e.target.closest("[data-pop]");
      if (!b || e.pointerType === "touch") return;
      clearTimeout(scPopHide);
      if (scPopFor === b) return;
      clearTimeout(scPopTimer);
      scPopTimer = setTimeout(() => {
        const p = popPiece(b);
        if (p) openScPop(b, p);
      }, 150);
    });
    this.el.addEventListener("pointerout", (e) => {
      const b = e.target.closest && e.target.closest("[data-pop]");
      if (b && !b.contains(e.relatedTarget)) {
        clearTimeout(scPopTimer);
        scPopHide = setTimeout(closeScPop, 250);
      }
    });
    this.el.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest("[data-pop]");
      if (!b) return;
      e.preventDefault();
      if (scPopFor === b) return closeScPop();
      const p = popPiece(b);
      if (p) openScPop(b, p);
    });
    window.addEventListener("scroll", closeScPop, true);
    this.el.addEventListener("pointerover", (e) => {
      const n = e.target.closest(".kb-piece");
      if (!n || n === this.hoverNode) return;
      this.hoverNode = n;
      this.stopPreview();
      const p = n._piece;
      if (!p || !p.preview || !previewsOn()) return;
      this.previewTimer = setTimeout(() => this.startPreview(n, p), 280);
    });
    this.el.addEventListener("pointerleave", () => {
      this.hoverNode = null;
      this.stopPreview();
    });
    this.el.addEventListener("pointerout", (e) => {
      const n = e.target.closest(".kb-piece");
      if (n && !n.contains(e.relatedTarget)) {
        if (this.hoverNode === n) this.hoverNode = null;
        this.stopPreview();
      }
    });
  }

  startPreview(n, p) {
    if (p.previewImg) {
      const img = document.createElement("img");
      img.className = "kb-piece-anim";
      img.alt = "";
      img.onload = () => n.classList.add("is-previewing");
      img.src = p.preview;
      n.appendChild(img);
      this.previewEl = img;
      this.previewNode = n;
      return;
    }
    const v = document.createElement("video");
    const vol = store.get("player", {}).volume;
    v.muted = !store.get("previewSound", true) || store.get("player", {}).muted === true;
    v.volume = vol == null ? 0.8 : vol;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = p.preview;
    v.addEventListener("playing", () => n.classList.add("is-previewing"), { once: true });
    n.appendChild(v);
    // Browsers only allow sound after the first click on the page – until then: silent
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
    this.previewEl = v;
    this.previewNode = n;
  }
  stopPreview() {
    clearTimeout(this.previewTimer);
    if (this.previewEl) {
      if (this.previewEl.pause) {
        this.previewEl.pause();
        this.previewEl.removeAttribute("src");
        this.previewEl.load();
      }
      this.previewEl.remove();
      this.previewNode && this.previewNode.classList.remove("is-previewing");
      this.previewEl = this.previewNode = null;
    }
  }
}
