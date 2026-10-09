(function () {
  "use strict";
  if (window.MediaStorm) return;

  // ==========================================================================
  // Settings
  // ==========================================================================

  // Is this script running in its own storm tab (stage.html) or in the normal Stash interface?
  const IS_STAGE = document.documentElement.hasAttribute("data-ms-stage");
  const STAGE_PATH = "/plugin/mediaStorm/assets/stage.html";

  const LS_SETTINGS = "mediaStorm.settings.v1";
  const LS_PRESETS = "mediaStorm.presets.v1";

  const DEFAULTS = {
    glass: true, // liquid glass look for the panel and the buttons on the stage
    // Timing & amount
    intervalSec: 4,
    batchSize: 3,
    firstBatch: 6,
    maxItems: 30,
    endless: false,
    // Mix & Video
    videoPct: 30,
    markerPct: 0, // share of the videos that are marker clips (0 = off)
    loop: true,
    volume: 40,
    audioMode: "all", // all | hover | newest | mute
    randomStart: true,
    videoSource: "stream", // stream | preview
    streamLimit: 0, // full videos from Stash at once; 0 = automatic (measured while it runs)
    // Layout
    layout: "chaos", // chaos | pile | grid | mosaic | spotlight | spiral | ticker | rain
    sizeMin: 18,
    sizeMax: 34,
    rotation: 8,
    aspect: "orig", // orig | square | portrait | landscape
    frame: "soft", // soft | none | polaroid | manga | neon | circle
    gap: 6, // spacing in grid, mosaic, ticker
    columns: 0, // 0 = automatic (grid, mosaic)
    avoidOverlap: false, // chaos: prefer free spots
    flowSpeed: 110, // px/s for ticker and rain
    // Effects
    fadeMs: 700,
    kenBurns: true,
    fxEnter: "zoom", // zoom | fade | slam | flip | fall | spin | glitch | random
    fxMotion: "none", // none | drift | breathe | wobble | random
    fxBlend: "normal", // normal | screen | difference
    fxPulse: 0, // BPM, 0 = off
    fxHue: 0, // 0 = off, 1–10 speed
    fxGlitch: 0, // 0 = off, 1–10 frequency
    fxTexture: "none", // none | grain | vhs | halftone | vignette
    fxMirror: false,
    fx3d: false,
    fxFlash: false,
    fxShake: false,
    // Look
    imageQuality: "full", // full | thumb
    dim: 40,
    blur: 0,
    showHud: true,
    artOn: false, // artwork images in the panel cover, start screen and empty states
    artName: "", // tag and/or folder with this name
    // Source & filters
    source: "library", // library | context | playlist (a smart playlist from Stash UI)
    playlist: "", // its id
    includeTags: [],
    excludeTags: [],
    tagMatchAll: false,
    markerTags: [], // [{ id, name }] – only marker clips with one of these tags (primary or extra)
    tagTarget: "scene", // which list the tag box edits: scene (scenes and images) | marker (marker clips)
    tagsDeep: false, // tags also count with their sub-tags (recursive) – for scenes, images and marker clips alike
    perfs: [], // [{ id, name }]
    perfMatchAll: false,
    minRating: 0,
    favPerformers: false,
    maxRes: "any", // any | 720 | 1080 | 1440 – lower runs smoother
    minLen: 0, // videos at least … seconds
    folders: [], // [{ id, path }] – including subfolders
    // RedGifs
    rgPct: 0, // share of items coming from RedGifs (0 = off)
    rgPicks: [], // [{ type: "niche" | "tag" | "user", id, name, count }] – empty = trending
    rgOrder: "trending", // trending | top7 | top28 | top | latest
    rgQuality: "sd", // sd | hd (playback only – downloads are always HD)
    rgDlDir: "", // empty = <first Stash library>/RedGifs
    rgDlLayout: "source", // source | creator | flat
    // On the beat: waves come on the beat of a song
    beatSync: false,
    beatEvery: 0, // 0 = automatic by loudness, otherwise every n beats
    songVol: 70,
    songName: "", // display only – the file lives in IndexedDB
    songId: 0, // changes with every newly chosen song
    // Extras
    sleepMin: 0,
    autoBgEvery: 0,
  };

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* storage full/blocked – never mind */ }
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function normalizeSettings(raw) {
    const s = Object.assign(clone(DEFAULTS), raw || {});
    if (!Array.isArray(s.includeTags)) s.includeTags = [];
    if (!Array.isArray(s.excludeTags)) s.excludeTags = [];
    if (!Array.isArray(s.markerTags)) s.markerTags = [];
    // 2.6.0 had the recursive switch for marker clips only; now one switch for everything
    if (raw && raw.markerTagsDeep && raw.tagsDeep == null) s.tagsDeep = true;
    delete s.markerTagsDeep;
    if (s.tagTarget !== "scene" && s.tagTarget !== "marker") s.tagTarget = s.markerTags.length && !s.includeTags.length ? "marker" : "scene";
    if (!Array.isArray(s.perfs)) s.perfs = [];
    if (!Array.isArray(s.folders)) s.folders = [];
    // Carry old text fields (search terms/creator) over into the new picker
    if (raw && !Array.isArray(raw.rgPicks) && (raw.rgSearch || raw.rgUser)) {
      String(raw.rgSearch || "").split(",").map((t) => t.trim()).filter(Boolean)
        .forEach((t) => s.rgPicks.push({ type: "tag", id: t, name: t }));
      const u = String(raw.rgUser || "").trim().replace(/^@/, "");
      if (u) s.rgPicks.push({ type: "user", id: u, name: u });
    }
    if (!Array.isArray(s.rgPicks)) s.rgPicks = [];
    if (typeof s.rgDlDir !== "string") s.rgDlDir = "";
    if (typeof s.artName !== "string") s.artName = DEFAULTS.artName;
    if (!["chaos", "pile", "grid", "mosaic", "spotlight", "spiral", "ticker", "rain"].includes(s.layout)) s.layout = DEFAULTS.layout;
    delete s.maxStreams; // 2.3.0's fixed limit – replaced by streamLimit (automatic)
    delete s.rgSearch;
    delete s.rgUser;
    return s;
  }

  let S = normalizeSettings(store.get(LS_SETTINGS, {}));
  const save = () => store.set(LS_SETTINGS, S);
  // Liquid glass: a class on the page, the CSS does the rest
  const applyGlass = () => document.documentElement.classList.toggle("ms-glass", S.glass !== false);
  applyGlass();

  // Languages: the texts are English in the code; a dictionary (mediaStorm-zh.js) swaps them as they are
  // shown – only inside Media Storm's own parts of the page. The language follows Stash UI's choice
  // ("stashui.lang"), with "automatic" Stash's interface language.
  (function startI18n() {
    const locales = window.MediaStormLocales || {};
    const ROOTS = ".ms-panel, .ms-overlay, .ms-toasts, .ms-nav-btn";
    // Names from the library stay as they are: tags, folders, song, own presets, RedGifs picks
    const DATA = ".ms-title, .ms-chip, .ms-fn-label, .ms-sug:not(.ms-none), .ms-sug-rich, [data-songname], [data-preset]"; // + the logo
    const ATTRS = ["title", "placeholder", "aria-label"];
    async function language() {
      let pick = "auto";
      try {
        pick = localStorage.getItem("stashui.lang") || "auto";
      } catch (e) { /* blocked */ }
      if (pick !== "auto") return pick;
      let l = "";
      try {
        l = (await gql("query { configuration { interface { language } } }")).configuration.interface.language || "";
      } catch (e) { /* older Stash */ }
      l = String(l || navigator.language || "").toLowerCase();
      if (/^zh[-_](cn|sg|hans)/.test(l) || l === "zh") return "zh-CN";
      const m = l.match(/^(ja|vi|fr|es|de|pl)(?![a-z])/);
      return m ? m[1] : "en";
    }
    function run({ texts, patterns, sep = "、" }) {
      const exact = new Map(Object.entries(texts));
      const pats = patterns.map(([re, out]) => [new RegExp("^" + re + "$"), out]);
      const neutral = (p) => !/[a-z]{2,}/.test(p);
      const tr = (raw, depth) => {
        depth = depth || 0;
        const s = raw.replace(/\s+/g, " ").trim();
        if (!s || !/[A-Za-z]/.test(s) || depth > 4) return null;
        if (exact.has(s)) return exact.get(s);
        for (const [re, out] of pats) {
          const m = s.match(re);
          if (m) return out.replace(/\$(\d)/g, (x, i) => (m[+i] == null ? "" : tr(m[+i], depth + 1) ?? m[+i]));
        }
        for (const [by, join] of [[" · ", " · "], [", ", sep]]) {
          if (!s.includes(by)) continue;
          const parts = s.split(by).map((p) => tr(p, depth + 1) ?? (neutral(p) ? p : null));
          if (parts.every((p) => p != null)) return parts.join(join);
        }
        return null;
      };
      const doText = (n) => {
        const p = n.parentElement;
        if (!p || p.tagName === "SCRIPT" || p.tagName === "STYLE" || !p.closest(ROOTS) || p.closest(DATA)) return;
        const v = n.nodeValue;
        const out = tr(v);
        if (out != null && out !== v.trim()) n.nodeValue = v.match(/^\s*/)[0] + out + v.match(/\s*$/)[0];
      };
      const doEl = (el) => {
        if (!el.closest || !el.closest(ROOTS) || el.matches(DATA)) return;
        for (const a of ATTRS) {
          const v = el.getAttribute(a);
          if (v) {
            const out = tr(v);
            if (out != null && out !== v) el.setAttribute(a, out);
          }
        }
      };
      const walk = (node) => {
        if (node.nodeType === 3) return doText(node);
        if (node.nodeType !== 1) return;
        const inside = node.closest(ROOTS);
        const roots = inside ? [node] : [...node.querySelectorAll(ROOTS)];
        roots.forEach((r) => {
          doEl(r);
          const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
          for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? doText(n) : doEl(n);
        });
      };
      walk(document.body);
      new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === "characterData") doText(m.target);
          else if (m.type === "attributes") doEl(m.target);
          else m.addedNodes.forEach(walk);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    language().then((code) => locales[code] && run(locales[code])).catch(() => {});
  })();

  // ==========================================================================
  // Helpers
  // ==========================================================================

  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // A hidden/minimized window can report 0×0 – then calculate with a sensible size.
  const viewW = () => innerWidth || document.documentElement.clientWidth || screen.width || 1280;
  const viewH = () => innerHeight || document.documentElement.clientHeight || screen.height || 720;
  const seed = () => "random_" + Math.floor(Math.random() * 1e9);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async function gql(query, variables) {
    const res = await fetch("/graphql", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors && json.errors.length) throw new Error(json.errors.map((e) => e.message).join("; "));
    return json.data;
  }

  const ICONS = {
    bolt: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z" fill="currentColor"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
    pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor"/>',
    stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.5" fill="currentColor"/>',
    next: '<path d="M5 5v14l10-7zM16.5 5H19v14h-2.5z" fill="currentColor"/>',
    dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><g fill="currentColor"><circle cx="8.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="8.5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="8.5" cy="15.5" r="1.5"/><circle cx="15.5" cy="15.5" r="1.5"/></g>',
    sliders: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></g>',
    close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    open: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></g>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    image: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></g><circle cx="15.5" cy="9" r="1.6" fill="currentColor"/>',
    film: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M8 4.5v15M16 4.5v15M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5"/></g>',
    download: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    spinner: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    clock: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></g>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/>',
    grid: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="10" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="16.5" width="7" height="4" rx="1.5"/></g>',
    sparkle: '<path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5zM19 15.5c.3 2 1.2 2.9 3 3.2-1.8.3-2.7 1.2-3 3.3-.3-2.1-1.2-3-3-3.3 1.8-.3 2.7-1.2 3-3.2z" fill="currentColor"/>',
    speaker: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></g>',
    filter: '<path d="M4 5h16l-6.2 7.5V19l-3.6-1.8v-4.7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    folder: '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.3l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    bookmark: '<path d="M6.5 3.5h11v17L12 16.5l-5.5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    keyboard: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5" stroke-linejoin="round"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/></g>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    wave: '<path d="M3 12c2.2-4 4.3-4 6.5 0s4.3 4 6.5 0 3.5-4 5 -2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  };
  const icon = (name) => `<svg class="ms-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  // ---------- Toasts ----------

  let toastBox = null;
  const toastByKey = {};
  function toast(msg, key) {
    if (!toastBox || !toastBox.isConnected) {
      toastBox = document.createElement("div");
      toastBox.className = "ms-toasts";
      document.body.appendChild(toastBox);
    }
    let t = key && toastByKey[key];
    if (t && t.el.isConnected) {
      clearTimeout(t.timer);
      t.el.classList.remove("ms-gone");
    } else {
      t = { el: document.createElement("div") };
      t.el.className = "ms-toast";
      toastBox.appendChild(t.el);
      if (key) toastByKey[key] = t;
    }
    t.el.textContent = msg;
    t.timer = setTimeout(() => {
      t.el.classList.add("ms-gone");
      setTimeout(() => t.el.remove(), 450);
    }, 2600);
  }

  // ==========================================================================
  // Source & filters
  // ==========================================================================

  const CTX_TYPES = {
    performers: { label: "Performer", query: "findPerformer", field: "name" },
    studios: { label: "Studio", query: "findStudio", field: "name" },
    tags: { label: "Tag", query: "findTag", field: "name" },
    galleries: { label: "Gallery", query: "findGallery", field: "title" },
    groups: { label: "Group", query: "findGroup", field: "name" },
  };

  // Same page detection as the Random Backgrounds plugin.
  // The route name is also the name of the filter field in GraphQL.
  function pageContext() {
    // In Stash UI the app provides the current page (tag, gallery)
    if (!IS_STAGE && typeof window.StashUIContext === "function") return window.StashUIContext();
    if (IS_STAGE) {
      const p = (new URLSearchParams(location.search).get("ctx") || "").match(/^(performers|studios|tags|galleries|groups):(\d+)$/);
      return p ? { field: p[1], id: p[2] } : null;
    }
    const m = location.pathname.match(/^\/(performers|studios|tags|galleries|groups)\/(\d+)/);
    return m ? { field: m[1], id: m[2] } : null;
  }

  async function describeContext(ctx) {
    const t = CTX_TYPES[ctx.field];
    try {
      const d = await gql(`query($id: ID!) { x: ${t.query}(id: $id) { ${t.field} } }`, { id: ctx.id });
      return `${t.label}: ${(d.x && d.x[t.field]) || "#" + ctx.id}`;
    } catch (e) {
      return `${t.label} #${ctx.id}`;
    }
  }

  // kind: "image" | "scene". Returns null if the filter isn't possible for this type.
  // Note: Stash doesn't reliably evaluate the same field in nested AND/OR filters,
  // so the tag page and the tag filter are merged into a single tags criterion.
  // Smart playlists from Stash UI (its plugin settings) – the same filter logic as its lists
  let msPlaylists = null;
  let msFavId;
  async function loadMsPlaylists() {
    try {
      const d = await gql(`query { configuration { plugins(include: ["stashui"]) } }`);
      const cfg = (d.configuration.plugins || {}).stashui || {};
      const list = JSON.parse(cfg.playlists || "[]");
      msPlaylists = Array.isArray(list) ? list.filter((p) => p && p.id && p.query) : [];
    } catch (e) {
      msPlaylists = [];
    }
    if (msFavId === undefined) {
      try {
        const d = await gql(`query { findTags(tag_filter: { name: { value: "Favorite", modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id } } }`);
        msFavId = (d.findTags.tags[0] || {}).id || null;
      } catch (e) {
        msFavId = null;
      }
    }
    return msPlaylists;
  }
  function playlistFilter(kind) {
    const pl = (msPlaylists || []).find((p) => p.id === S.playlist);
    if (!pl || (pl.kind === "image" ? "image" : "scene") !== kind) return null; // a playlist is one kind
    const q = pl.query;
    const list = (v) => String(v || "").split(",").filter(Boolean);
    const f = {};
    const inc = list(q.tags);
    const exc = list(q.xtags);
    if (q.fav === "1" && msFavId) inc.push(msFavId);
    if (inc.length || exc.length) {
      f.tags = { value: inc, modifier: "INCLUDES_ALL", depth: 0 };
      if (exc.length) f.tags.excludes = exc;
    }
    if (list(q.perfs).length) f.performers = { value: list(q.perfs), modifier: q.pany === "1" ? "INCLUDES" : "INCLUDES_ALL" };
    if (list(q.studios).length) f.studios = { value: list(q.studios), modifier: "INCLUDES", depth: -1 };
    if (Number(q.rating)) f.rating100 = { value: Number(q.rating) * 20 - 1, modifier: "GREATER_THAN" };
    if (kind === "scene") {
      if (q.played === "yes") f.play_count = { value: 0, modifier: "GREATER_THAN" };
      if (q.played === "no") f.play_count = { value: 0, modifier: "EQUALS" };
      if (q.played === "resume") f.resume_time = { value: 5, modifier: "GREATER_THAN" };
      if (q.res) f.resolution = { value: q.res, modifier: "GREATER_THAN" };
      if (q.len === "short") f.duration = { value: 60, modifier: "LESS_THAN" };
      if (q.len === "mid") f.duration = { value: 60, value2: 600, modifier: "BETWEEN" };
      if (q.len === "long") f.duration = { value: 600, modifier: "GREATER_THAN" };
      if (q.ia) f.interactive = q.ia === "yes";
    }
    if (q.ori) f.orientation = { value: [q.ori] };
    if (q.q) f.title = { value: q.q, modifier: "INCLUDES" };
    return f;
  }
  const MAX_RES = { 720: "FULL_HD", 1080: "QUAD_HD", 1440: "VR_HD" }; // "up to …" = below the next size

  function buildFilter(kind) {
    if (S.source === "playlist") return playlistFilter(kind);
    const f = {};
    const ctx = run.ctx;
    if (ctx) {
      if (kind === "image" && ctx.field === "groups") return null; // images have no groups
      if (ctx.field !== "tags") f[ctx.field] = { value: [ctx.id], modifier: "INCLUDES" };
    }
    const ctxTag = ctx && ctx.field === "tags" ? ctx.id : null;
    const inc = S.includeTags.map((t) => t.id).filter((id) => id !== ctxTag);
    const exc = S.excludeTags.map((t) => t.id);
    if (ctxTag || inc.length || exc.length) {
      let crit;
      if (ctxTag) crit = { value: [ctxTag, ...inc], modifier: "INCLUDES_ALL" };
      else if (inc.length) crit = { value: inc, modifier: S.tagMatchAll ? "INCLUDES_ALL" : "INCLUDES" };
      else crit = { value: [], modifier: "INCLUDES_ALL" };
      if (exc.length) crit.excludes = exc;
      if (S.tagsDeep) crit.depth = -1; // (sub-tags count too – also for the excluded ones)
      f.tags = crit;
    }
    if (S.minRating > 0) f.rating100 = { value: S.minRating * 20 - 1, modifier: "GREATER_THAN" };
    if (S.favPerformers) f.performer_favorite = true;
    if (S.perfs.length) {
      // On a performer's page that performer stays in: then all of them together
      const page = f.performers ? f.performers.value : [];
      f.performers = page.length
        ? { value: [...new Set([...page, ...S.perfs.map((p) => p.id)])], modifier: "INCLUDES_ALL" }
        : { value: S.perfs.map((p) => p.id), modifier: S.perfMatchAll ? "INCLUDES_ALL" : "INCLUDES" };
    }
    if (MAX_RES[S.maxRes]) f.resolution = { value: MAX_RES[S.maxRes], modifier: "LESS_THAN" };
    if (kind === "scene" && S.minLen > 0) f.duration = { value: S.minLen, modifier: "GREATER_THAN" };
    if (S.folders.length) {
      f.files_filter = { parent_folder: { value: S.folders.map((x) => x.id), modifier: "INCLUDES", depth: -1 } };
    }
    return f;
  }

  const Q_IMAGES = `query MSImages($f: FindFilterType, $i: ImageFilterType) {
    findImages(filter: $f, image_filter: $i) {
      count
      images {
        id title
        paths { image thumbnail }
        visual_files { __typename ... on ImageFile { width height } ... on VideoFile { width height format video_codec } }
      }
    }
  }`;

  const Q_SCENES = `query MSScenes($f: FindFilterType, $s: SceneFilterType) {
    findScenes(filter: $f, scene_filter: $s) {
      count
      scenes {
        id title
        files { width height duration }
        paths { stream preview screenshot }
      }
    }
  }`;

  // Marker clips: the short moments marked in a scene. Stash cuts the clip itself (stream), plus a small preview.
  const Q_MARKERS = `query MSMarkers($f: FindFilterType, $m: SceneMarkerFilterType) {
    findSceneMarkers(filter: $f, scene_marker_filter: $m) {
      count
      scene_markers {
        id title seconds
        stream preview screenshot
        primary_tag { name }
        scene { id title files { width height duration } }
      }
    }
  }`;

  function normMarker(x) {
    const sc = x.scene || {};
    const f = (sc.files || [])[0] || {};
    const mp4 = `/scene/${sc.id}/scene_marker/${x.id}/stream`;
    const order = S.videoSource === "preview" ? [x.preview, x.stream, mp4] : [x.stream, mp4, x.preview];
    return {
      kind: "scene",
      marker: true,
      key: "m" + x.id,
      id: sc.id,
      title: x.title || (x.primary_tag && x.primary_tag.name) || sc.title,
      w: f.width || 16,
      h: f.height || 9,
      sources: [...new Set(order.filter(Boolean))],
      preview: x.preview,
      poster: x.screenshot,
      href: `/scenes/${sc.id}?t=${Math.floor(x.seconds || 0)}`,
    };
  }

  function normImage(x) {
    const vf = (x.visual_files || [])[0] || {};
    // animated images (webm/mp4 as an image) play as video – but a GIF (Stash files it as a video file
    // with codec "gif", yet serves the GIF) is an image that moves by itself
    const gif = vf.__typename === "VideoFile" && (/gif/i.test(vf.format || "") || /gif/i.test(vf.video_codec || ""));
    const isVid = vf.__typename === "VideoFile" && !gif;
    const p = x.paths || {};
    return {
      kind: "image",
      key: "i" + x.id,
      id: x.id,
      title: x.title,
      w: vf.width || 3,
      h: vf.height || 4,
      isVid,
      src: isVid || gif || S.imageQuality === "full" ? p.image : p.thumbnail,
      alt: p.thumbnail,
      href: "/images/" + x.id,
    };
  }

  function normScene(x) {
    const f = (x.files || [])[0] || {};
    const p = x.paths || {};
    const mp4 = `/scene/${x.id}/stream.mp4`; // transcode fallback for e.g. HEVC
    const order = S.videoSource === "preview" ? [p.preview, p.stream, mp4] : [p.stream, mp4, p.preview];
    return {
      kind: "scene",
      key: "s" + x.id,
      id: x.id,
      title: x.title,
      w: f.width || 16,
      h: f.height || 9,
      sources: order.filter(Boolean),
      preview: p.preview,
      poster: p.screenshot,
      href: "/scenes/" + x.id,
    };
  }

  // n random marker clips (tags from "Only marker clips with tags"; the other filters apply to their scenes)
  async function fetchMarkers(n) {
    if (n <= 0 || run.empty.marker) return [];
    if (S.source === "playlist" && !msPlaylists) await loadMsPlaylists();
    const scene = buildFilter("scene");
    if (scene === null) {
      run.empty.marker = true;
      return [];
    }
    const m = {};
    // Tags on the marker itself (primary or extra); the exclude tags and both switches are the same as for scenes
    if (S.markerTags.length || S.excludeTags.length) {
      const own = S.markerTags.map((t) => t.id);
      m.tags = { value: own, modifier: S.tagMatchAll && own.length > 1 ? "INCLUDES_ALL" : own.length ? "INCLUDES" : "INCLUDES_ALL", depth: S.tagsDeep ? -1 : 0 };
      if (S.excludeTags.length) m.tags.excludes = S.excludeTags.map((t) => t.id);
    }
    if (Object.keys(scene).length) m.scene_filter = scene;
    const session = run.session;
    let data;
    try {
      data = (await gql(Q_MARKERS, { f: { per_page: Math.min(n * 2 + 4, 60), sort: seed() }, m })).findSceneMarkers;
    } catch (e) {
      console.error("[MediaStorm]", e);
      toast("GraphQL error: " + e.message, "gqlerr");
      run.empty.marker = true;
      return [];
    }
    if (session !== run.session) return [];
    if (!data || !data.count) {
      run.empty.marker = true;
      return [];
    }
    const list = data.scene_markers.map(normMarker);
    const fresh = list.filter((d) => !run.onScreen.has(d.key));
    const picked = (fresh.length >= n ? fresh : fresh.concat(list.filter((d) => !fresh.includes(d)))).slice(0, n);
    picked.forEach((d) => run.onScreen.add(d.key));
    return picked;
  }

  // Fetches n random media (new random seed per call) and reserves them against duplicates.
  async function fetchMedia(kind, n) {
    if (n <= 0 || run.empty[kind]) return [];
    if (S.source === "playlist" && !msPlaylists) await loadMsPlaylists();
    const filter = buildFilter(kind);
    if (filter === null) {
      run.empty[kind] = true;
      return [];
    }
    const session = run.session;
    const f = { per_page: Math.min(n * 2 + 4, 60), sort: seed() };
    let data;
    try {
      data = kind === "image"
        ? (await gql(Q_IMAGES, { f, i: filter })).findImages
        : (await gql(Q_SCENES, { f, s: filter })).findScenes;
    } catch (e) {
      console.error("[MediaStorm]", e);
      toast("GraphQL error: " + e.message, "gqlerr");
      return [];
    }
    if (session !== run.session) return [];
    if (!data || !data.count) {
      run.empty[kind] = true;
      return [];
    }
    const list = (kind === "image" ? data.images : data.scenes).map(kind === "image" ? normImage : normScene);
    const fresh = list.filter((d) => !run.onScreen.has(d.key));
    // If the pool is smaller than the screen, duplicates are allowed.
    const pool = fresh.length >= n ? fresh : fresh.concat(list.filter((d) => !fresh.includes(d)));
    const picked = pool.slice(0, n);
    picked.forEach((d) => run.onScreen.add(d.key));
    return picked;
  }

  // ==========================================================================
  // RedGifs
  // The API allows calls from localhost (CORS). The video URLs refuse foreign
  // referrers – that's why stage.html sets "no-referrer". The Stash interface itself
  // blocks external sources via CSP, so RedGifs only runs in the storm tab.
  // ==========================================================================

  const RG_API = "https://api.redgifs.com/v2";
  const LS_RG = "mediaStorm.redgifs.v1";
  const RG_PAGE = 80;
  const RG_MAX_PAGES = 50;
  const rg = { pools: {}, seen: new Set(), tokenPromise: null, viaBackend: false };

  function rgReset() {
    rg.pools = {};
    rg.seen.clear();
    run.empty.redgifs = false;
  }

  async function rgToken(force) {
    if (!force) {
      const cached = store.get(LS_RG, null);
      if (cached && cached.token && cached.exp > Date.now()) return cached.token;
    }
    if (!rg.tokenPromise) {
      rg.tokenPromise = (async () => {
        const res = await fetch(RG_API + "/auth/temporary", { credentials: "omit", referrerPolicy: "no-referrer" });
        if (!res.ok) throw new Error("Token HTTP " + res.status);
        const j = await res.json();
        store.set(LS_RG, { token: j.token, exp: Date.now() + 20 * 3600 * 1000 });
        return j.token;
      })().finally(() => (rg.tokenPromise = null));
    }
    return rg.tokenPromise;
  }

  // Detour through the Python backend: used when the browser can't reach the API itself
  // (Stash opened via a network address/domain – the API only allows CORS from localhost –
  // or an ad blocker/DNS filter in the way). Remembered for the rest of the page's life.
  async function rgGetViaBackend(path) {
    const d = await gql(`mutation($args: Map) { runPluginOperation(plugin_id: "mediaStorm", args: $args) }`, {
      args: { mode: "api", path },
    });
    const out = d && d.runPluginOperation;
    if (!out) throw new Error("no answer from the plugin backend (Reload plugins in Stash?)");
    if (out.error && !out.status) throw new Error(out.error);
    if (out.status) {
      const err = new Error(out.error || "HTTP " + out.status);
      err.status = out.status;
      throw err;
    }
    return out.data;
  }

  async function rgGet(path) {
    if (rg.viaBackend) return rgGetViaBackend(path);
    try {
      return await rgGetDirect(path);
    } catch (e) {
      // fetch() itself failed ("Failed to fetch") – no HTTP status means no answer reached us
      if (e && !e.status && (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e.message))) {
        console.warn("[MediaStorm] RedGifs not reachable from the browser, using the backend", e);
        rg.viaBackend = true;
        return rgGetViaBackend(path);
      }
      throw e;
    }
  }

  async function rgGetDirect(path) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await rgToken(attempt > 0);
      const res = await fetch(RG_API + path, {
        headers: { Authorization: "Bearer " + token },
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (res.status === 401 || res.status === 403) continue; // token expired → fetch a new one
      if (!res.ok) {
        let msg = "HTTP " + res.status;
        let code = "";
        try {
          const j = await res.json();
          if (j.error) {
            code = j.error.code || "";
            msg = j.error.message || msg;
          }
        } catch (e) { /* ignore */ }
        if (code === "UserNotFound") msg = "creator not found";
        else if (/NotFound/.test(code)) msg = "not found";
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }
    throw new Error("Authentication failed");
  }

  // Niche feeds know other sort orders ("trending" is broken there despite the docs).
  const RG_NICHE_ORDER = { trending: "hot", top7: "best", top28: "best", top: "best", latest: "latest" };

  // One source per chosen niche/tag/creator; one is picked at random per fetch.
  // Without a choice: trending.
  function rgSources() {
    const count = `count=${RG_PAGE}`;
    if (!S.rgPicks.length) {
      return [{ id: `t:${S.rgOrder}`, type: "trending", name: "Trending", label: "Trending", path: (p) => `/gifs/search?order=${S.rgOrder}&${count}&page=${p}` }];
    }
    return S.rgPicks.map((pick) => {
      const v = encodeURIComponent(pick.id);
      if (pick.type === "niche") {
        const order = RG_NICHE_ORDER[S.rgOrder] || "hot";
        return { id: `n:${pick.id}:${order}`, type: "niche", name: pick.name, label: pick.name, path: (p) => `/niches/${v}/gifs?order=${order}&${count}&page=${p}` };
      }
      if (pick.type === "user") {
        const order = S.rgOrder === "latest" ? "new" : "top";
        return { id: `u:${pick.id.toLowerCase()}:${order}`, type: "user", name: pick.name, label: "@" + pick.name, path: (p) => `/users/${v}/search?order=${order}&${count}&page=${p}` };
      }
      return { id: `s:${pick.id.toLowerCase()}:${S.rgOrder}`, type: "tag", name: pick.name, label: "#" + pick.name, path: (p) => `/gifs/search?search_text=${v}&order=${S.rgOrder}&${count}&page=${p}` };
    });
  }

  // ---------- Suggestions (niches, tags, creators) ----------

  // Directly in the storm tab; in the Stash interface (CSP only allows Stash) through the Python backend.
  async function rgSuggestRaw(query) {
    if (IS_STAGE) {
      const q = encodeURIComponent(query);
      const safe = (path) => rgGet(path).catch(() => null);
      const [n, sg, c] = await Promise.all([
        safe(`/niches/search?query=${q}&order=best_match&count=30`),
        safe(`/search/suggest?query=${q}`),
        safe(`/creators/search?query=${q}&count=20`),
      ]);
      return { niches: (n && n.niches) || [], suggest: Array.isArray(sg) ? sg : [], creators: (c && c.items) || [] };
    }
    const d = await gql(`mutation($args: Map) { runPluginOperation(plugin_id: "mediaStorm", args: $args) }`, {
      args: { mode: "suggest", query },
    });
    const out = d && d.runPluginOperation;
    if (!out) throw new Error("no answer from the plugin backend");
    if (out.error) throw new Error(out.error);
    return { niches: out.niches || [], suggest: out.suggest || [], creators: out.creators || [] };
  }

  // Hits whose name starts with or contains the search text first; then by popularity.
  function rgRank(raw, query) {
    const q = query.toLowerCase();
    const score = (...names) =>
      Math.max(...names.map((n) => {
        const t = String(n || "").toLowerCase();
        return t.startsWith(q) ? 2 : t.includes(q) ? 1 : 0;
      }));
    const niches = raw.niches
      .filter((n) => n && n.id)
      .map((n) => ({ type: "niche", id: n.id, name: n.name || n.id, count: n.gifs || 0, sub: n.subscribers || 0, thumb: n.thumbnail, s: score(n.name, n.id) }))
      .sort((a, b) => b.s - a.s || b.sub - a.sub)
      .slice(0, 6);
    const tags = raw.suggest
      .filter((t) => t && t.type === "tag" && t.text)
      .map((t) => ({ type: "tag", id: t.text, name: t.text, count: t.gifs || 0, s: score(t.text) }))
      .sort((a, b) => b.s - a.s || b.count - a.count)
      .slice(0, 6);
    const users = raw.creators
      .filter((u) => u && u.username)
      .map((u) => ({ type: "user", id: u.username, name: u.username, count: u.gifs || 0, sub: u.followers || 0, thumb: u.profileImageUrl, verified: u.verified, s: score(u.username, u.name) }))
      .filter((u) => u.s > 0) // the creator search is very fuzzy
      .sort((a, b) => b.s - a.s || b.sub - a.sub)
      .slice(0, 4);
    return { niches, tags, users };
  }

  function fmtNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " Mio.";
    if (n >= 1e3) return Math.round(n / 1e3) + " Tsd.";
    return String(n);
  }

  function normRedgif(g, src) {
    const u = g.urls || {};
    const isImg = g.type === 2 || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u.hd || u.sd || "");
    const hd = u.hd;
    const sd = u.sd || u.vthumbnail;
    const ordered = (S.rgQuality === "hd" ? [hd, sd] : [sd, hd]).filter(Boolean);
    return {
      kind: "redgifs",
      key: "r" + g.id,
      id: g.id,
      title: g.description || g.id,
      w: g.width || 9,
      h: g.height || 16,
      video: !isImg,
      sources: ordered,
      src: ordered[0],
      alt: u.thumbnail || u.poster,
      href: "https://www.redgifs.com/watch/" + g.id,
      hd: hd || sd, // downloads always in the best quality
      user: g.userName || "",
      desc: g.description || "",
      source: src ? { type: src.type, name: src.name } : null,
    };
  }

  async function rgRefill(src, pool) {
    let page = 1;
    if (pool.pages) {
      const max = Math.min(pool.pages, RG_MAX_PAGES);
      let free = [];
      for (let p = 1; p <= max; p++) if (!pool.tried.has(p)) free.push(p);
      if (!free.length) {
        // Went through everything once → start over, repeats allowed now
        pool.tried.clear();
        rg.seen.clear();
        free = Array.from({ length: max }, (_, i) => i + 1);
      }
      page = free[Math.floor(Math.random() * free.length)];
    }
    pool.tried.add(page);
    const data = await rgGet(src.path(page));
    const gifs = data.gifs || []; // "boosted_gifs" (ads) are ignored on purpose
    pool.pages = data.pages || 1;
    if (!gifs.length && page === 1) pool.dead = true;
    const fresh = gifs.filter((g) => g && g.urls && (g.urls.hd || g.urls.sd) && !rg.seen.has(g.id));
    pool.items.push(...shuffle(fresh.map((g) => normRedgif(g, src))));
  }

  async function fetchRedgifs(n) {
    if (n <= 0 || S.rgPct <= 0 || run.empty.redgifs) return [];
    const session = run.session;
    const sources = rgSources();
    const out = [];
    for (let guard = 0; out.length < n && guard < n * 3 + 6; guard++) {
      const live = sources.filter((x) => !(rg.pools[x.id] && rg.pools[x.id].dead));
      if (!live.length) {
        run.empty.redgifs = true;
        break;
      }
      const src = live[Math.floor(Math.random() * live.length)];
      const pool = rg.pools[src.id] || (rg.pools[src.id] = { items: [], pages: 0, tried: new Set(), dead: false, loading: null });
      if (!pool.items.length) {
        if (!pool.loading) pool.loading = rgRefill(src, pool).finally(() => (pool.loading = null));
        try {
          await pool.loading;
        } catch (e) {
          console.error("[MediaStorm] RedGifs", e);
          run.rgError = `${src.label}: ${e.message}`;
          toast("RedGifs – " + run.rgError, "rgerr");
          // Permanent errors (e.g. the creator doesn't exist) → drop the source instead of asking again every wave
          if (e.status === 400 || e.status === 404) {
            pool.dead = true;
            continue;
          }
          break;
        }
        if (session !== run.session) return [];
        continue;
      }
      const d = pool.items.pop();
      if (run.onScreen.has(d.key) || rg.seen.has(d.id)) continue;
      rg.seen.add(d.id);
      run.onScreen.add(d.key);
      out.push(d);
    }
    return out;
  }

  // ==========================================================================
  // Runtime state
  // ==========================================================================

  const run = {
    active: false,
    paused: false,
    busy: false,
    session: 0,
    items: [], // visible items, oldest first
    pending: 0, // items currently loading
    onScreen: new Set(),
    empty: { image: false, scene: false, marker: false },
    ctx: null,
    acc: 0, // error diffusion for the image/video ratio
    z: 10,
    waves: 0,
    nextAt: 0,
    pauseLeft: 0,
    sleepAt: 0,
    sleepLeft: 0,
    tick: 0,
    hovered: null,
    focused: null,
    grid: null,
    slots: [],
    fs: false,
    fsByUs: false,
    dom: null,
  };

  // ==========================================================================
  // Waves
  // ==========================================================================

  async function wave(first) {
    if (!run.active || run.paused || run.busy) return;
    run.busy = true;
    run.nextAt = Date.now() + S.intervalSec * 1000;
    const session = run.session;
    try {
      const want = first ? S.firstBatch : S.batchSize;
      const live = run.items.length + run.pending + beat.gate.length;
      let n = S.endless ? want : Math.min(want, S.maxItems - live);
      if (S.endless && run.pending >= S.maxItems) n = 0;
      if (n <= 0) return;

      // First the RedGifs share, then split the Stash part into images/videos (error diffusion each).
      let nRg = 0;
      if (S.rgPct > 0) {
        for (let k = 0; k < n; k++) {
          run.accRg += S.rgPct / 100;
          if (run.accRg >= 1) {
            nRg++;
            run.accRg -= 1;
          }
        }
      }
      const nStash = n - nRg;
      let nVid = 0;
      for (let k = 0; k < nStash; k++) {
        run.acc += S.videoPct / 100;
        if (run.acc >= 1) {
          nVid++;
          run.acc -= 1;
        }
      }
      const nImg = nStash - nVid;
      let nMk = 0;
      if (S.markerPct > 0) {
        for (let k = 0; k < nVid; k++) {
          run.accMk = (run.accMk || 0) + S.markerPct / 100;
          if (run.accMk >= 1) {
            nMk++;
            run.accMk -= 1;
          }
        }
      }

      const got = [].concat(...(await Promise.all([fetchMedia("image", nImg), fetchMedia("scene", nVid - nMk), fetchMarkers(nMk), fetchRedgifs(nRg)])));
      // If something is missing (no videos on this page, RedGifs unreachable …), fill up from the other sources.
      const fillers = S.rgPct >= 100 ? ["redgifs"] : S.rgPct > 0 ? ["image", "scene", "redgifs"] : S.markerPct >= 100 ? ["marker", "scene", "image"] : ["image", "scene"];
      for (const kind of fillers) {
        const missing = n - got.length;
        if (missing <= 0 || session !== run.session) break;
        got.push(...(kind === "redgifs" ? await fetchRedgifs(missing) : kind === "marker" ? await fetchMarkers(missing) : await fetchMedia(kind, missing)));
      }
      if (session !== run.session) return;

      const batch = shuffle(got);
      if (!batch.length) {
        const stashDead = S.rgPct >= 100 || (run.empty.image && run.empty.scene && (S.markerPct <= 0 || run.empty.marker));
        const rgDead = S.rgPct <= 0 || run.empty.redgifs;
        if (stashDead && rgDead) {
          if (S.rgPct >= 100 && run.rgError) stop("RedGifs: " + run.rgError);
          else stop("No media found for this source/filter", true);
        }
        return;
      }
      run.pending += batch.length;
      batch.forEach((d, i) => setTimeout(() => addItem(d, session), i * 160));
      if (!first && !beatActive()) setTimeout(fxWave, 250);

      run.waves++;
      if (S.autoBgEvery > 0 && run.waves % S.autoBgEvery === 0) rerollBackground(true);
    } catch (e) {
      console.error("[MediaStorm]", e);
    } finally {
      run.busy = false;
    }
  }

  function tick() {
    const now = Date.now();
    if (!run.paused) {
      if (run.sleepAt && now >= run.sleepAt) {
        stop("Sleep timer ran out – good night");
        return;
      }
      // On the beat, the beat loop takes over the timing
      if (now >= run.nextAt && !beatActive()) wave(false);
      if (S.fxGlitch > 0 && Math.random() < S.fxGlitch / 30) glitchOne();
      if ((run.cullN = (run.cullN || 0) + 1) % 2 === 0) cullHidden();
    }
    updateHud();
  }

  // Videos you can't see anyway pause – almost completely covered by newer items (chaos, pile …) or
  // outside the screen (ticker, rain). Every video playing costs the graphics chip a decode per frame, and
  // with 25+ at once that is what makes it stutter. A paused, covered video looks exactly the same;
  // as soon as it comes to light again it plays on. Checked twice a second with 5×5 points per item.
  function cullHidden() {
    if (!run.dom || !run.items.length) return;
    const vw = innerWidth;
    const vh = innerHeight;
    const inset = S.frame === "circle" ? 0.15 : 0.06; // stay on the safe side at rounded/rotated edges
    const list = run.items.map((it) => ({ it, r: it.el.getBoundingClientRect(), z: +it.el.style.zIndex || 0, out: it.el.classList.contains("ms-out") }));
    for (const a of list) {
      const v = a.it.video;
      if (!v || a.it.released) continue;
      const r = a.r;
      let seen = 0;
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          const x = r.left + ((i + 0.5) * r.width) / 5;
          const y = r.top + ((j + 0.5) * r.height) / 5;
          if (x < 0 || y < 0 || x > vw || y > vh) continue;
          let covered = false;
          for (const b of list) {
            if (b === a || b.out || b.z <= a.z) continue;
            const q = b.r;
            if (x > q.left + q.width * inset && x < q.right - q.width * inset && y > q.top + q.height * inset && y < q.bottom - q.height * inset) {
              covered = true;
              break;
            }
          }
          if (!covered) seen++;
        }
      }
      const visible = seen / 25;
      if (!a.it.hiddenPause && visible < 0.12) {
        a.it.hiddenPause = true;
        v.pause();
      } else if (a.it.hiddenPause && visible > 0.2) {
        a.it.hiddenPause = false;
        playSafe(v);
      }
    }
  }


  // ==========================================================================
  // On the beat: play a song, detect beats, waves on the beat
  // ==========================================================================
  // Beat detection lives in beats.js next to this script (the same one the PMV Generator uses).
  // New items load ahead and wait ready in the "gate" (beat.gate) – on their beat they all appear at once.

  const BEATS_URL = "/plugin/mediaStorm/assets/beats.js";
  const beat = { ac: null, gain: null, src: null, song: null, startAt: 0, k: 0, timer: 0, gate: [], lastDrop: -99, session: -1, blockedHint: false };

  // Song file in IndexedDB – that's how it gets from the panel in Stash into the storm tab (same origin)
  const songDb = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open("mediaStorm", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("files");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async run(mode, fn) {
      const db = await this.open();
      try {
        return await new Promise((res, rej) => {
          const tx = db.transaction("files", mode);
          const req = fn(tx.objectStore("files"));
          tx.oncomplete = () => res(req && req.result);
          tx.onerror = tx.onabort = () => rej(tx.error);
        });
      } finally {
        db.close();
      }
    },
    get: () => songDb.run("readonly", (st) => st.get("song")),
    put: (file) => songDb.run("readwrite", (st) => st.put({ blob: file, name: file.name }, "song")),
    del: () => songDb.run("readwrite", (st) => st.delete("song")),
  };

  const beatActive = () => !!(beat.song && beat.ac && beat.ac.state === "running");

  // Hold back a fully loaded item until its beat comes
  function beatHold(it) {
    if (!beatActive() || it.session !== run.session) return false;
    beat.gate.push(it);
    return true;
  }

  async function beatStart() {
    if (!IS_STAGE || !run.active || !S.beatSync) return;
    const session = run.session;
    beat.session = session;
    let rec = null;
    try {
      rec = await songDb.get();
    } catch (e) { /* IndexedDB blocked */ }
    if (!rec || !rec.blob) {
      toast("On the beat: no song chosen yet (panel → On the beat) – waves run by time", "beat");
      return;
    }
    toast(`On the beat: detecting beats in “${rec.name}” …`, "beat");
    let song;
    try {
      const mod = await import(BEATS_URL);
      song = await mod.analyzeSong(await rec.blob.arrayBuffer());
    } catch (e) {
      console.error("[MediaStorm] on the beat", e);
      toast(/import|fetch|module/i.test(String(e)) ? "On the beat: beat detection couldn't be loaded (beats.js missing?)" : "On the beat: couldn't read the song", "beat");
      return;
    }
    if (session !== run.session || beat.session !== session || !run.active || !S.beatSync) return;
    beatStop();
    beat.session = session;
    beat.song = song;
    beat.ac = new (window.AudioContext || window.webkitAudioContext)();
    beat.gain = beat.ac.createGain();
    beat.gain.gain.value = S.songVol / 100;
    beat.gain.connect(beat.ac.destination);
    beat.lastDrop = -99;
    beatPlayFrom(0);
    if (run.paused) beat.ac.suspend();
    beat.ac.onstatechange = () => {
      applyLook();
      updateHud();
    };
    if (beat.ac.state === "suspended" && !run.paused) {
      beat.blockedHint = true;
      toast("On the beat: click or press a key to start the music", "beat");
    } else toast(`On the beat: ${Math.round(song.bpm)} BPM`, "beat");
    beat.timer = setInterval(beatLoop, 25);
    applyLook();
  }

  function beatPlayFrom(pos) {
    const src = beat.ac.createBufferSource();
    src.buffer = beat.song.buffer;
    src.connect(beat.gain);
    const at = beat.ac.currentTime + 0.05;
    src.start(at, pos);
    beat.startAt = at - pos;
    beat.src = src;
    beat.k = beat.song.beats.findIndex((b) => b >= pos - 0.01);
    if (beat.k < 0) beat.k = beat.song.beats.length;
    // Song ended → start over (pause suspends the AudioContext, so it doesn't end anything)
    src.onended = () => {
      if (beat.src === src && run.active && beat.song) beatPlayFrom(0);
    };
  }

  function beatStop() {
    clearInterval(beat.timer);
    beat.timer = 0;
    beat.session = -1;
    if (beat.src) {
      beat.src.onended = null;
      try {
        beat.src.stop();
      } catch (e) { /* already stopped */ }
    }
    if (beat.ac) beat.ac.close().catch(() => {});
    Object.assign(beat, { ac: null, gain: null, src: null, song: null, blockedHint: false });
    // Don't lose waiting items: show them right away (or drop them on stop)
    const held = beat.gate.splice(0);
    held.forEach((it) => show(it));
    if (run.active) {
      run.nextAt = Math.min(run.nextAt, Date.now() + S.intervalSec * 1000);
      applyLook();
    }
  }

  // Look-ahead scheduling: beats of the next 120 ms get their own timer for the exact moment –
  // so the waves stay on the beat even when the computer manages fewer frames per second with many items.
  function beatLoop() {
    if (!beatActive() || run.paused || !run.active) return;
    if (beat.blockedHint) {
      beat.blockedHint = false;
      toast(`On the beat: ${Math.round(beat.song.bpm)} BPM`, "beat");
    }
    // Load new items ahead so something is ready on the next wave beat
    if (!run.busy && beat.gate.length + run.pending === 0) wave(false);
    // Song position as it is heard right now
    const t = beat.ac.currentTime - (beat.ac.outputLatency || 0) - beat.startAt;
    const song = beat.song;
    const beats = song.beats;
    while (beat.k < beats.length && beats[beat.k] <= t + 0.12) {
      const k = beat.k++;
      // After a hiccup (tab in the background) quietly skip missed beats
      if (t - beats[k] > 0.25) continue;
      setTimeout(() => {
        if (beat.song === song && beatActive() && run.active && !run.paused) onSongBeat(k);
      }, Math.max(0, (beats[k] - t) * 1000));
    }
  }

  function onSongBeat(k) {
    const song = beat.song;
    const e = song.energy[k] || 0;
    const prev = song.energy[k - 4] || 0;
    const drop = e - prev > 0.35 && e > 0.6 && k - beat.lastDrop >= 16;
    if (drop) beat.lastDrop = k;
    const every = Number(S.beatEvery) || (e > 0.7 ? 1 : e > 0.4 ? 2 : 4);
    const waveNow = drop || k % every === 0;
    if (waveNow && beat.gate.length) {
      beat.gate.splice(0).forEach((it) => show(it));
      fxWave();
      if (drop && S.fxGlitch > 0) for (let i = 0; i < 3; i++) glitchOne();
    }
    // Pulse: the stage pumps on every beat, harder on waves and drops
    if (S.fxPulse > 0 && run.dom) {
      const amp = drop ? 1.07 : waveNow ? 1.04 : 1.02;
      const len = (song.beats[k + 1] || song.beats[k] + 0.5) - song.beats[k];
      run.dom.stage.animate([{ scale: amp }, { scale: 1 }], { duration: Math.min(450, len * 700), easing: "cubic-bezier(.2,.7,.3,1)" });
    }
  }

  // ==========================================================================
  // Items
  // ==========================================================================

  function addItem(d, session) {
    if (session !== run.session || !run.active) {
      if (session === run.session) run.pending--;
      run.onScreen.delete(d.key);
      return;
    }
    const isVideo = d.kind === "scene" || d.isVid || !!d.video;
    const el = document.createElement("div");
    el.className = "ms-item ms-" + d.kind + (d.kind === "redgifs" && !isVideo ? " ms-image" : "");
    const openTitle = d.kind === "redgifs" ? "Open on RedGifs (Ctrl+click)" : "Open in Stash (Ctrl+click)";
    el.innerHTML =
      '<div class="ms-frame"></div>' +
      '<div class="ms-tools">' +
      (d.kind === "redgifs" ? `<button data-act="download" title="Save to Stash (D)">${icon("download")}</button>` : "") +
      `<button data-act="open" title="${openTitle}">${icon("open")}</button>` +
      `<button data-act="remove" title="Remove (right-click)">${icon("close")}</button></div>` +
      (isVideo && !d.isVid ? '<div class="ms-prog"><i></i></div>' : "");

    const it = {
      d, el, session, media: null, video: null, x: 0, y: 0, w: 0, h: 0, rot: 0, size: rand(S.sizeMin, S.sizeMax), slot: null,
      jit: rand(-1, 1), // fixed random value per item (rotation in spotlight/spiral/rain)
      move: null, // ticker/rain: { dx, dy, dur, delay }
      fxd: rand(5, 9), // duration of the item motion (effects)
      fxo: rand(0, 9), // phase offset so they don't all float in sync
      motion: ["drift", "breathe", "wobble"][Math.floor(Math.random() * 3)],
    };
    el._ms = it;
    // Own values for effects: float direction and 3D depth
    el.style.setProperty("--dx", rand(-28, 28).toFixed(0) + "px");
    el.style.setProperty("--dy", rand(-22, 22).toFixed(0) + "px");
    el.style.setProperty("--d3", rand(-650, 160).toFixed(0) + "px");
    const enter = S.fxEnter === "random" ? ENTER_STYLES[Math.floor(Math.random() * ENTER_STYLES.length)] : S.fxEnter;
    if (enter && enter !== "zoom") el.classList.add("ms-e-" + enter);
    // Ticker/rain: items disappear as soon as they have passed through
    el.addEventListener("animationend", (e) => {
      if (e.target === el && e.animationName === "ms-move" && run.items.includes(it)) removeItem(it);
    });

    let settled = false;
    const timeout = setTimeout(() => fail(), 20000);
    const done = () => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeout);
      if (session === run.session) run.pending--;
      return true;
    };
    const ok = () => {
      if (done() && !beatHold(it)) show(it);
    };
    const fail = () => {
      if (!done()) return;
      run.onScreen.delete(d.key);
      releaseMedia(it);
      el.remove();
    };

    const frame = el.firstChild;
    if (isVideo) createVideo(it, frame, ok, fail);
    else createImage(it, frame, ok, fail);
    run.dom.stage.appendChild(el);
  }

  function createImage(it, frame, ok, fail) {
    const img = new Image();
    img.className = "ms-media";
    img.decoding = "async";
    img.draggable = false;
    let triedAlt = false;
    img.onload = ok;
    img.onerror = () => {
      if (!triedAlt && it.d.alt && it.d.alt !== it.d.src) {
        triedAlt = true;
        img.src = it.d.alt;
      } else fail();
    };
    // Ken Burns parameters per image
    img.style.setProperty("--kb-x", rand(-5, 5).toFixed(1) + "%");
    img.style.setProperty("--kb-y", rand(-5, 5).toFixed(1) + "%");
    img.style.setProperty("--kb-s", rand(1.08, 1.22).toFixed(2));
    img.style.setProperty("--kb-d", rand(9, 18).toFixed(1) + "s");
    img.src = it.d.src;
    frame.appendChild(img);
    it.media = img;
  }

  // Full videos from Stash each keep one of the browser's ~6 connections to the server busy for as long
  // as they play (they load ahead bit by bit). With all of them taken, every other request to Stash waits –
  // the storm tab and every Stash tab in this browser hang. So only streamBudget() full videos run at once;
  // the rest use the preview clip (small, loaded quickly, the connection is free again right away).
  // RedGifs comes from another server and doesn't count.
  const liveStreams = new Set();
  // Automatic limit: generous when Stash is on this computer or behind HTTPS (HTTP/2 has no such limit),
  // careful over plain HTTP in the network – then measured while the storm runs (probeStash)
  const streams = {
    auto: /^(localhost|127\.|\[?::1\]?$)/.test(location.hostname) || location.protocol === "https:" ? 24 : 5,
    busy: false,
  };
  const streamBudget = () => (S.streamLimit > 0 ? S.streamLimit : streams.auto);

  // Every few seconds a tiny request to Stash: quick answer = connections to spare, the limit grows;
  // slow answer = they're running out – the limit shrinks and the oldest full videos go right away,
  // before Stash stops answering at all.
  async function probeStash() {
    if (!run.active || run.paused || S.streamLimit > 0 || streams.busy || liveStreams.size < 3) return;
    streams.busy = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const t0 = performance.now();
    let failed = false;
    try {
      await fetch("/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ __typename }" }), signal: ctl.signal, cache: "no-store", credentials: "same-origin" });
    } catch (e) {
      failed = true;
    }
    clearTimeout(timer);
    streams.busy = false;
    const ms = performance.now() - t0;
    if (!run.active) return;
    if (failed || ms > 1200) {
      streams.auto = Math.max(3, Math.min(streams.auto, liveStreams.size) - 2);
      const full = run.items.filter((it) => liveStreams.has(it));
      for (let i = 0; i < full.length - streams.auto; i++) removeItem(full[i]);
    } else if (ms < 300 && liveStreams.size >= streams.auto - 1) {
      streams.auto = Math.min(60, streams.auto + 2);
    }
  }
  const fromStash = (u) => {
    try {
      return new URL(u, location.href).origin === location.origin;
    } catch (e) {
      return false;
    }
  };

  function createVideo(it, frame, ok, fail) {
    const v = document.createElement("video");
    v.className = "ms-media";
    v.playsInline = true;
    v.muted = true; // start muted, applyAudio() sets the sound
    v.preload = "auto";
    v.disableRemotePlayback = true;
    v.loop = it.d.isVid ? true : S.loop;
    const sources = it.d.sources || [it.d.src];
    let idx = 0;
    let ready = false;

    const isFull = (u) => fromStash(u) && u !== it.d.preview;
    const tryNext = () => {
      if (ready || it.released) return;
      liveStreams.delete(it);
      // Full video only while there's room – otherwise straight to the next (lighter) source
      let skipped = false;
      while (idx < sources.length && isFull(sources[idx]) && liveStreams.size >= streamBudget()) {
        idx++;
        skipped = true;
      }
      if (idx >= sources.length) {
        // No lighter source (no preview clips generated): the scene's cover image instead of nothing
        if (skipped && it.d.poster) {
          v.remove();
          it.media = it.video = null;
          it.d = Object.assign({}, it.d, { src: it.d.poster, alt: null });
          return createImage(it, frame, ok, fail);
        }
        return fail();
      }
      it.src = sources[idx++];
      if (isFull(it.src)) liveStreams.add(it);
      v.src = it.src;
      v.load();
    };
    v.addEventListener("error", tryNext);
    v.addEventListener("loadedmetadata", () => {
      const full = it.d.kind === "scene" && !it.d.marker && it.src !== it.d.preview;
      if (S.randomStart && full && isFinite(v.duration) && v.duration > 12) {
        try {
          v.currentTime = v.duration * rand(0.05, 0.8);
        } catch (e) { /* ignore */ }
      }
    });
    v.addEventListener("canplay", () => {
      if (ready) return;
      ready = true;
      ok();
    });
    v.addEventListener("pause", () => {
      if (run.active && !run.paused && !it.hiddenPause && !v.ended && !it.released && run.items.includes(it)) playSafe(v);
    });
    v.addEventListener("ended", () => {
      // Loop off: the video fades out after its end and makes room for new ones.
      if (!v.loop && run.items.includes(it)) removeItem(it);
    });
    const bar = it.el.querySelector(".ms-prog i");
    if (bar) {
      v.addEventListener("timeupdate", () => {
        if (v.duration) bar.style.width = (v.currentTime / v.duration) * 100 + "%";
      });
    }
    frame.appendChild(v);
    it.media = it.video = v;
    tryNext();
  }

  function releaseMedia(it) {
    const m = it.media;
    if (!m || it.released) return;
    it.released = true;
    liveStreams.delete(it);
    if (it.video) {
      try {
        m.pause();
        m.removeAttribute("src");
        m.load(); // frees the HTTP connection
      } catch (e) { /* ignore */ }
    } else {
      m.onload = m.onerror = null;
      m.removeAttribute("src");
    }
  }

  function show(it) {
    if (it.session !== run.session || !run.active) {
      run.onScreen.delete(it.d.key);
      releaseMedia(it);
      it.el.remove();
      return;
    }
    if (S.endless) {
      while (run.items.length >= S.maxItems) removeItem(run.items[0]);
    } else if (run.items.length >= S.maxItems) {
      run.onScreen.delete(it.d.key);
      releaseMedia(it);
      it.el.remove();
      return;
    }
    run.items.push(it);
    if (FLOW.has(S.layout)) layoutFlow(true, it);
    else placeItem(it, false);
    it.el.style.zIndex = ++run.z;
    bindItem(it);
    void it.el.offsetWidth; // lock in the start state so the fade-in kicks in
    it.el.classList.add("ms-in");
    if (it.video) {
      it.video.volume = 0;
      if (!run.paused) playSafe(it.video);
      applyAudio();
      rampVolume(it, 0, () => S.volume / 100, S.fadeMs);
    }
    hideSplash();
    updateHud();
  }

  function removeItem(it) {
    const i = run.items.indexOf(it);
    if (i < 0) return;
    run.items.splice(i, 1);
    if (it.slot != null && run.slots[it.slot] === it) run.slots[it.slot] = null;
    run.onScreen.delete(it.d.key);
    if (run.focused === it) unfocus(true);
    if (run.hovered === it) run.hovered = null;
    it.el.classList.remove("ms-in");
    it.el.classList.add("ms-out");
    if (it.video) rampVolume(it, it.video.volume, 0, S.fadeMs);
    setTimeout(() => {
      releaseMedia(it);
      it.el.remove();
    }, S.fadeMs + 80);
    // Whole-screen layouts move up
    if (FLOW.has(S.layout) && run.active) {
      clearTimeout(run.flowTimer);
      run.flowTimer = setTimeout(() => run.active && layoutFlow(true), 30);
    }
    applyAudio();
    updateHud();
  }

  function clearItems() {
    run.items.slice().forEach(removeItem);
    run.nextAt = Math.min(run.nextAt, Date.now() + 600);
  }

  function trimToMax() {
    while (run.items.length > S.maxItems) removeItem(run.items[0]);
  }

  // ---------- Audio ----------

  function playSafe(v) {
    const p = v.play();
    if (p && p.catch) {
      p.catch((err) => {
        if (err && err.name === "AbortError") return; // source was switched
        // Autoplay with sound blocked → keep playing muted until the user clicks
        if (!v.muted) run.audioBlocked = true;
        v.muted = true;
        v.play().catch(() => {});
        updateUnmuteHint();
      });
    }
  }

  // A freshly opened tab may only play sound after a user action.
  function unlockAudio() {
    if (beat.ac && beat.ac.state === "suspended" && !run.paused) beat.ac.resume();
    if (!run.audioBlocked) return;
    run.audioBlocked = false;
    applyAudio();
  }

  function updateUnmuteHint() {
    if (!run.dom) return;
    const wanted = S.volume > 0 && S.audioMode !== "mute" && run.items.some((it) => it.video);
    run.dom.unmute.classList.toggle("ms-show", !!run.audioBlocked && wanted);
  }

  function rampVolume(it, from, to, ms) {
    const v = it.video;
    if (!v) return;
    const token = (it.ramp = {});
    const t0 = performance.now();
    const step = () => {
      if (it.ramp !== token) return;
      const p = Math.min(1, (performance.now() - t0) / Math.max(ms, 1));
      const target = typeof to === "function" ? to() : to;
      try {
        v.volume = clamp(from + (target - from) * p, 0, 1);
      } catch (e) { /* ignore */ }
      if (p < 1) setTimeout(step, 30);
      else it.ramp = null;
    };
    step();
  }

  function applyAudio() {
    const vol = S.volume / 100;
    const vids = run.items.filter((it) => it.video);
    let solo = null;
    if (S.audioMode === "hover") solo = run.focused || run.hovered;
    else if (S.audioMode === "newest") solo = vids[vids.length - 1] || null;
    for (const it of vids) {
      const v = it.video;
      const audible = !run.audioBlocked && vol > 0 && S.audioMode !== "mute" && (S.audioMode === "all" || it === solo || it === run.focused);
      if (!it.ramp) v.volume = vol;
      if (v.muted === audible) {
        v.muted = !audible;
        if (audible && v.paused && !run.paused) playSafe(v);
      }
    }
    updateUnmuteHint();
  }

  // ==========================================================================
  // Layout
  // ==========================================================================

  const LAYOUT_NAMES = { chaos: "Chaos", pile: "Pile", grid: "Grid", mosaic: "Mosaic", spotlight: "Spotlight", spiral: "Spiral", ticker: "Ticker", rain: "Rain" };
  // Whole-screen layouts: fully recalculated on every new/removed item (with animation)
  const FLOW = new Set(["mosaic", "spotlight", "spiral"]);
  // Moving layouts: items pass through once and then make room
  const MOVING = new Set(["ticker", "rain"]);
  // Only here may items be dragged and scaled with the mouse wheel
  const freeLayout = () => S.layout === "chaos" || S.layout === "pile";
  const ENTER_STYLES = ["zoom", "fade", "slam", "flip", "fall", "spin", "glitch"];
  const FRAME_NAMES = { soft: "Soft", none: "None", polaroid: "Polaroid", manga: "Manga", neon: "Neon", circle: "Circle" };
  const FRAMES = Object.keys(FRAME_NAMES);

  function itemAspect(it) {
    switch (S.aspect) {
      case "square": return 1;
      case "portrait": return 3 / 4;
      case "landscape": return 16 / 9;
      default: return it.d.w / it.d.h || 1;
    }
  }

  function computeGrid() {
    const vw = viewW();
    const vh = viewH();
    const n = Math.max(S.maxItems, run.items.length + run.pending + 1, 1);
    const cols = S.columns > 0 ? S.columns : Math.max(1, Math.round(Math.sqrt((n * vw) / vh)));
    const rows = Math.ceil(n / cols);
    const gap = S.gap;
    return { cols, rows, gap, cells: cols * rows, cw: (vw - gap * (cols + 1)) / cols, ch: (vh - gap * (rows + 1)) / rows };
  }

  // Mosaic: columns like a pinboard, newest items on top – everything slides down.
  function layoutMosaic(list) {
    const vw = viewW();
    const vh = viewH();
    const gap = S.gap;
    const inv = list.length >= 3 ? list.reduce((s, it) => s + 1 / itemAspect(it), 0) / list.length : 1.25;
    const cols = S.columns > 0 ? S.columns : clamp(Math.round(Math.sqrt((Math.max(S.maxItems, 4) * vw * inv) / vh)), 1, 14);
    const cw = (vw - gap * (cols + 1)) / cols;
    const heights = new Array(cols).fill(gap);
    list.slice().reverse().forEach((it) => {
      const c = heights.indexOf(Math.min(...heights));
      const h = cw / itemAspect(it);
      Object.assign(it, { x: gap + c * (cw + gap), y: heights[c], w: cw, h, rot: 0 });
      heights[c] += h + gap;
    });
  }

  // Spotlight: the newest item big in the middle, the older ones in a circle around it.
  function layoutSpotlight(list) {
    const vw = viewW();
    const vh = viewH();
    const hero = list[list.length - 1];
    const rest = list.slice(0, -1).reverse();
    if (hero) {
      const ar = itemAspect(hero);
      const w = Math.min(vw * 0.56, vh * 0.7 * ar);
      const h = w / ar;
      Object.assign(hero, { x: (vw - w) / 2, y: (vh - h) / 2, w, h, rot: 0 });
    }
    const m = rest.length;
    const rx = vw * 0.39;
    const ry = vh * 0.36;
    const base = clamp((2 * Math.PI * Math.min(rx, ry)) / Math.max(m, 1) * 1.25, 70, vh * 0.28);
    rest.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / Math.max(m, 1)) * Math.PI * 2;
      const ar = itemAspect(it);
      const side = base * (1 - (i / Math.max(m, 1)) * 0.35);
      const w = side * Math.sqrt(ar);
      const h = side / Math.sqrt(ar);
      Object.assign(it, { x: vw / 2 + Math.cos(a) * rx - w / 2, y: vh / 2 + Math.sin(a) * ry - h / 2, w, h, rot: it.jit * S.rotation });
    });
  }

  // Spiral: sunflower pattern (golden angle), newest item in the middle – everything turns one position further.
  function layoutSpiral(list) {
    const vw = viewW();
    const vh = viewH();
    const order = list.slice().reverse();
    const n = Math.max(order.length, 1);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const reach = Math.min(vw, vh) * 0.47;
    const c = reach / Math.sqrt(Math.max(n, 6));
    const big = (Math.max(S.sizeMax, 10) / 100) * vh;
    order.forEach((it, i) => {
      const r = c * Math.sqrt(i + 0.35);
      const a = i * golden;
      const side = big * 0.85 * (1 - (i / Math.max(n, 2)) * 0.7);
      const ar = itemAspect(it);
      const w = side * Math.sqrt(ar);
      const h = side / Math.sqrt(ar);
      const sx = vw / Math.min(vw, vh); // stretch to landscape
      Object.assign(it, { x: vw / 2 + Math.cos(a) * r * sx - w / 2, y: vh / 2 + Math.sin(a) * r - h / 2, w, h, rot: it.jit * S.rotation + (a * 180 / Math.PI) % 12 });
    });
  }

  function layoutFlow(animate, fresh) {
    if (!run.dom) return;
    const list = run.items.filter((it) => it !== run.focused);
    if (S.layout === "mosaic") layoutMosaic(list);
    else if (S.layout === "spotlight") layoutSpotlight(list);
    else layoutSpiral(list);
    list.forEach((it) => {
      it.slot = null;
      it.move = null;
      applyGeom(it, animate && it !== fresh);
      applyItemAnim(it);
    });
  }

  // Ticker (right to left in lanes) and rain (top to bottom)
  function placeMoving(it, spread) {
    const vw = viewW();
    const vh = viewH();
    const speed = Math.max(10, S.flowSpeed);
    const ar = itemAspect(it);
    if (S.layout === "ticker") {
      const avg = (S.sizeMin + S.sizeMax) / 2;
      const lanes = clamp(Math.round(100 / avg), 1, 10);
      const laneH = vh / lanes;
      const h = laneH - Math.max(S.gap, 4);
      const w = h * ar;
      if (!run.lanes || run.lanes.length !== lanes) run.lanes = new Array(lanes).fill(0);
      const now = Date.now() / 1000;
      let lane = 0;
      run.lanes.forEach((t, i) => t < run.lanes[lane] && (lane = i));
      const start = Math.max(now, run.lanes[lane]);
      run.lanes[lane] = start + (w + Math.max(S.gap, 14)) / speed;
      const travel = vw + w + 20;
      Object.assign(it, { x: vw, y: lane * laneH + (laneH - h) / 2, w, h, rot: it.jit * S.rotation * 0.25 });
      it.move = { dx: -travel, dy: 0, dur: travel / speed, delay: start - now };
    } else {
      const { w, h } = naturalBox(it);
      const travel = vh + h + 40;
      const dur = travel / (speed * rand(0.8, 1.25));
      Object.assign(it, { x: rand(0, Math.max(0, vw - w)), y: -h - 20, w, h, rot: it.jit * S.rotation });
      // When switching, spread all items out in time, otherwise one single block falls
      it.move = { dx: 0, dy: travel, dur, delay: spread ? rand(0, dur * 0.9) : rand(0, 0.8) };
    }
  }

  // Sets movement (ticker/rain) and effect motion (drift, breathe, wobble) as one animation list.
  function applyItemAnim(it) {
    const el = it.el;
    const anims = [];
    if (it.move) {
      el.style.setProperty("--mx", it.move.dx.toFixed(0) + "px");
      el.style.setProperty("--my", it.move.dy.toFixed(0) + "px");
      anims.push(`ms-move ${it.move.dur.toFixed(2)}s linear ${it.move.delay.toFixed(2)}s 1 both`);
    }
    const m = S.fxMotion === "random" ? it.motion : S.fxMotion;
    const off = `-${it.fxo.toFixed(2)}s`;
    if (m === "drift" && !it.move) anims.push(`ms-drift ${it.fxd.toFixed(2)}s ease-in-out ${off} infinite alternate`);
    else if (m === "breathe") anims.push(`ms-breathe ${(it.fxd * 0.45).toFixed(2)}s ease-in-out ${off} infinite alternate`);
    else if (m === "wobble") anims.push(`ms-wobble ${(it.fxd * 0.28).toFixed(2)}s ease-in-out ${off} infinite alternate`);
    const next = anims.join(", ");
    if (it.anim !== next) {
      it.anim = next;
      el.style.animation = next;
    }
  }

  // Chaos with "avoid overlap": several candidates, the one with the least coverage wins.
  function freeSpot(it, w, h) {
    const vw = viewW();
    const vh = viewH();
    let best = null;
    for (let k = 0; k < 16; k++) {
      const x = rand(-w * 0.04, vw - w * 0.96);
      const y = rand(-h * 0.04, vh - h * 0.96);
      let cover = 0;
      for (const o of run.items) {
        if (o === it) continue;
        const ox = Math.max(0, Math.min(x + w, o.x + o.w) - Math.max(x, o.x));
        const oy = Math.max(0, Math.min(y + h, o.y + o.h) - Math.max(y, o.y));
        cover += ox * oy;
      }
      if (!best || cover < best.cover) best = { x, y, cover };
      if (cover === 0) break;
    }
    return best;
  }

  function takeSlot() {
    const freeSlots = () => {
      const free = [];
      for (let i = 0; i < run.grid.cells; i++) if (!run.slots[i]) free.push(i);
      return free;
    };
    let free = freeSlots();
    if (!free.length) {
      // Enlarge the grid; existing slot indexes stay valid, only the cells shrink.
      run.grid = computeGrid();
      run.items.forEach((x) => x.slot != null && placeItem(x, true));
      free = freeSlots();
    }
    return free[Math.floor(Math.random() * free.length)];
  }

  // Scale by area instead of edge so portrait and landscape feel equally "heavy".
  function naturalBox(it) {
    const ar = itemAspect(it);
    const side = (it.size / 100) * viewH();
    let w = side * Math.sqrt(ar);
    let h = side / Math.sqrt(ar);
    const k = Math.min(1, (viewW() * 0.92) / w, (viewH() * 0.92) / h);
    return { w: w * k, h: h * k };
  }

  function placeItem(it, animate) {
    const vw = viewW();
    const vh = viewH();
    it.move = null;
    if (MOVING.has(S.layout)) {
      it.slot = null;
      if (it.anim) {
        // Restart a running movement instead of continuing in the middle
        it.el.style.animation = "none";
        void it.el.offsetWidth;
        it.anim = null;
      }
      placeMoving(it, animate);
    } else if (FLOW.has(S.layout)) {
      // Single item in a whole-screen layout → rearrange everything
      layoutFlow(animate);
      return;
    } else if (S.layout === "grid") {
      if (!run.grid) run.grid = computeGrid();
      if (it.slot == null) {
        it.slot = takeSlot();
        run.slots[it.slot] = it;
      }
      const g = run.grid;
      const c = it.slot % g.cols;
      const r = Math.floor(it.slot / g.cols);
      Object.assign(it, { x: g.gap + c * (g.cw + g.gap), y: g.gap + r * (g.ch + g.gap), w: g.cw, h: g.ch, rot: 0 });
    } else {
      it.slot = null;
      const { w, h } = naturalBox(it);
      let x, y, rot;
      if (S.layout === "pile") {
        x = vw / 2 - w / 2 + gauss() * vw * 0.2;
        y = vh / 2 - h / 2 + gauss() * vh * 0.16;
        rot = rand(-1, 1) * S.rotation * 1.8;
      } else if (S.avoidOverlap) {
        ({ x, y } = freeSpot(it, w, h));
        rot = rand(-1, 1) * S.rotation;
      } else {
        x = rand(-w * 0.08, vw - w * 0.92);
        y = rand(-h * 0.08, vh - h * 0.92);
        rot = rand(-1, 1) * S.rotation;
      }
      Object.assign(it, { x: clamp(x, -w * 0.15, vw - w * 0.85), y: clamp(y, -h * 0.15, vh - h * 0.85), w, h, rot });
    }
    applyGeom(it, animate);
    applyItemAnim(it);
  }

  function applyGeom(it, animate) {
    const el = it.el;
    if (animate) {
      el.classList.add("ms-anim");
      clearTimeout(it.animTimer);
      it.animTimer = setTimeout(() => el.classList.remove("ms-anim"), 550);
    }
    el.style.left = it.x + "px";
    el.style.top = it.y + "px";
    el.style.width = it.w + "px";
    el.style.height = it.h + "px";
    el.style.setProperty("--rot", it.rot.toFixed(2) + "deg");
  }

  function relayoutAll(animate) {
    if (!run.dom) return;
    if (run.focused) unfocus(true);
    run.slots = [];
    run.lanes = null;
    run.grid = S.layout === "grid" ? computeGrid() : null;
    run.dom.stage.classList.toggle("ms-gridmode", S.layout === "grid" || S.layout === "mosaic");
    if (FLOW.has(S.layout)) {
      layoutFlow(animate);
      return;
    }
    run.items.forEach((it, i) => {
      it.slot = null;
      if (run.grid) {
        it.slot = i;
        run.slots[i] = it;
      }
      placeItem(it, animate);
    });
  }

  // ---------- Focus ----------

  function toggleFocus(it) {
    if (run.focused === it) return unfocus();
    if (run.focused) unfocus();
    run.focused = it;
    it.saved = { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot };
    const ar = it.d.w / it.d.h || 1;
    const w = Math.min(viewW() * 0.88, viewH() * 0.88 * ar);
    const h = w / ar;
    Object.assign(it, { x: (viewW() - w) / 2, y: (viewH() - h) / 2, w, h, rot: 0 });
    it.el.classList.add("ms-focus");
    it.el.style.zIndex = 1000000;
    run.dom.stage.classList.add("ms-has-focus");
    applyGeom(it, true);
    applyAudio();
  }

  function unfocus(silent) {
    const it = run.focused;
    if (!it) return;
    run.focused = null;
    Object.assign(it, it.saved);
    it.el.classList.remove("ms-focus");
    it.el.style.zIndex = ++run.z;
    if (run.dom) run.dom.stage.classList.remove("ms-has-focus");
    if (!silent) {
      if (FLOW.has(S.layout)) layoutFlow(true);
      else applyGeom(it, true);
    }
    applyAudio();
  }

  // ---------- Interaction ----------

  function openInStash(it) {
    const href = /^https?:/.test(it.d.href) ? it.d.href : location.origin + it.d.href;
    window.open(href, "_blank", "noopener");
  }

  function bindItem(it) {
    const el = it.el;
    let drag = null;

    el.addEventListener("pointerenter", () => {
      run.hovered = it;
      if (run.focused !== it) el.style.zIndex = ++run.z;
      if (S.audioMode === "hover") applyAudio();
    });
    el.addEventListener("pointerleave", () => {
      if (run.hovered === it) run.hovered = null;
      if (S.audioMode === "hover") applyAudio();
    });

    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".ms-tools")) return;
      if (e.button === 1) {
        e.preventDefault();
        openInStash(it);
        return;
      }
      if (e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!freeLayout() || run.focused === it) return;
      drag.moved = true;
      el.classList.add("ms-drag");
      it.x = drag.ox + dx;
      it.y = drag.oy + dy;
      applyGeom(it, false);
    });
    el.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const wasDrag = drag.moved;
      drag = null;
      el.classList.remove("ms-drag");
      if (wasDrag) return;
      if (e.ctrlKey || e.metaKey) openInStash(it);
      else toggleFocus(it);
    });
    el.addEventListener("pointercancel", () => {
      drag = null;
      el.classList.remove("ms-drag");
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      removeItem(it);
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (!freeLayout() || run.focused === it) return;
        const k = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const cx = it.x + it.w / 2;
        const cy = it.y + it.h / 2;
        it.w = clamp(it.w * k, 60, viewW() * 1.5);
        it.h = it.w / itemAspect(it);
        it.size *= k;
        it.x = cx - it.w / 2;
        it.y = cy - it.h / 2;
        applyGeom(it, false);
      },
      { passive: false }
    );
    el.querySelector(".ms-tools").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.act === "open") openInStash(it);
      else if (b.dataset.act === "download") downloadItem(it);
      else removeItem(it);
    });
  }

  // ==========================================================================
  // RedGifs → save to Stash
  // The Python backend downloads the file into the library; then Stash scans exactly this
  // folder and the new scene gets the RedGifs link, title, description and the tag "RedGifs".
  // ==========================================================================

  const saved = new Set(); // clip IDs saved in this session
  let libraryRoot = null;

  const downloadBase = () => S.rgDlDir.trim() || defaultDownloadBase();

  async function defaultDownloadBase() {
    if (!libraryRoot) {
      const d = await gql(`query { configuration { general { stashes { path excludeVideo } } } }`);
      const stashes = d.configuration.general.stashes || [];
      const lib = stashes.find((x) => !x.excludeVideo) || stashes[0];
      if (!lib) throw new Error("no Stash library configured");
      libraryRoot = lib.path.replace(/[\\/]+$/, "");
    }
    return libraryRoot + (libraryRoot.includes("/") && !libraryRoot.includes("\\") ? "/" : "\\") + "RedGifs";
  }

  function downloadFolder(d) {
    if (S.rgDlLayout === "flat") return "";
    if (S.rgDlLayout === "creator") return d.user || "Unknown";
    return (d.source && d.source.name) || "Trending";
  }

  function downloadTitle(d) {
    const text = d.desc.replace(/\s+/g, " ").trim();
    const short = text.length > 120 ? text.slice(0, 117) + "…" : text;
    return short || `${d.user || "RedGifs"} – ${d.id}`;
  }

  function setDownloadState(it, state) {
    it.dl = state;
    const b = it.el.querySelector('[data-act="download"]');
    if (b) {
      b.classList.toggle("ms-dl-busy", state === "busy");
      b.classList.toggle("ms-dl-done", state === "done");
      b.classList.toggle("ms-dl-error", state === "error");
      b.innerHTML = icon(state === "busy" ? "spinner" : state === "done" ? "check" : "download");
      b.title = state === "done" ? "Saved" : state === "error" ? "Failed – try again" : "Save to Stash (D)";
    }
    it.el.classList.toggle("ms-saved", state === "done");
  }

  async function downloadItem(it) {
    const d = it.d;
    if (d.kind !== "redgifs" || it.dl === "busy") return;
    if (it.dl === "done" || saved.has(d.id)) {
      setDownloadState(it, "done");
      toast("Already saved", "dl");
      return;
    }
    setDownloadState(it, "busy");
    try {
      const base = await downloadBase();
      const res = await gql(`mutation($args: Map) { runPluginOperation(plugin_id: "mediaStorm", args: $args) }`, {
        args: { mode: "download", url: d.hd, id: d.id, base, folder: downloadFolder(d), filename: `${d.user || "redgifs"}_${d.id}` },
      });
      const out = res && res.runPluginOperation;
      if (!out || !out.path) throw new Error((out && out.error) || "no answer from the plugin backend");
      saved.add(d.id);
      setDownloadState(it, "done");
      const where = out.dir.split(/[\\/]/).slice(-2).join("\\");
      toast(`${out.existed ? "Already there" : "Saved"} → ${where}`, "dl");
      importIntoStash(out, d);
    } catch (e) {
      console.error("[MediaStorm] Download", e);
      setDownloadState(it, "error");
      toast("Download failed: " + e.message, "dl");
    }
  }

  async function ensureTag(name) {
    const d = await gql(`query($n: String!) { findTags(tag_filter: { name: { value: $n, modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id } } }`, { n: name });
    if (d.findTags.tags[0]) return d.findTags.tags[0].id;
    return (await gql(`mutation($n: String!) { tagCreate(input: { name: $n }) { id } }`, { n: name })).tagCreate.id;
  }

  async function importIntoStash(out, d) {
    const isImage = out.kind === "image";
    try {
      await gql(`mutation($input: ScanMetadataInput!) { metadataScan(input: $input) }`, {
        input: {
          paths: [out.dir],
          scanGenerateCovers: true,
          scanGeneratePreviews: true,
          scanGenerateThumbnails: true,
          scanGeneratePhashes: true,
          scanGenerateImagePhashes: true,
        },
      });
      // Wait until the scan has created the file (max. ~90 s)
      const find = isImage
        ? `query($p: String!) { findImages(image_filter: { path: { value: $p, modifier: EQUALS } }) { images { id title urls tags { id } } } }`
        : `query($p: String!) { findScenes(scene_filter: { path: { value: $p, modifier: EQUALS } }) { scenes { id title urls tags { id } } } }`;
      let obj = null;
      for (let i = 0; i < 45 && !obj; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await gql(find, { p: out.path });
        obj = (isImage ? r.findImages.images : r.findScenes.scenes)[0] || null;
      }
      if (!obj) {
        toast("Saved – Stash is still scanning, the scene will appear shortly", "dlimp");
        return;
      }
      const tagId = await ensureTag("RedGifs");
      const input = {
        id: obj.id,
        title: obj.title || downloadTitle(d),
        urls: [...new Set([...(obj.urls || []), d.href])],
        tag_ids: [...new Set([...obj.tags.map((t) => t.id), tagId])],
      };
      if (d.desc) input.details = d.desc;
      await gql(isImage ? `mutation($i: ImageUpdateInput!) { imageUpdate(input: $i) { id } }` : `mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id } }`, { i: input });
      toast(`Imported into Stash ✓ (${isImage ? "image" : "scene"} #${obj.id})`, "dlimp");
    } catch (e) {
      console.error("[MediaStorm] Import", e);
      toast("Saved, but importing into Stash failed: " + e.message, "dlimp");
    }
  }

  // ==========================================================================
  // Overlay, HUD, Start/Stop
  // ==========================================================================

  function buildOverlay() {
    const root = document.createElement("div");
    root.className = "ms-overlay";
    root.innerHTML = `
      <div class="ms-backdrop"></div>
      <div class="ms-world">
        <div class="ms-stage"></div>
        <div class="ms-texture"></div>
        <div class="ms-flash"></div>
      </div>
      <div class="ms-unmute">Click or press a key for sound</div>
      <div class="ms-hud">
        <span class="ms-dot"></span>
        <span class="ms-hud-stat" title="Items / Maximum"><b data-h="count">0</b></span>
        <span class="ms-hud-stat" title="Images">${icon("image")}<b data-h="img">0</b></span>
        <span class="ms-hud-stat" title="Videos">${icon("film")}<b data-h="vid">0</b></span>
        <span class="ms-hud-stat" data-h="rgwrap" title="RedGifs"><i class="ms-rg">RG</i><b data-h="rg">0</b></span>
        <span class="ms-hud-stat" title="Next wave">${icon("clock")}<b data-h="next">–</b></span>
        <span class="ms-hud-stat" data-h="sleepwrap" title="Sleep timer">${icon("moon")}<b data-h="sleep"></b></span>
        <span class="ms-hud-sep"></span>
        <span class="ms-hud-btns">
          <button data-act="pause" title="Pause / resume (Space)">${icon("pause")}</button>
          <button data-act="next" title="Next wave now (N)">${icon("next")}</button>
          <button data-act="bg" title="Reroll background (B)">${icon("dice")}</button>
          <button data-act="fs" title="Fullscreen (F)">${icon("expand")}</button>
          <button data-act="panel" title="Settings (S)">${icon("sliders")}</button>
          <button data-act="stop" title="Stop (Esc)">${icon("stop")}</button>
        </span>
      </div>`;
    document.body.appendChild(root);
    const dom = {
      root,
      backdrop: root.querySelector(".ms-backdrop"),
      world: root.querySelector(".ms-world"),
      stage: root.querySelector(".ms-stage"),
      texture: root.querySelector(".ms-texture"),
      flash: root.querySelector(".ms-flash"),
      hud: root.querySelector(".ms-hud"),
      unmute: root.querySelector(".ms-unmute"),
      h: {},
    };
    root.querySelectorAll("[data-h]").forEach((n) => (dom.h[n.dataset.h] = n));
    dom.hud.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (b) action(b.dataset.act, b);
    });
    // The HUD hides when the mouse rests
    let idleTimer;
    dom.onMove = (e) => {
      // 3D depth: the vanishing point follows the mouse inversely → parallax
      if (S.fx3d && e && e.clientX != null) {
        dom.stage.style.setProperty("--px", (50 - (e.clientX / viewW() - 0.5) * 70).toFixed(1) + "%");
        dom.stage.style.setProperty("--py", (50 - (e.clientY / viewH() - 0.5) * 70).toFixed(1) + "%");
      }
      dom.hud.classList.remove("ms-idle");
      clearTimeout(idleTimer);
      document.body.classList.remove("ms-cursor-hidden");
      idleTimer = setTimeout(() => {
        dom.hud.classList.add("ms-idle");
        if (IS_STAGE) document.body.classList.add("ms-cursor-hidden");
      }, 2500);
    };
    window.addEventListener("pointermove", dom.onMove, { passive: true });
    dom.onMove();
    run.dom = dom;
    applyLook();
  }

  function applyLook() {
    if (!run.dom) return;
    const { root, backdrop, stage, hud } = run.dom;
    root.style.setProperty("--ms-fade", S.fadeMs + "ms");
    backdrop.style.backgroundColor = `rgba(5, 6, 10, ${S.dim / 100})`;
    backdrop.style.backdropFilter = S.blur ? `blur(${S.blur}px)` : "none";
    stage.classList.toggle("ms-kb", !!S.kenBurns);
    stage.classList.toggle("ms-gridmode", S.layout === "grid" || S.layout === "mosaic");
    hud.classList.toggle("ms-hidden", !S.showHud);
    // Effects
    FRAMES.forEach((f) => stage.classList.toggle("ms-fr-" + f, S.frame === f));
    stage.classList.toggle("ms-mirror", !!S.fxMirror);
    stage.classList.toggle("ms-3d", !!S.fx3d);
    stage.classList.toggle("ms-tx-vhs", S.fxTexture === "vhs");
    stage.style.setProperty("--ms-blend", S.fxBlend || "normal");
    run.dom.texture.className = "ms-texture" + (S.fxTexture && S.fxTexture !== "none" ? " ms-tx-" + S.fxTexture : "");
    const anims = [];
    if (S.fxPulse > 0 && !beatActive()) anims.push(`ms-beat ${(60 / S.fxPulse).toFixed(3)}s ease-out infinite`);
    if (S.fxHue > 0) anims.push(`ms-hue ${66 - S.fxHue * 6}s linear infinite`);
    const next = anims.join(", ");
    if (run.dom.stageAnim !== next) {
      run.dom.stageAnim = next;
      stage.style.animation = next;
    }
    run.items.forEach(applyItemAnim);
  }

  // One-off effects on every new wave
  function fxWave() {
    if (!run.dom) return;
    const retrigger = (el, cls, ms) => {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      clearTimeout(el["_t" + cls]);
      el["_t" + cls] = setTimeout(() => el.classList.remove(cls), ms);
    };
    if (S.fxFlash) retrigger(run.dom.flash, "ms-flashing", 450);
    if (S.fxShake) retrigger(run.dom.world, "ms-shaking", 500);
  }

  // Glitch: a random item twitches briefly (RGB offset, slices)
  function glitchOne() {
    const list = run.items.filter((it) => it !== run.focused);
    const it = list[Math.floor(Math.random() * list.length)];
    if (!it) return;
    it.el.classList.remove("ms-glitch");
    void it.el.offsetWidth;
    it.el.classList.add("ms-glitch");
    clearTimeout(it.glitchTimer);
    it.glitchTimer = setTimeout(() => it.el.classList.remove("ms-glitch"), 420);
  }

  function updateHud() {
    const now = Date.now();
    const { img: imgs, vid: vids, rg: rgs } = localStatus();
    const full = !S.endless && run.items.length + run.pending >= S.maxItems;
    let next = "–";
    if (run.paused) next = "Pause";
    else if (full) next = "Max";
    else if (beatActive()) next = "♪ " + Math.round(beat.song.bpm);
    else if (run.active) next = Math.max(0, Math.ceil((run.nextAt - now) / 1000)) + "s";

    let sleep = "";
    const left = run.paused ? run.sleepLeft : run.sleepAt - now;
    if (run.sleepAt && left > 0) {
      const s = Math.ceil(left / 1000);
      sleep = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }

    if (run.dom) {
      const h = run.dom.h;
      h.count.textContent = `${run.items.length}/${S.maxItems}${S.endless ? " ∞" : ""}`;
      h.img.textContent = imgs;
      h.vid.textContent = vids;
      h.rg.textContent = rgs;
      h.rgwrap.style.display = S.rgPct > 0 || rgs ? "" : "none";
      h.next.textContent = next;
      h.sleep.textContent = sleep;
      h.sleepwrap.style.display = sleep ? "" : "none";
    }
    if (IS_STAGE) {
      document.title = run.active ? `${run.paused ? "⏸" : "⚡"} ${run.items.length}/${S.maxItems} · Media Storm` : "Media Storm";
      if (now - (run.lastPost || 0) > 400) postStatus();
    }
    updatePanelStatus();
  }

  function localStatus() {
    const c = { image: 0, scene: 0, redgifs: 0 };
    run.items.forEach((it) => c[it.d.kind]++);
    return { active: run.active, paused: run.paused, count: run.items.length, max: S.maxItems, img: c.image, vid: c.scene, rg: c.redgifs };
  }

  // In the storm tab its own state counts, in Stash the reported state of the storm tab.
  function viewStatus() {
    if (IS_STAGE) return localStatus();
    return remoteActive() ? remote.status : { active: false };
  }

  function updatePanelStatus() {
    if (!panel) return;
    const st = viewStatus();
    const label = st.active ? (st.paused ? "Paused" : IS_STAGE ? "Running" : "Running in the storm tab") : IS_STAGE ? "Stopped" : "Ready";
    const nums = st.active
      ? `<span title="Items / Maximum"><b>${st.count}</b>/${st.max}</span>` +
        `<span title="Images">${icon("image")}<b>${st.img}</b></span>` +
        `<span title="Videos">${icon("film")}<b>${st.vid}</b></span>` +
        (st.rg ? `<span title="RedGifs"><i class="ms-rg">RG</i><b>${st.rg}</b></span>` : "")
      : IS_STAGE ? "" : "starts in its own tab";
    const state = st.active ? (st.paused ? "pause" : "run") : "idle";
    // Runs 4× per second – only touch the DOM on changes
    if (panel.status.textContent !== label) panel.status.textContent = label;
    if (panel.state.dataset.state !== state) panel.state.dataset.state = state;
    if (panel.nums._html !== nums) panel.nums.innerHTML = panel.nums._html = nums;
  }

  function syncState() {
    const st = viewStatus();
    const nav = document.querySelector(".ms-nav-btn");
    if (nav) nav.classList.toggle("ms-on", st.active);
    if (run.dom) {
      run.dom.hud.classList.toggle("ms-paused-ui", run.paused);
      run.dom.hud.querySelector('[data-act="pause"]').innerHTML = icon(run.paused ? "play" : "pause");
      run.dom.stage.classList.toggle("ms-paused", run.paused);
    }
    if (panel) {
      const b = panel.el.querySelector('[data-act="toggle"]');
      b.classList.toggle("ms-running", st.active);
      b.innerHTML = st.active
        ? `${icon("stop")}<span>Stop</span>`
        : `${icon("play")}<span>${IS_STAGE ? "Restart" : "Start"}</span>`;
      const p = panel.el.querySelector('[data-act="pause"]');
      p.disabled = !st.active;
      p.innerHTML = icon(st.paused ? "play" : "pause");
      panel.el.querySelector('[data-act="next"]').disabled = !st.active;
    }
    if (IS_STAGE) postStatus();
    updateHud();
  }

  function start() {
    if (run.active || !IS_STAGE) return;
    run.session++;
    Object.assign(run, {
      active: true,
      paused: false,
      busy: false,
      items: [],
      pending: 0,
      empty: { image: false, scene: false, marker: false, redgifs: false },
      acc: Math.random(),
      accRg: Math.random(),
      z: 10,
      waves: 0,
      hovered: null,
      focused: null,
      grid: null,
      slots: [],
      fs: false,
      // Without a prior interaction in this tab, the browser blocks sound.
      audioBlocked: !!(navigator.userActivation && !navigator.userActivation.hasBeenActive),
    });
    run.onScreen.clear();
    rgReset();
    run.rgError = "";

    run.ctx = S.source === "context" ? pageContext() : null;
    if (S.source === "context") {
      if (run.ctx) describeContext(run.ctx).then((label) => toast("Source – " + label));
      else toast("Not a performer/tag/studio/gallery/group page – using the whole library");
      if (run.ctx && run.ctx.field === "tags" && S.includeTags.length > 1 && !S.tagMatchAll) {
        toast("On tag pages, all chosen tags must match");
      }
    }

    setEmptyNotice(false);
    buildOverlay();
    showSplash();
    void run.dom.root.offsetWidth;
    run.dom.root.classList.add("ms-visible");
    run.sleepAt = S.sleepMin ? Date.now() + S.sleepMin * 60000 : 0;
    closePanel();
    wave(true);
    run.tick = setInterval(tick, 250);
    run.probe = setInterval(probeStash, 2500);
    beatStart();
    syncState();
  }

  // empty = filter/source return nothing → the panel shows the empty state
  function stop(reason, empty) {
    if (!run.active) return;
    if (reason) toast(reason);
    if (empty) setEmptyNotice(true);
    run.active = false;
    run.paused = false;
    run.session++;
    clearInterval(run.tick);
    clearInterval(run.probe);
    beatStop();

    const dom = run.dom;
    const items = run.items.splice(0);
    run.dom = null;
    run.pending = 0;
    run.onScreen.clear();
    run.hovered = run.focused = null;
    run.slots = [];
    run.grid = null;

    const ms = S.fadeMs;
    items.forEach((it) => {
      it.el.classList.remove("ms-in");
      it.el.classList.add("ms-out");
      if (it.video) rampVolume(it, it.video.volume, 0, ms);
    });
    dom.root.classList.remove("ms-visible");
    window.removeEventListener("pointermove", dom.onMove);
    document.body.classList.remove("ms-cursor-hidden");
    if (run.fs && document.fullscreenElement) {
      run.fsByUs = true;
      document.exitFullscreen().catch(() => {});
    }
    run.fs = false;
    setTimeout(() => {
      items.forEach(releaseMedia);
      dom.stage.querySelectorAll(".ms-item").forEach((el) => el._ms && releaseMedia(el._ms));
      dom.root.remove();
      if (IS_STAGE && !run.active) {
        // Close the tab; if that doesn't work (tab not opened by script), show the panel for a restart.
        window.close();
        setTimeout(() => !run.active && openPanel(), 300);
      }
    }, ms + 120);
    post({ status: { active: false }, reason, empty: !!empty });
    syncState();
  }

  function togglePause() {
    if (!run.active) return;
    const now = Date.now();
    run.paused = !run.paused;
    if (run.paused) {
      run.pauseLeft = Math.max(0, run.nextAt - now);
      run.sleepLeft = run.sleepAt ? run.sleepAt - now : 0;
      run.items.forEach((it) => it.video && it.video.pause());
      if (beat.ac) beat.ac.suspend();
    } else {
      run.nextAt = now + run.pauseLeft;
      if (run.sleepAt) run.sleepAt = now + run.sleepLeft;
      run.items.forEach((it) => it.video && !it.hiddenPause && playSafe(it.video));
      if (beat.ac) beat.ac.resume();
    }
    syncState();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      run.fsByUs = true;
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().then(() => (run.fs = true)).catch(() => toast("Fullscreen not allowed"));
    }
  }

  // Esc in fullscreen is swallowed by the browser → leaving fullscreen = stop.
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) return;
    const byUs = run.fsByUs;
    run.fsByUs = false;
    if (run.fs && !byUs && run.active) stop();
    run.fs = false;
  });

  function cycleLayout() {
    const order = Object.keys(LAYOUT_NAMES);
    setSetting("layout", order[(order.indexOf(S.layout) + 1) % order.length]);
    syncPanel();
    toast("Layout: " + LAYOUT_NAMES[S.layout], "layout");
  }

  function cycleVibe() {
    const i = VIBES.findIndex((v) => v.id === activeVibe());
    applyVibe(VIBES[(i + 1) % VIBES.length].id);
  }

  function nudgeVolume(delta) {
    setSetting("volume", clamp(S.volume + delta, 0, 100));
    syncPanel();
    toast(`Volume ${S.volume}%`, "vol");
  }

  function action(act, btn) {
    if (!IS_STAGE) {
      switch (act) {
        case "toggle": return remoteActive() ? post({ cmd: "stop" }) : openStage();
        case "stop":
        case "pause":
        case "next": return post({ cmd: act });
        case "bg":
          if (remoteActive()) post({ cmd: "bg" });
          return rerollBackground(remoteActive(), btn);
        case "panel": return togglePanel();
        case "close": return closePanel();
      }
      return;
    }
    switch (act) {
      case "toggle": return run.active ? stop() : start();
      case "stop": return stop();
      case "pause": return togglePause();
      case "next": return run.active && wave(false);
      case "bg": return rerollBackground(false, btn);
      case "fs": return toggleFullscreen();
      case "panel": return togglePanel();
      case "close": return closePanel();
    }
  }

  // ==========================================================================
  // Own tab: opening, commands & status (BroadcastChannel), settings sync (storage)
  // ==========================================================================

  function openStage() {
    const url = new URL(STAGE_PATH, location.origin);
    if (S.source === "context") {
      const ctx = pageContext();
      if (ctx) url.searchParams.set("ctx", ctx.field + ":" + ctx.id);
      else toast("Not a performer/tag/studio/gallery/group page – using the whole library");
    }
    setEmptyNotice(false);
    // Fixed window name: starting again reuses the same tab instead of a new one.
    const w = window.open(url.href, "mediaStorm");
    if (!w) toast("Pop-up blocked – please allow pop-ups for Stash");
    closePanel();
  }

  const channel = "BroadcastChannel" in window ? new BroadcastChannel("mediaStorm") : null;
  const remote = { status: null, at: 0 };
  const remoteActive = () => !!(remote.status && remote.status.active && Date.now() - remote.at < 2500);

  function post(msg) {
    if (!channel) return;
    try {
      channel.postMessage(msg);
    } catch (e) { /* ignore */ }
  }

  function postStatus() {
    if (!IS_STAGE) return;
    run.lastPost = Date.now();
    post({ status: localStatus() });
  }

  if (channel) {
    channel.onmessage = (e) => {
      const m = e.data || {};
      if (IS_STAGE) {
        switch (m.cmd) {
          case "stop": return stop();
          case "pause": return togglePause();
          case "next": return run.active && wave(false);
          case "bg": return rerollBackground(false);
          case "ping": return postStatus();
        }
      } else if (m.status) {
        const was = remoteActive();
        remote.status = m.status;
        remote.at = Date.now();
        if (m.reason) toast(m.reason);
        if (m.empty) {
          setEmptyNotice(true);
          openPanel();
        }
        if (was !== remoteActive() || panelOpen()) syncState();
      }
    };
  }

  // Apply settings changed in another tab right away.
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_SETTINGS || !e.newValue) return;
    let next;
    try {
      next = normalizeSettings(JSON.parse(e.newValue));
    } catch (err) {
      return;
    }
    const old = S;
    S = next;
    Object.keys(S).forEach((k) => {
      if (JSON.stringify(old[k]) !== JSON.stringify(S[k])) onSettingChanged(k);
    });
    syncPanel();
  });

  // ==========================================================================
  // Random Backgrounds – reroll
  // ==========================================================================

  let bgTagId;
  let bgBusy = false;

  async function getBgTagId() {
    if (bgTagId !== undefined) return bgTagId;
    const d = await gql(`query { findTags(tag_filter: { name: { value: "background", modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id } } }`);
    bgTagId = (d.findTags.tags[0] || {}).id || null;
    return bgTagId;
  }

  async function pickBackground(filter, current) {
    const d = await gql(
      `query($f: FindFilterType, $i: ImageFilterType) { findImages(filter: $f, image_filter: $i) { images { paths { image } } } }`,
      { f: { per_page: 4, sort: seed() }, i: filter }
    );
    const urls = d.findImages.images.map((x) => x.paths.image).filter(Boolean);
    return urls.find((u) => u !== current) || urls[0] || null;
  }

  function preload(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = url;
    });
  }

  // Uses the same logic as the plugin (page context, otherwise tag "background"),
  // but preloads the image and avoids repeating the current one.
  async function rerollBackground(silent, btn) {
    if (!document.getElementById("stash-background-style")) {
      if (!silent) toast("The Random Backgrounds plugin is not active");
      return;
    }
    if (bgBusy) return;
    bgBusy = true;
    const spinners = [...new Set([btn, ...(panel ? panel.el.querySelectorAll('[data-act="bg"]') : [])])].filter(Boolean);
    spinners.forEach((b) => {
      b.classList.remove("ms-spin");
      void b.offsetWidth;
      b.classList.add("ms-spin");
    });
    try {
      let current = "";
      try {
        current = sessionStorage.getItem("curbgurl") || "";
      } catch (e) { /* ignore */ }
      const ctx = pageContext();
      let url = null;
      if (ctx && ctx.field !== "groups") {
        url = await pickBackground({ [ctx.field]: { value: [ctx.id], modifier: "INCLUDES" } }, current);
      }
      if (!url) {
        const id = await getBgTagId();
        if (id) url = await pickBackground({ tags: { value: [id], modifier: "INCLUDES" } }, current);
      }
      if (!url) {
        if (!silent) toast('No background images found (tag “background”)');
        return;
      }
      await preload(url);
      document.body.style.setProperty("--stash-bg-image", `url("${url}")`);
      try {
        sessionStorage.setItem("curbgurl", url);
      } catch (e) { /* ignore */ }
      if (!silent) toast("New background", "bg");
    } catch (e) {
      console.error("[MediaStorm]", e);
      if (!silent) toast("Background error: " + e.message);
    } finally {
      bgBusy = false;
    }
  }

  // ==========================================================================
  // Artwork images (off by default) for the panel cover, start screen and empty states.
  // Taken live from the library: images and scene screenshots with the tag of that name
  // and from folders with that name (including subfolders).
  // ==========================================================================

  const art = { name: null, pool: [], i: 0, loading: null };

  function loadArt() {
    const name = String(S.artName || "").trim();
    if (!S.artOn || !name) return Promise.resolve([]);
    if (art.name === name && art.loading) return art.loading;
    art.name = name;
    art.i = 0;
    art.pool = [];
    art.loading = (async () => {
      const d = await gql(
        `query($n: String!) {
          findTags(tag_filter: { name: { value: $n, modifier: EQUALS } }, filter: { per_page: 5 }) { tags { id } }
          findFolders(filter: { q: $n, per_page: 100 }) { folders { id path } }
        }`,
        { n: name }
      );
      const tagIds = d.findTags.tags.map((t) => t.id);
      const low = name.toLowerCase();
      const folderIds = d.findFolders.folders.filter((f) => baseName(f.path).toLowerCase() === low).map((f) => f.id);
      const IMG = `query($f: FindFilterType, $i: ImageFilterType) { findImages(filter: $f, image_filter: $i) {
        images { id paths { image thumbnail } visual_files { __typename } } } }`;
      const SCN = `query($f: FindFilterType, $s: SceneFilterType) { findScenes(filter: $f, scene_filter: $s) {
        scenes { id paths { screenshot } } } }`;
      const page = () => ({ per_page: 60, sort: seed() });
      const images = (filter) =>
        gql(IMG, { f: page(), i: filter }).then((x) =>
          x.findImages.images
            .filter((m) => ((m.visual_files || [])[0] || {}).__typename !== "VideoFile")
            .map((m) => ({ key: "i" + m.id, thumb: m.paths.thumbnail || m.paths.image, full: m.paths.image || m.paths.thumbnail, href: "/images/" + m.id }))
        );
      const scenes = (filter) =>
        gql(SCN, { f: page(), s: filter }).then((x) =>
          x.findScenes.scenes
            .filter((m) => m.paths.screenshot)
            .map((m) => ({ key: "s" + m.id, thumb: m.paths.screenshot, full: m.paths.screenshot, href: "/scenes/" + m.id }))
        );
      const jobs = [];
      if (tagIds.length) {
        const t = { tags: { value: tagIds, modifier: "INCLUDES" } };
        jobs.push(images(t), scenes(t));
      }
      if (folderIds.length) {
        const ff = { files_filter: { parent_folder: { value: folderIds, modifier: "INCLUDES", depth: -1 } } };
        jobs.push(images(ff), scenes(ff));
      }
      const lists = await Promise.all(jobs.map((j) => j.catch((e) => (console.warn("[MediaStorm] artwork", e), []))));
      const seen = new Set();
      const pool = [].concat(...lists).filter((a) => !seen.has(a.key) && seen.add(a.key));
      if (art.name === name) art.pool = shuffle(pool);
      return art.pool;
    })().catch((e) => {
      console.warn("[MediaStorm] artwork images", e);
      art.loading = null;
      return [];
    });
    return art.loading;
  }

  function nextArt() {
    if (!art.pool.length) return null;
    return art.pool[art.i++ % art.pool.length];
  }

  function resetArt() {
    art.name = null;
    art.loading = null;
    art.pool = [];
  }

  // Cover in the panel: next image with a diagonal wipe (like a new manga panel)
  let coverBusy = false;
  async function paintCover() {
    if (!panel || coverBusy) return;
    const cover = panel.el.querySelector("[data-cover]");
    const box = cover.querySelector(".ms-cover-art");
    const pool = await loadArt();
    const a = S.artOn && pool.length ? nextArt() : null;
    cover.classList.toggle("ms-cover-plain", !a);
    cover.title = a ? "Next image" : "";
    if (!a) return;
    coverBusy = true;
    try {
      await preload(a.thumb);
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.src = a.thumb;
      box.appendChild(img);
      void img.offsetWidth;
      img.classList.add("ms-in");
      const old = [...box.querySelectorAll("img")].slice(0, -1);
      setTimeout(() => {
        old.forEach((o) => o.remove());
        img.classList.add("ms-set"); // force the end state in case the transition hung in a background tab
      }, 600);
    } finally {
      coverBusy = false;
    }
  }

  // Changes every 7 s while the panel is open and the mouse isn't on the cover.
  setInterval(() => {
    if (!panelOpen() || document.hidden || !S.artOn || panel.page !== "home") return;
    const cover = panel.el.querySelector("[data-cover]");
    if (!cover.matches(":hover")) paintCover();
  }, 7000);

  // Start screen in the storm tab until the first item appears
  function showSplash() {
    const el = document.createElement("div");
    el.className = "ms-splash";
    el.innerHTML =
      '<div class="ms-splash-card"><div class="ms-splash-art"></div>' +
      '<div class="ms-title" aria-hidden="true"><span>Media</span><span>Storm</span></div></div>' +
      '<div class="ms-splash-sub">First wave loading …</div>';
    run.dom.root.appendChild(el);
    run.dom.splash = el;
    run.splashAt = Date.now();
    loadArt().then(() => {
      const a = nextArt();
      if (!a || !run.dom || run.dom.splash !== el) return;
      const img = new Image();
      img.alt = "";
      img.onload = () => el.querySelector(".ms-splash-art").appendChild(img);
      img.src = a.full;
    });
    setTimeout(hideSplash, 6000);
  }

  function hideSplash() {
    const el = run.dom && run.dom.splash;
    if (!el) return;
    run.dom.splash = null;
    const wait = Math.max(0, 1100 - (Date.now() - run.splashAt));
    setTimeout(() => {
      el.classList.add("ms-gone");
      setTimeout(() => el.remove(), 650);
    }, wait);
  }

  let artTimer;

  // Empty state in the panel: filters return nothing
  let emptyNotice = false;

  function renderEmpty() {
    if (!panel) return;
    const box = panel.el.querySelector("[data-empty]");
    box.hidden = !emptyNotice;
    if (!emptyNotice) return;
    const pic = box.querySelector(".ms-empty-pic");
    pic.innerHTML = "";
    loadArt().then(() => {
      const a = nextArt();
      if (a && emptyNotice) pic.innerHTML = `<img src="${esc(a.thumb)}" alt="">`;
    });
  }

  function setEmptyNotice(on) {
    if (emptyNotice === on) return;
    emptyNotice = on;
    renderEmpty();
  }

  function clearFilters() {
    Object.assign(S, { source: "library", includeTags: [], excludeTags: [], tagMatchAll: false, markerTags: [], tagsDeep: false, tagTarget: "scene", perfs: [], perfMatchAll: false, minRating: 0, favPerformers: false, maxRes: "any", minLen: 0, folders: [] });
    save();
    filtersChanged();
    syncPanel();
    toast("Filters reset – whole library");
  }

  // ==========================================================================
  // Apply settings
  // ==========================================================================

  function setSetting(key, value) {
    S[key] = value;
    if (key === "sizeMin" && S.sizeMax < value) S.sizeMax = value;
    if (key === "sizeMax" && S.sizeMin > value) S.sizeMin = value;
    save();
    onSettingChanged(key);
  }

  function filtersChanged() {
    run.empty = { image: false, scene: false, marker: false, redgifs: run.empty.redgifs };
    setEmptyNotice(false);
  }

  function onSettingChanged(key) {
    switch (key) {
      case "glass":
        applyGlass();
        break;
      case "volume":
      case "audioMode":
        applyAudio();
        break;
      case "loop":
        run.items.forEach((it) => {
          if (it.video && !it.d.isVid) it.video.loop = S.loop;
        });
        break;
      case "dim":
      case "blur":
      case "kenBurns":
      case "fadeMs":
      case "showHud":
      case "frame":
      case "fxMotion":
      case "fxBlend":
      case "fxPulse":
      case "fxHue":
      case "fxTexture":
      case "fxMirror":
      case "fx3d":
        applyLook();
        break;
      case "layout":
      case "aspect":
      case "gap":
      case "columns":
      case "flowSpeed":
        applyLook();
        relayoutAll(true);
        break;
      case "rotation":
        if (FLOW.has(S.layout)) relayoutAll(true);
        break;
      case "maxItems":
        if (run.active) {
          trimToMax();
          if (S.layout === "grid" || FLOW.has(S.layout)) relayoutAll(true);
        }
        break;
      case "intervalSec":
        if (run.active) run.nextAt = Math.min(run.nextAt, Date.now() + S.intervalSec * 1000);
        break;
      case "songVol":
        if (beat.gain) beat.gain.gain.setTargetAtTime(S.songVol / 100, beat.ac.currentTime, 0.05);
        break;
      case "beatSync":
      case "songId":
        // If both changes arrive at once (song picked in the Stash tab), restart only once
        if (IS_STAGE && run.active) {
          clearTimeout(beat.restartT);
          beat.restartT = setTimeout(() => {
            if (!run.active) return;
            beatStop();
            if (S.beatSync) beatStart();
          }, 0);
        }
        break;
      case "sleepMin":
        if (run.active) {
          run.sleepAt = S.sleepMin ? Date.now() + S.sleepMin * 60000 : 0;
          run.sleepLeft = S.sleepMin * 60000;
        }
        break;
      case "source":
        // a playlist as source: take the first one if none is chosen yet
        if (S.source === "playlist" && msPlaylists && msPlaylists.length && !msPlaylists.some((p) => p.id === S.playlist)) {
          S.playlist = msPlaylists[0].id;
          save();
        }
        syncPanel();
        if (run.active) {
          run.ctx = S.source === "context" ? pageContext() : null;
          if (run.ctx) describeContext(run.ctx).then((label) => toast("Source – " + label));
        }
        filtersChanged();
        break;
      case "tagTarget":
        syncPanel();
        break;
      case "includeTags":
      case "excludeTags":
      case "markerTags":
      case "tagsDeep":
      case "tagMatchAll":
      case "perfs":
      case "perfMatchAll":
      case "minRating":
      case "favPerformers":
      case "maxRes":
      case "minLen":
      case "playlist":
      case "folders":
        filtersChanged();
        break;
      case "rgPct":
      case "rgPicks":
      case "rgOrder":
      case "rgQuality":
        rgReset();
        break;
      case "artOn":
      case "artName":
        resetArt();
        clearTimeout(artTimer);
        artTimer = setTimeout(() => {
          paintCover();
          renderEmpty();
        }, key === "artName" ? 500 : 0);
        break;
    }
    updateHud();
  }

  function applyAll() {
    applyLook();
    applyAudio();
    onSettingChanged("loop");
    onSettingChanged("maxItems");
    relayoutAll(true);
    filtersChanged();
    rgReset();
  }

  // ==========================================================================
  // Panel
  // ==========================================================================

  const FORMAT = {
    intervalSec: (v) => v + " s",
    batchSize: (v) => v,
    firstBatch: (v) => v,
    maxItems: (v) => v,
    streamLimit: (v) => (v ? v : "auto"),
    videoPct: (v) => `${100 - v} % images, ${v} % videos`,
    markerPct: (v) => (v ? v + " % of the videos" : "off"),
    volume: (v) => (v ? v + " %" : "muted"),
    sizeMin: (v) => v + " %",
    sizeMax: (v) => v + " %",
    rotation: (v) => "±" + v + "°",
    gap: (v) => v + " px",
    columns: (v) => (v ? v : "auto"),
    flowSpeed: (v) => v + " px/s",
    fadeMs: (v) => v + " ms",
    fxPulse: (v) => (v ? v + " BPM" : "off"),
    fxHue: (v) => (v ? "level " + v : "off"),
    fxGlitch: (v) => (v ? "level " + v : "off"),
    dim: (v) => v + " %",
    blur: (v) => (v ? v + " px" : "off"),
    sleepMin: (v) => (v ? v + " min" : "off"),
    songVol: (v) => v + " %",
    autoBgEvery: (v) => (v ? "every " + v + " waves" : "off"),
    rgPct: (v) => (v ? v + " % of items" : "off"),
  };

  const rng = (key, label, min, max, step) =>
    `<label class="ms-row"><span>${label}</span><output data-out="${key}"></output>` +
    `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step || 1}"></label>`;
  const chk = (key, label) =>
    `<label class="ms-chk"><input type="checkbox" data-key="${key}"><i></i><span>${label}</span></label>`;
  const sel = (key, label, opts, numeric) =>
    `<label class="ms-row"><span>${label}</span><select data-key="${key}"${numeric ? " data-num" : ""}>` +
    opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("") +
    "</select></label>";
  const txt = (key, label, placeholder) =>
    `<label class="ms-row ms-text"><span>${label}</span>` +
    `<input class="ms-input" type="text" data-key="${key}" placeholder="${placeholder}" autocomplete="off" spellcheck="false" data-fb-done="1"></label>`;
  const tagBox = (key, label, what) =>
    `<div class="ms-tags" data-tags="${key}"${what ? ` data-what="${what}"` : ""}><span>${label}</span><div class="ms-chips"></div>` +
    `<input class="ms-input" type="text" placeholder="${what === "performer" ? "Search performer…" : "Search tag…"}" autocomplete="off" data-fb-done="1"><div class="ms-sugg" hidden></div></div>`; // data-fb-done: see "Robust against themes" in the CSS
  // Only visible if the current layout is in the list
  const cond = (when, body) => `<div class="ms-cond" data-when="${when}">${body}</div>`;
  const hint = (t) => `<p class="ms-hint">${t}</p>`;
  const sub = (t) => `<div class="ms-subhead">${t}</div>`;

  // Mini sketches of the layouts (viewBox 48×32)
  const LAYOUT_SKETCH = {
    chaos: '<rect x="4" y="5" width="13" height="10" transform="rotate(-10 10 10)"/><rect x="27" y="3" width="10" height="13" transform="rotate(8 32 9)"/><rect x="15" y="17" width="14" height="10" transform="rotate(5 22 22)"/><rect x="35" y="19" width="9" height="9" transform="rotate(-6 39 23)"/>',
    pile: '<rect x="14" y="7" width="16" height="12" transform="rotate(-12 22 13)"/><rect x="17" y="9" width="16" height="12" transform="rotate(7 25 15)"/><rect x="15" y="12" width="16" height="12" transform="rotate(-3 23 18)"/>',
    grid: '<rect x="4" y="4" width="12" height="11"/><rect x="18" y="4" width="12" height="11"/><rect x="32" y="4" width="12" height="11"/><rect x="4" y="17" width="12" height="11"/><rect x="18" y="17" width="12" height="11"/><rect x="32" y="17" width="12" height="11"/>',
    mosaic: '<rect x="4" y="3" width="12" height="15"/><rect x="4" y="20" width="12" height="9"/><rect x="18" y="3" width="12" height="8"/><rect x="18" y="13" width="12" height="16"/><rect x="32" y="3" width="12" height="12"/><rect x="32" y="17" width="12" height="12"/>',
    spotlight: '<rect x="17" y="8" width="14" height="16"/><rect x="5" y="4" width="7" height="6"/><rect x="36" y="4" width="7" height="6"/><rect x="4" y="21" width="7" height="6"/><rect x="37" y="21" width="7" height="6"/><rect x="21" y="1.5" width="6" height="4.5"/>',
    spiral: '<circle cx="24" cy="16" r="4.5"/><circle cx="30.5" cy="11" r="3.2"/><circle cx="17.5" cy="10" r="3"/><circle cx="16" cy="21.5" r="2.7"/><circle cx="28.5" cy="23.5" r="2.5"/><circle cx="36.5" cy="17" r="2.2"/><circle cx="10.5" cy="15" r="2"/><circle cx="23" cy="4.5" r="1.8"/>',
    ticker: '<rect x="2" y="4" width="11" height="10"/><rect x="16" y="4" width="11" height="10"/><rect x="30" y="4" width="11" height="10"/><rect x="9" y="18" width="11" height="10"/><rect x="23" y="18" width="11" height="10"/><rect x="37" y="18" width="9" height="10"/>',
    rain: '<rect x="6" y="2" width="9" height="11"/><rect x="21" y="12" width="9" height="11"/><rect x="34" y="5" width="9" height="11"/><path d="M10.5 16v5M25.5 26v4M38.5 19v6" stroke-dasharray="2 2"/>',
  };
  const sketch = (layout) => `<svg viewBox="0 0 48 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${LAYOUT_SKETCH[layout]}</svg>`;

  const LAYOUT_HINTS = {
    chaos: "Scattered everywhere. Drag to move, mouse wheel to scale.",
    pile: "Like photos on a table, heaped towards the middle.",
    grid: "Fixed cells that fill the whole screen.",
    mosaic: "Pinboard columns: new items come in at the top, the rest slides down.",
    spotlight: "The newest item big in the middle, the older ones in a circle around it.",
    spiral: "Sunflower spiral with the newest item in the middle – every wave turns everything further.",
    ticker: "Lanes from right to left. Items that have passed make room for new ones.",
    rain: "Falls through from the top. At the bottom, items make room for new ones.",
  };

  // ---------- Moods (built-in presets) ----------
  // Set tempo, media mix, layout and effects. Source, filters, volume, RedGifs and background stay.

  const VIBE_KEYS = [
    "intervalSec", "batchSize", "firstBatch", "maxItems", "endless", "videoPct", "audioMode",
    "layout", "sizeMin", "sizeMax", "rotation", "aspect", "frame", "gap", "columns", "avoidOverlap", "flowSpeed",
    "fadeMs", "kenBurns", "fxEnter", "fxMotion", "fxBlend", "fxPulse", "fxHue", "fxGlitch", "fxTexture", "fxMirror", "fx3d", "fxFlash", "fxShake",
  ];

  const VIBES = [
    { id: "default", name: "Default", desc: "Chaos as usual", set: {} },
    { id: "chill", name: "Chill", desc: "Pile, calm, breathing", set: { intervalSec: 6, batchSize: 1, firstBatch: 4, maxItems: 12, videoPct: 25, audioMode: "newest", layout: "pile", rotation: 10, fadeMs: 1400, fxEnter: "fade", fxMotion: "breathe", fxTexture: "vignette" } },
    { id: "storm", name: "Storm", desc: "Fast, full, shaking", set: { intervalSec: 2, batchSize: 5, firstBatch: 14, maxItems: 60, endless: true, layout: "chaos", sizeMin: 10, sizeMax: 30, rotation: 22, fadeMs: 350, fxEnter: "slam", fxMotion: "drift", fxGlitch: 3, fxShake: true, fxFlash: true } },
    { id: "gallery", name: "Gallery", desc: "Mosaic, tidy", set: { intervalSec: 3, batchSize: 2, firstBatch: 14, maxItems: 30, endless: true, layout: "mosaic", rotation: 0, frame: "none", kenBurns: false, fxEnter: "fade" } },
    { id: "cinema", name: "Cinema", desc: "Spotlight, videos only", set: { intervalSec: 12, batchSize: 1, firstBatch: 4, maxItems: 7, endless: true, videoPct: 100, audioMode: "newest", layout: "spotlight", rotation: 6, fadeMs: 1000, fxTexture: "vignette" } },
    { id: "trip", name: "Trip", desc: "Spiral, colors, 3D", set: { intervalSec: 3, batchSize: 2, firstBatch: 10, maxItems: 36, endless: true, layout: "spiral", rotation: 14, fxEnter: "spin", fxMotion: "wobble", fxBlend: "screen", fxPulse: 120, fxHue: 6, fxTexture: "vhs", fx3d: true } },
    { id: "ticker", name: "Ticker", desc: "Polaroids drift by", set: { intervalSec: 3, batchSize: 2, firstBatch: 8, maxItems: 30, endless: true, layout: "ticker", sizeMin: 26, sizeMax: 34, rotation: 4, frame: "polaroid", gap: 14, flowSpeed: 120, fxEnter: "fade" } },
    { id: "rain", name: "Rain", desc: "Falls through from the top", set: { intervalSec: 2, batchSize: 3, firstBatch: 6, maxItems: 40, endless: true, layout: "rain", sizeMin: 12, sizeMax: 26, rotation: 14, flowSpeed: 90, fxEnter: "fade", fxMotion: "wobble" } },
    { id: "manga", name: "Manga", desc: "Ink, halftone, impact", set: { intervalSec: 3, batchSize: 2, firstBatch: 8, maxItems: 24, layout: "chaos", avoidOverlap: true, rotation: 6, frame: "manga", fxEnter: "slam", fxTexture: "halftone", fxShake: true } },
    { id: "neon", name: "Neon", desc: "Glow, glitch, beat", set: { intervalSec: 3, batchSize: 2, firstBatch: 12, maxItems: 20, endless: true, layout: "grid", gap: 18, rotation: 0, frame: "neon", fxEnter: "glitch", fxBlend: "screen", fxPulse: 100, fxGlitch: 5, fxTexture: "grain" } },
  ];

  function activeVibe() {
    const v = VIBES.find((x) => VIBE_KEYS.every((k) => JSON.stringify(S[k]) === JSON.stringify(k in x.set ? x.set[k] : DEFAULTS[k])));
    return v ? v.id : null;
  }

  function applyVibe(id) {
    const v = VIBES.find((x) => x.id === id);
    if (!v) return;
    VIBE_KEYS.forEach((k) => (S[k] = clone(k in v.set ? v.set[k] : DEFAULTS[k])));
    save();
    applyAll();
    if (run.active) run.nextAt = Math.min(run.nextAt, Date.now() + S.intervalSec * 1000);
    syncPanel();
    toast(`Mood “${v.name}”`, "vibe");
  }

  // ---------- Pages & tiles ----------

  const PAGES = [
    {
      id: "tempo", icon: "clock", title: "Tempo",
      body: () =>
        rng("intervalSec", "New wave every", 1, 60) +
        rng("batchSize", "Items per wave", 1, 20) +
        rng("firstBatch", "First wave (right away)", 1, 40) +
        rng("maxItems", "At most at once", 1, 150) +
        chk("endless", "Endless – replace the oldest items instead of stopping") +
        rng("sleepMin", "Sleep timer", 0, 180, 5) +
        hint("The sleep timer stops with a fade-out and closes the storm tab."),
    },
    {
      id: "beat", icon: "wave", title: "On the beat",
      body: () =>
        chk("beatSync", "Waves on the beat of a song") +
        '<div class="ms-song"><span class="ms-song-name" data-songname></span>' +
        '<button class="ms-btn" data-act2="song-pick">Choose song …</button>' +
        '<button class="ms-btn ms-danger" data-act2="song-del">Remove</button>' +
        '<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" data-songfile hidden></div>' +
        sel("beatEvery", "New wave", [[0, "Automatic by loudness"], [1, "On every beat"], [2, "Every 2 beats"], [4, "Every bar (4 beats)"], [8, "Every 2 bars"]], true) +
        rng("songVol", "Song volume", 0, 100, 5) +
        hint("The storm tab detects tempo and beats itself (a few seconds per song), and the song loops. New items load ahead and appear exactly on the beat. Automatic: calm parts every bar, medium every 2 beats, loud every beat – drops right away. With pulse, the stage pumps on every beat; flash and shake come with the waves. “New wave every” doesn't apply then."),
    },
    {
      id: "media", icon: "image", title: "Media",
      body: () =>
        rng("videoPct", "Mix", 0, 100, 5) +
        rng("markerPct", "Marker clips", 0, 100, 5) +
        hint("Marker clips are the short moments you marked in your scenes. This share of the videos plays them (only the marked part, looping) instead of whole scenes. Choose which markers under Source & filters.") +
        sel("imageQuality", "Image quality", [["full", "Original"], ["thumb", "Thumbnail (faster)"]]) +
        sel("videoSource", "Video source", [["stream", "Full video"], ["preview", "Preview clip (lighter)"]]) +
        rng("streamLimit", "Full videos at once", 0, 60) +
        hint("0 = automatic: Media Storm measures how quickly Stash still answers and plays as many full videos as the connection allows. Over plain HTTP, browsers keep only about 6 connections to one server – when they're all taken, Stash stops answering in this browser. Further videos play as preview clips (or show their cover).") +
        chk("loop", "Loop videos (off = fade out after the end)") +
        chk("randomStart", "Random start point in the video"),
    },
    {
      id: "sound", icon: "speaker", title: "Sound",
      body: () =>
        rng("volume", "Volume", 0, 100) +
        sel("audioMode", "Audible", [["all", "All videos"], ["hover", "Only under the mouse"], ["newest", "Only the newest video"], ["mute", "Muted"]]) +
        hint("A freshly opened storm tab may only play sound after a click or key press."),
    },
    {
      id: "layout", icon: "grid", title: "Layout",
      body: () =>
        `<div class="ms-lays">${Object.keys(LAYOUT_NAMES).map((k) =>
          `<button class="ms-lay" data-set="layout" data-val="${k}">${sketch(k)}<span>${LAYOUT_NAMES[k]}</span></button>`).join("")}</div>` +
        '<p class="ms-hint ms-lay-hint" data-layout-hint></p>' +
        cond("chaos,pile,spiral,ticker,rain", rng("sizeMin", "Size min", 5, 80) + rng("sizeMax", "Size max", 5, 80)) +
        cond("chaos,pile,spotlight,spiral,ticker,rain", rng("rotation", "Rotation", 0, 45)) +
        cond("grid,mosaic,ticker", rng("gap", "Spacing", 0, 40)) +
        cond("grid,mosaic", rng("columns", "Columns", 0, 12)) +
        cond("ticker,rain", rng("flowSpeed", "Speed", 20, 400, 10)) +
        cond("chaos", chk("avoidOverlap", "Avoid overlap – free spots first")) +
        sub("Shape") +
        sel("aspect", "Format", [["orig", "Original"], ["square", "Square"], ["portrait", "Portrait 3:4"], ["landscape", "Landscape 16:9"]]) +
        sel("frame", "Frame", FRAMES.map((f) => [f, FRAME_NAMES[f]])),
    },
    {
      id: "fx", icon: "sparkle", title: "Effects",
      body: () =>
        sub("Motion") +
        sel("fxEnter", "Appear", [["zoom", "Zoom"], ["fade", "Fade in"], ["slam", "Slam"], ["flip", "Flip"], ["fall", "Fall"], ["spin", "Spin"], ["glitch", "Glitch"], ["random", "Random"]]) +
        sel("fxMotion", "Afterwards", [["none", "Hold still"], ["drift", "Drift"], ["breathe", "Breathe"], ["wobble", "Wobble"], ["random", "Mixed"]]) +
        rng("fadeMs", "Fade in and out", 100, 3000, 50) +
        chk("kenBurns", "Ken Burns zoom on images") +
        sub("Rush") +
        rng("fxPulse", "Pulse", 0, 180, 10) +
        rng("fxHue", "Color rush", 0, 10) +
        rng("fxGlitch", "Glitch", 0, 10) +
        sel("fxBlend", "Blending", [["normal", "Normal"], ["screen", "Double exposure"], ["difference", "Negative rush"]]) +
        sel("fxTexture", "Texture", [["none", "None"], ["grain", "Film grain"], ["vhs", "VHS"], ["halftone", "Halftone"], ["vignette", "Vignette"]]) +
        chk("fx3d", "3D depth – parallax with the mouse") +
        chk("fxMirror", "Reflection under every item") +
        sub("On every new wave") +
        chk("fxShake", "Shake") +
        chk("fxFlash", "Flash") +
        hint("The flash is gentle and comes at most once per wave."),
    },
    {
      id: "bg", icon: "dice", title: "Background",
      body: () =>
        `<button class="ms-wide" data-act="bg">${icon("dice")}<span>Reroll background</span><small data-rb></small></button>` +
        rng("autoBgEvery", "Reroll automatically", 0, 30) +
        rng("dim", "Darken", 0, 95) +
        rng("blur", "Blur", 0, 20) +
        chk("showHud", "Show the HUD in the storm tab") +
        sub("Artwork in the design") +
        chk("artOn", "Show images in the panel and at the start") +
        txt("artName", "Tag or folder", "e.g. Artwork") +
        hint("Uses images and scene screenshots with this tag and from folders with the same name. Click the cover for the next image."),
    },
    {
      id: "source", icon: "filter", title: "Source & filters",
      body: () =>
        sel("source", "Source", [["library", "Whole library"], ["context", "Current page (performer/tag/…)"], ["playlist", "A playlist (from Stash UI)"]]) +
        '<div class="ms-cond-src" data-src="playlist">' + sel("playlist", "Playlist", [["", "–"]]) +
        hint("Stash UI's smart playlists: set filters in Scenes or Images there and press “Save as playlist”. The playlist decides – the filters below don't apply.") + "</div>" +
        '<div class="ms-cond-src" data-src="filters">' +
        hint("“Current page” uses the performer, tag, studio, gallery or group page you start from. On tag pages, your own tags always all have to match.") +
        sel("tagTarget", "Tags apply to", [["scene", "Scenes and images"], ["marker", "Marker clips"]]) +
        tagBox("includeTags", "Only with tags").replace('class="ms-tags"', 'class="ms-tags" data-tt="scene"') +
        tagBox("markerTags", "Only with tags (marker clips)", "marker").replace('class="ms-tags"', 'class="ms-tags" data-tt="marker"') +
        '<p class="ms-hint" data-tt-other hidden></p>' +
        chk("tagMatchAll", "All tags must match") +
        tagBox("excludeTags", "Exclude tags") +
        chk("tagsDeep", "Including sub-tags (recursive)") +
        hint("The tag box edits the kind chosen above; the other kind keeps its own tags. Marker clips need a share under Media – their tags are the marker's primary or extra tag, and the filters apply to the marker's scene too. Exclude tags and the two switches count for all kinds.") +
        tagBox("perfs", "Only with performers", "performer") +
        chk("perfMatchAll", "All performers must be in it") +
        sel("minRating", "Minimum rating", [[0, "any"], [1, "★"], [2, "★★"], [3, "★★★"], [4, "★★★★"], [5, "★★★★★"]], true) +
        chk("favPerformers", "Only with favorite performers") +
        sel("maxRes", "Resolution up to", [["any", "any"], ["720", "720p"], ["1080", "1080p"], ["1440", "1440p"]]) +
        sel("minLen", "Videos at least", [[0, "any length"], [60, "1 min"], [300, "5 min"], [1200, "20 min"]], true) +
        hint("A lower resolution runs smoother – 4K videos take the most.") + "</div>",
    },
    {
      id: "folders", icon: "folder", title: "Folders",
      body: () =>
        '<div class="ms-folders"><div class="ms-chips" data-fchips></div>' +
        '<input class="ms-input" type="text" data-fsearch placeholder="Filter folders…" autocomplete="off" spellcheck="false">' +
        '<div class="ms-ftree" data-ftree><div class="ms-hint">Loading folders…</div></div>' +
        hint("Without a choice, the whole library is used. Subfolders are always included. Numbers: images (I) and videos (V).") + "</div>",
    },
    {
      id: "rg", badge: '<i class="ms-rg ms-rg-tile">RG</i>', title: "RedGifs",
      body: () =>
        rng("rgPct", "RedGifs share", 0, 100, 5) +
        '<div class="ms-rgpick"><span>Niches, tags &amp; creators</span><div class="ms-chips" data-rgchips></div>' +
        '<input class="ms-input" type="text" data-rgq placeholder="Search niches, tags, creators …" autocomplete="off" spellcheck="false" data-fb-done="1">' +
        '<div class="ms-sugg ms-sugg-rg" hidden></div></div>' +
        sel("rgOrder", "Sort order", [["trending", "Trending"], ["top7", "Top of the week"], ["top28", "Top of the month"], ["top", "Top (all time)"], ["latest", "Latest"]]) +
        sel("rgQuality", "Quality", [["sd", "SD (faster)"], ["hd", "HD"]]) +
        hint("Typing shows matching niches, tags and creators live – click (or ↑/↓ + Enter) to add them. Several are possible; one of them is picked at random per fetch. Without a choice you get trending. RedGifs only plays in the storm tab.") +
        sub("Saving (⬇ on hover or key D)") +
        sel("rgDlLayout", "Folders", [["source", "By source (niche/tag/creator)"], ["creator", "By the clip's creator"], ["flat", "Everything in one folder"]]) +
        txt("rgDlDir", "Save location", "…/RedGifs") +
        hint("Always saved in HD. If the save location is inside your Stash library, Stash scans the folder right away and the scene gets the link, title and the tag “RedGifs”."),
    },
    {
      id: "presets", icon: "bookmark", title: "My presets",
      body: () =>
        '<div class="ms-presets"><select class="ms-input" data-preset></select>' +
        '<button class="ms-btn" data-act2="preset-load">Load</button>' +
        '<button class="ms-btn ms-danger" data-act2="preset-del">Delete</button></div>' +
        '<div class="ms-presets"><input class="ms-input" type="text" data-preset-name placeholder="Name for a new preset">' +
        '<button class="ms-btn" data-act2="preset-save" style="grid-column: span 2">Save</button></div>' +
        hint("A preset of your own saves all settings, including source, filters and RedGifs.") +
        '<button class="ms-btn" data-act2="reset">Reset everything to defaults</button>',
    },
    {
      id: "keys", icon: "keyboard", title: "Hotkeys & mouse", tile: false,
      body: () =>
        '<div class="ms-keys">' +
        [
          ["Esc", "Stop everything (with fade-out)"],
          ["Space", "Pause / resume"],
          ["N", "Next wave right away"],
          ["V", "Next mood"],
          ["L", "Change layout"],
          ["B", "Reroll background"],
          ["C", "Remove all items"],
          ["F", "Fullscreen"],
          ["H", "HUD on/off"],
          ["S", "This panel"],
          ["↑ / ↓", "Volume ±5"],
          ["D", "Save the RedGifs clip under the mouse to Stash"],
          ["Click", "Show item big"],
          ["Ctrl+click", "Open in Stash or on RedGifs"],
          ["Right-click", "Remove item"],
          ["Drag", "Move item (chaos, pile)"],
          ["Mouse wheel", "Scale item (chaos, pile)"],
        ].map(([k, t]) => `<kbd>${k}</kbd><span>${t}</span>`).join("") +
        "</div>",
    },
  ];

  const AUDIO_NAMES = { all: "all videos", hover: "under the mouse", newest: "newest video", mute: "muted" };

  // Summary on every tile
  const SUMS = {
    tempo: () => `${S.beatSync ? "On the beat" : "Every " + S.intervalSec + " s"} ${S.batchSize} new, max ${S.maxItems}${S.endless ? " endless" : ""}`,
    beat: () => (!S.beatSync ? "Off" : S.songName ? S.songName.replace(/\.[^.]+$/, "") + (beat.song ? ` · ${Math.round(beat.song.bpm)} BPM` : "") : "No song chosen"),
    media: () => `${S.videoPct} % videos${S.markerPct ? ", " + S.markerPct + " % marker clips" : ""}${S.videoSource === "preview" ? ", preview clips" : ""}`,
    sound: () => (S.audioMode === "mute" || !S.volume ? "Muted" : `${S.volume} %, ${AUDIO_NAMES[S.audioMode]}`),
    layout: () => `${LAYOUT_NAMES[S.layout]}, frame ${FRAME_NAMES[S.frame] || ""}`.replace(/, frame Soft$/, ""),
    fx: () => {
      const on = [];
      if (S.fxEnter !== "zoom") on.push({ fade: "Fade in", slam: "Slam", flip: "Flip", fall: "Fall", spin: "Spin", glitch: "Glitch start", random: "Random start" }[S.fxEnter]);
      if (S.fxMotion !== "none") on.push({ drift: "Drift", breathe: "Breathe", wobble: "Wobble", random: "Motion" }[S.fxMotion]);
      if (S.fxPulse) on.push("Pulse");
      if (S.fxHue) on.push("Color rush");
      if (S.fxGlitch) on.push("Glitch");
      if (S.fxBlend !== "normal") on.push(S.fxBlend === "screen" ? "Double exposure" : "Negative");
      if (S.fxTexture !== "none") on.push({ grain: "Film grain", vhs: "VHS", halftone: "Halftone", vignette: "Vignette" }[S.fxTexture]);
      if (S.fx3d) on.push("3D");
      if (S.fxMirror) on.push("Reflection");
      if (S.fxShake) on.push("Shake");
      if (S.fxFlash) on.push("Flash");
      return on.length ? on.join(", ") : "Just zoom and fade";
    },
    bg: () => `Darkened ${S.dim} %${S.blur ? ", soft" : ""}${S.autoBgEvery ? ", rerolls itself" : ""}`,
    source: () => {
      if (S.source === "playlist") {
        const pl = (msPlaylists || []).find((x) => x.id === S.playlist);
        return pl ? `Playlist “${pl.name}”` : "A playlist";
      }
      const p = [S.source === "context" ? "Current page" : "Whole library"];
      if (S.includeTags.length) p.push(S.includeTags.length + (S.includeTags.length === 1 ? " tag" : " tags"));
      if (S.excludeTags.length) p.push("without " + S.excludeTags.length);
      if (S.markerTags.length) p.push(S.markerTags.length + (S.markerTags.length === 1 ? " marker tag" : " marker tags") + (S.tagsDeep ? " +sub" : ""));
      if (S.perfs.length) p.push(S.perfs.length === 1 ? S.perfs[0].name : S.perfs.length + " performers");
      if (S.minRating) p.push("from " + "★".repeat(S.minRating));
      if (S.favPerformers) p.push("favorites");
      if (S.maxRes !== "any") p.push("up to " + S.maxRes + "p");
      if (S.minLen) p.push("≥ " + S.minLen / 60 + " min");
      return p.join(", ");
    },
    folders: () => (S.folders.length ? S.folders.map((f) => baseName(f.path)).join(", ") : "All folders"),
    rg: () => (S.rgPct ? `${S.rgPct} %, ${S.rgPicks.length ? S.rgPicks.map(rgPickText).join(", ") : "Trending"}` : "Off"),
    presets: () => {
      const n = Object.keys(store.get(LS_PRESETS, {})).length;
      return n ? `${n} saved` : "None yet";
    },
  };

  // Tile marked when something there narrows the selection or is additionally active
  const MODS = {
    fx: () => SUMS.fx() !== "Just zoom and fade",
    source: () => S.source !== "library" || S.includeTags.length > 0 || S.excludeTags.length > 0 || S.markerTags.length > 0 || S.perfs.length > 0 || S.minRating > 0 || S.favPerformers || S.maxRes !== "any" || S.minLen > 0,
    folders: () => S.folders.length > 0,
    rg: () => S.rgPct > 0,
    beat: () => S.beatSync,
  };

  function panelHtml() {
    return `
      <button class="ms-icbtn ms-p-close" data-act="close" title="Close (Esc)" aria-label="Close panel">${icon("close")}</button>
      <div class="ms-p-body">
        <div class="ms-home">
          <div class="ms-cover ms-cover-plain" data-cover>
            <div class="ms-cover-art"></div>
            <h2 class="ms-title"><span>Media</span><span>Storm</span></h2>
          </div>
          <div class="ms-state" data-state="idle"><span class="ms-state-mark"></span><b data-status>Ready</b><span class="ms-state-nums" data-nums></span><span class="ms-state-glass">${chk("glass", "Liquid glass")}</span></div>
          <div class="ms-ctrl">
            <button class="ms-big" data-act="toggle">${icon("play")}<span>Start</span></button>
            <button class="ms-icbtn ms-sq" data-act="pause" title="Pause / resume (Space)">${icon("pause")}</button>
            <button class="ms-icbtn ms-sq" data-act="next" title="Next wave now (N)">${icon("next")}</button>
            <button class="ms-icbtn ms-sq" data-act="bg" title="Reroll background (B)">${icon("dice")}</button>
          </div>
          <div class="ms-empty" data-empty hidden>
            <div class="ms-empty-pic"></div>
            <div>
              <b>Nothing found</b>
              <p>With these filters there are no images or videos. Loosen tags, folders or rating – or reset everything.</p>
              <button class="ms-btn" data-act2="clear-filters">Reset filters</button>
            </div>
          </div>
          <h3 class="ms-block-head">Mood</h3>
          <div class="ms-vibes" role="group" aria-label="Mood">
            ${VIBES.map((v) => `<button class="ms-vibe" data-vibe="${v.id}" aria-pressed="false">${sketch(v.set.layout || DEFAULTS.layout)}<b>${v.name}</b><small>${v.desc}</small></button>`).join("")}
          </div>
          <h3 class="ms-block-head">Settings</h3>
          <div class="ms-tiles">
            ${PAGES.filter((p) => p.tile !== false).map((p) =>
              `<button class="ms-tile" data-page="${p.id}">${p.badge || icon(p.icon)}<b>${p.title}</b><small data-sum="${p.id}"></small></button>`).join("")}
          </div>
          <button class="ms-link" data-page="keys">${icon("keyboard")}<span>Hotkeys &amp; mouse</span></button>
          <div class="ms-foot">Media Storm 2.3.4</div>
        </div>
        ${PAGES.map((p) => `
          <section class="ms-page" data-page-id="${p.id}" hidden>
            <div class="ms-page-head">
              <button class="ms-icbtn ms-back" data-page="home" title="Back to the overview (Esc)" aria-label="Back">${icon("back")}</button>
              <h3>${p.title}</h3>
            </div>
            <div class="ms-page-body">${p.body()}</div>
          </section>`).join("")}
      </div>`;
  }

  function showPage(id) {
    if (!panel) return;
    const el = panel.el;
    const body = el.querySelector(".ms-p-body");
    const home = el.querySelector(".ms-home");
    if (!home.hidden && id !== "home") panel.homeScroll = body.scrollTop;
    home.hidden = id !== "home";
    el.querySelectorAll(".ms-page").forEach((p) => {
      const on = p.dataset.pageId === id;
      if (p.hidden !== !on) {
        p.hidden = !on;
        if (on) p.dispatchEvent(new Event("ms-open"));
      }
    });
    el.dataset.view = id;
    panel.page = id;
    if (id === "home") {
      body.scrollTop = panel.homeScroll || 0;
      const t = el.querySelector(`[data-page="${panel.lastPage}"]:not(.ms-back)`);
      if (t) t.focus({ preventScroll: true });
    } else {
      panel.lastPage = id;
      body.scrollTop = 0;
      el.querySelector(`.ms-page[data-page-id="${id}"] .ms-back`).focus({ preventScroll: true });
    }
  }

  let panel = null;

  function ensurePanel() {
    if (panel) return panel;
    const el = document.createElement("div");
    el.className = "ms-panel";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Media Storm");
    el.innerHTML = panelHtml();
    document.body.appendChild(el);
    panel = { el, status: el.querySelector("[data-status]"), state: el.querySelector(".ms-state"), nums: el.querySelector("[data-nums]") };

    el.addEventListener("input", (e) => {
      const t = e.target;
      const key = t.dataset && t.dataset.key;
      if (!key) return;
      let v;
      if (t.type === "checkbox") v = t.checked;
      else if (t.type === "range" || t.hasAttribute("data-num")) v = Number(t.value);
      else v = t.value;
      setSetting(key, v);
      if (key === "sizeMin" || key === "sizeMax") syncPanel();
      else updateOutputs();
    });

    el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]");
      if (a) return action(a.dataset.act, a);
      const b = e.target.closest("[data-act2]");
      if (b) return presetAction(b.dataset.act2);
      const pg = e.target.closest("[data-page]");
      if (pg) return showPage(pg.dataset.page);
      const vb = e.target.closest("[data-vibe]");
      if (vb) return applyVibe(vb.dataset.vibe);
      const st = e.target.closest("[data-set]");
      if (st) {
        setSetting(st.dataset.set, st.dataset.val);
        return syncPanel();
      }
      if (e.target.closest("[data-cover]")) paintCover();
    });

    // Moods: the mouse wheel scrolls the strip sideways
    const vibes = el.querySelector(".ms-vibes");
    vibes.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        const max = vibes.scrollWidth - vibes.clientWidth;
        if ((e.deltaY < 0 && vibes.scrollLeft <= 0) || (e.deltaY > 0 && vibes.scrollLeft >= max)) return;
        e.preventDefault();
        vibes.scrollLeft += e.deltaY;
      },
      { passive: false }
    );

    el.querySelector("[data-songfile]").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        await songDb.put(f);
      } catch (err) {
        return toast("Couldn't save the song (storage blocked?)");
      }
      S.songName = f.name;
      S.beatSync = true;
      setSetting("songId", Date.now()); // saves everything; the storm tab reloads the song
      syncPanel();
      toast(`Song “${f.name}” chosen`, "beat");
    });

    el.querySelectorAll(".ms-tags").forEach(initTagBox);
    el.querySelectorAll(".ms-folders").forEach(initFolderBox);
    loadMsPlaylists().then((list) => {
      const box = el.querySelector('[data-key="playlist"]');
      if (!box) return;
      box.innerHTML = list.length ? list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${p.kind === "image" ? "images" : "scenes"})</option>`).join("") : '<option value="">No playlists yet</option>';
      if (S.source === "playlist" && list.length && !list.some((p) => p.id === S.playlist)) setSetting("playlist", list[0].id);
      box.value = S.playlist;
      syncPanel();
    });
    el.querySelectorAll(".ms-rgpick").forEach(initRgPickBox);
    renderPresets();
    syncPanel();
    syncState();
    return panel;
  }

  function updateOutputs() {
    if (!panel) return;
    panel.el.querySelectorAll("output[data-out]").forEach((o) => {
      const k = o.dataset.out;
      o.textContent = FORMAT[k] ? FORMAT[k](S[k]) : S[k];
    });
    // Fill level of the sliders for the hatching
    panel.el.querySelectorAll('input[type="range"]').forEach((r) => {
      const min = Number(r.min), max = Number(r.max);
      r.style.setProperty("--p", ((Number(r.value) - min) / (max - min || 1)) * 100 + "%");
    });
    const el = panel.el;
    el.querySelectorAll("[data-sum]").forEach((s) => {
      const t = SUMS[s.dataset.sum] ? SUMS[s.dataset.sum]() : "";
      if (s.textContent !== t) s.textContent = t;
      s.title = t;
    });
    el.querySelectorAll(".ms-tile").forEach((t) => t.classList.toggle("ms-mod", !!(MODS[t.dataset.page] && MODS[t.dataset.page]())));
    el.querySelectorAll("[data-when]").forEach((c) => (c.hidden = !c.dataset.when.split(",").includes(S.layout)));
    el.querySelectorAll("[data-set]").forEach((b) => {
      const on = String(S[b.dataset.set]) === b.dataset.val;
      b.classList.toggle("ms-on", on);
      b.setAttribute("aria-pressed", on);
    });
    const vibe = activeVibe();
    el.querySelectorAll("[data-vibe]").forEach((b) => {
      b.classList.toggle("ms-on", b.dataset.vibe === vibe);
      b.setAttribute("aria-pressed", b.dataset.vibe === vibe);
    });
    const lh = el.querySelector("[data-layout-hint]");
    if (lh) lh.textContent = LAYOUT_HINTS[S.layout] || "";
  }

  function syncPanel() {
    if (!panel) return;
    panel.el.querySelectorAll("[data-key]").forEach((inp) => {
      const v = S[inp.dataset.key];
      if (inp.type === "checkbox") inp.checked = !!v;
      else inp.value = v;
    });
    panel.el.querySelectorAll(".ms-tags, .ms-folders, .ms-rgpick").forEach((b) => b._render && b._render());
    const dlDir = panel.el.querySelector('[data-key="rgDlDir"]');
    if (dlDir && !dlDir.dataset.filled) {
      dlDir.dataset.filled = "1";
      defaultDownloadBase().then((p) => (dlDir.placeholder = p)).catch(() => {});
    }
    const sn = panel.el.querySelector("[data-songname]");
    sn.textContent = S.songName || "No song yet";
    sn.classList.toggle("ms-none", !S.songName);
    const rb = panel.el.querySelector("[data-rb]");
    rb.textContent = document.getElementById("stash-background-style") || remoteActive() ? "" : "plugin not active";
    // Source: a playlist decides on its own – then the filters are hidden
    panel.el.querySelectorAll(".ms-cond-src").forEach((c) => (c.hidden = (c.dataset.src === "playlist") !== (S.source === "playlist")));
    // Tags: one box at a time (scenes and images, or marker clips); a note says when the other one has tags too
    panel.el.querySelectorAll(".ms-tags[data-tt]").forEach((b) => (b.hidden = b.dataset.tt !== S.tagTarget));
    const other = panel.el.querySelector("[data-tt-other]");
    if (other) {
      const n = S.tagTarget === "marker" ? S.includeTags.length : S.markerTags.length;
      other.hidden = !n;
      other.textContent = n ? (S.tagTarget === "marker" ? `Also active: ${n} ${n === 1 ? "tag" : "tags"} for scenes and images` : `Also active: ${n} ${n === 1 ? "tag" : "tags"} for marker clips`) : "";
    }
    updateOutputs();
  }

  function initTagBox(box) {
    const key = box.dataset.tags;
    const chips = box.querySelector(".ms-chips");
    const input = box.querySelector("input");
    const sugg = box.querySelector(".ms-sugg");
    let timer;
    let results = [];

    const render = () => {
      chips.innerHTML = S[key]
        .map((t, i) => `<span class="ms-chip">${esc(t.name)}<button data-i="${i}" title="Remove">×</button></span>`)
        .join("");
    };
    const commit = () => {
      save();
      render();
      onSettingChanged(key);
    };
    const add = (t) => {
      if (!S[key].some((x) => x.id === t.id)) S[key].push({ id: t.id, name: t.name });
      input.value = "";
      sugg.hidden = true;
      results = [];
      commit();
    };

    chips.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]");
      if (!b) return;
      S[key].splice(Number(b.dataset.i), 1);
      commit();
    });
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (!q) {
        sugg.hidden = true;
        return;
      }
      timer = setTimeout(async () => {
        try {
          const perf = box.dataset.what === "performer";
          const mk = box.dataset.what === "marker";
          const d = perf
            ? await gql(`query($f: FindFilterType) { findPerformers(filter: $f) { performers { id name image_count scene_count } } }`, { f: { q, per_page: 8 } })
            : mk
              // (without the recursive switch only tags that have marker clips themselves; with it a parent tag – whose
              // sub-tags have the markers – shows up too)
              ? await gql(`query($f: FindFilterType, $t: TagFilterType) { findTags(filter: $f, tag_filter: $t) { tags { id name scene_marker_count children { id } } } }`, { f: { q, per_page: 8 }, t: S.tagsDeep ? {} : { marker_count: { value: 0, modifier: "GREATER_THAN" } } })
              : await gql(`query($f: FindFilterType) { findTags(filter: $f) { tags { id name image_count scene_count } } }`, { f: { q, per_page: 8 } });
          results = perf ? d.findPerformers.performers : d.findTags.tags;
          sugg.innerHTML = results.length
            ? results.map((t, i) => `<div class="ms-sug" data-i="${i}">${esc(t.name)}<small>${mk ? (t.scene_marker_count || 0) + " M" + (t.children && t.children.length ? " · " + t.children.length + " sub" : "") : t.image_count + " I · " + t.scene_count + " V"}</small></div>`).join("")
            : `<div class="ms-sug ms-none">${perf ? "No performers found" : "No tags found"}</div>`;
          sugg.hidden = false;
        } catch (e) {
          console.error("[MediaStorm]", e);
        }
      }, 180);
    });
    sugg.addEventListener("mousedown", (e) => {
      const s = e.target.closest("[data-i]");
      if (!s) return;
      e.preventDefault();
      add(results[Number(s.dataset.i)]);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && results[0] && !sugg.hidden) {
        e.preventDefault();
        add(results[0]);
      }
    });
    input.addEventListener("blur", () => setTimeout(() => (sugg.hidden = true), 150));
    box._render = render;
    render();
  }

  // ---------- Folders ----------

  const folderData = { loaded: false, loading: null, nodes: null, roots: [] };
  const folderOpen = new Set();
  const baseName = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;

  // Loads all folders plus the media count per folder (from the file list) and builds a tree.
  // Folders without images/videos (including subfolders) are hidden.
  function loadFolders() {
    if (!folderData.loading) {
      folderData.loading = (async () => {
        const d = await gql(`query {
          findFolders(filter: { per_page: -1 }) { folders { id path parent_folder { id } } }
          findFiles(filter: { per_page: -1 }) { files { __typename parent_folder { id } } }
        }`);
        const nodes = new Map();
        for (const f of d.findFolders.folders) {
          nodes.set(f.id, { id: f.id, path: f.path, parent: f.parent_folder && f.parent_folder.id, name: baseName(f.path), kids: [], img: 0, vid: 0 });
        }
        for (const file of d.findFiles.files) {
          const n = file.parent_folder && nodes.get(file.parent_folder.id);
          if (!n) continue;
          if (file.__typename === "ImageFile") n.img++;
          else if (file.__typename === "VideoFile") n.vid++;
        }
        for (const n of nodes.values()) {
          const p = n.parent && nodes.get(n.parent);
          if (p) p.kids.push(n);
        }
        const total = (n) => {
          n.timg = n.img;
          n.tvid = n.vid;
          n.kids.forEach((k) => {
            total(k);
            n.timg += k.timg;
            n.tvid += k.tvid;
          });
        };
        const keep = (list) => list.filter((n) => n.timg + n.tvid > 0);
        let roots = [...nodes.values()].filter((n) => !n.parent || !nodes.has(n.parent));
        roots.forEach(total);
        roots = keep(roots);
        // Skip empty intermediate levels like a bare drive root
        while (roots.length === 1 && !roots[0].img && !roots[0].vid && keep(roots[0].kids).length === 1) roots = keep(roots[0].kids);
        const sortRec = (n) => {
          n.kids = keep(n.kids).sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }));
          n.kids.forEach(sortRec);
        };
        roots.forEach(sortRec);
        roots.forEach((r) => folderOpen.add(r.id));
        Object.assign(folderData, { nodes, roots, loaded: true });
      })().catch((e) => {
        folderData.loading = null;
        throw e;
      });
    }
    return folderData.loading;
  }

  function isFolderInside(id, ancestorId) {
    let n = folderData.nodes && folderData.nodes.get(id);
    while (n && n.parent) {
      if (n.parent === ancestorId) return true;
      n = folderData.nodes.get(n.parent);
    }
    return false;
  }

  function initFolderBox(box) {
    const chips = box.querySelector("[data-fchips]");
    const search = box.querySelector("[data-fsearch]");
    const tree = box.querySelector("[data-ftree]");

    const renderChips = () => {
      chips.innerHTML = S.folders
        .map((f, i) => `<span class="ms-chip" title="${esc(f.path)}">${esc(baseName(f.path))}<button data-i="${i}" title="Remove">×</button></span>`)
        .join("");
    };

    const renderTree = () => {
      if (!folderData.loaded) return;
      const sel = new Set(S.folders.map((f) => f.id));
      const q = search.value.trim().toLowerCase();
      const matches = (n) => !q || n.path.toLowerCase().includes(q) || n.kids.some(matches);
      const row = (n, depth, implied) => {
        if (!matches(n)) return "";
        const on = sel.has(n.id);
        const open = !!q || folderOpen.has(n.id);
        const caret = n.kids.length
          ? `<button class="ms-fn-caret${open ? " ms-open" : ""}" data-ftoggle="${n.id}" title="Expand/collapse">▸</button>`
          : '<span class="ms-fn-caret"></span>';
        const kids = n.kids.length
          ? `<div class="ms-fn-kids"${open ? "" : " hidden"}>${n.kids.map((k) => row(k, depth + 1, implied || on)).join("")}</div>`
          : "";
        return (
          `<div class="ms-fn"><div class="ms-fn-row" style="--d:${depth}">${caret}` +
          `<label class="ms-fn-label${implied ? " ms-implied" : ""}" title="${esc(n.path)}">` +
          `<input type="checkbox" data-fid="${n.id}"${on || implied ? " checked" : ""}${implied ? " disabled" : ""}>` +
          `<span>${esc(depth === 0 ? n.path : n.name)}</span></label>` +
          `<small>${n.timg} B · ${n.tvid} V</small></div>${kids}</div>`
        );
      };
      tree.innerHTML = folderData.roots.map((r) => row(r, 0, false)).join("") || '<div class="ms-hint">No folders found</div>';
    };

    const commit = () => {
      save();
      onSettingChanged("folders");
      renderChips();
      renderTree();
    };

    tree.addEventListener("click", (e) => {
      const t = e.target.closest("[data-ftoggle]");
      if (!t) return;
      e.preventDefault();
      const id = t.dataset.ftoggle;
      if (folderOpen.has(id)) folderOpen.delete(id);
      else folderOpen.add(id);
      renderTree();
    });
    tree.addEventListener("change", (e) => {
      const cb = e.target.closest("input[data-fid]");
      if (!cb) return;
      const n = folderData.nodes.get(cb.dataset.fid);
      if (cb.checked) {
        // A parent folder already includes selected subfolders
        S.folders = S.folders.filter((f) => !isFolderInside(f.id, n.id));
        S.folders.push({ id: n.id, path: n.path });
      } else {
        S.folders = S.folders.filter((f) => f.id !== n.id);
      }
      commit();
    });
    chips.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]");
      if (!b) return;
      S.folders = S.folders.filter((_, i) => i !== Number(b.dataset.i));
      commit();
    });
    search.addEventListener("input", renderTree);

    // Only load when the page is opened
    box.closest(".ms-page").addEventListener("ms-open", async () => {
      if (folderData.loaded) return;
      try {
        await loadFolders();
        renderTree();
      } catch (err) {
        tree.innerHTML = `<div class="ms-hint">Error while loading: ${esc(err.message)}</div>`;
      }
    });

    box._render = () => {
      renderChips();
      renderTree();
    };
    renderChips();
  }

  // ---------- RedGifs picker ----------

  const rgPickKey = (p) => p.type + ":" + String(p.id).toLowerCase();
  const RG_TYPE_LABEL = { niche: "Niche", tag: "Tag", user: "Creator" };
  const rgPickText = (p) => (p.type === "user" ? "@" : p.type === "tag" ? "#" : "") + p.name;

  function initRgPickBox(box) {
    const chips = box.querySelector("[data-rgchips]");
    const input = box.querySelector("[data-rgq]");
    const sugg = box.querySelector(".ms-sugg");
    let timer;
    let seq = 0;
    let flat = [];
    let active = -1;

    const render = () => {
      chips.innerHTML = S.rgPicks
        .map((p, i) => {
          const title = RG_TYPE_LABEL[p.type] + (p.count ? ` · ${fmtNum(p.count)} Clips` : "");
          return `<span class="ms-chip ms-chip-${p.type}" title="${esc(title)}">${esc(rgPickText(p))}<button data-i="${i}" title="Remove">×</button></span>`;
        })
        .join("");
    };
    const commit = () => {
      save();
      render();
      onSettingChanged("rgPicks");
    };
    const hide = () => {
      sugg.hidden = true;
      flat = [];
      active = -1;
    };
    const highlight = () => {
      sugg.querySelectorAll("[data-i]").forEach((el) => {
        const on = Number(el.dataset.i) === active;
        el.classList.toggle("ms-active", on);
        if (on) el.scrollIntoView({ block: "nearest" });
      });
    };
    const add = (p) => {
      if (!p) return;
      if (!S.rgPicks.some((x) => rgPickKey(x) === rgPickKey(p))) S.rgPicks.push({ type: p.type, id: p.id, name: p.name, count: p.count });
      input.value = "";
      hide();
      commit();
    };
    const showResults = (res) => {
      flat = [...res.niches, ...res.tags, ...res.users];
      if (!flat.length) {
        sugg.innerHTML = '<div class="ms-sug ms-none">Nothing found</div>';
        sugg.hidden = false;
        return;
      }
      let i = 0;
      const group = (title, list) =>
        !list.length
          ? ""
          : `<div class="ms-sug-head">${title}</div>` +
            list
              .map((p) => {
                const taken = S.rgPicks.some((x) => rgPickKey(x) === rgPickKey(p));
                const meta = [p.count ? fmtNum(p.count) + " clips" : "", p.sub ? fmtNum(p.sub) + (p.type === "user" ? " followers" : " subscribers") : ""]
                  .filter(Boolean)
                  .join(" · ");
                const pic = p.thumb
                  ? `<img src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
                  : `<i class="ms-sug-ic">${p.type === "user" ? "@" : "#"}</i>`;
                const check = p.verified ? ' <b class="ms-verified" title="Verified">✓</b>' : "";
                return `<div class="ms-sug ms-sug-rich${taken ? " ms-taken" : ""}" data-i="${i++}">${pic}<span>${esc(p.name)}${check}</span><small>${meta}</small></div>`;
              })
              .join("");
      sugg.innerHTML = group("Niches", res.niches) + group("Tags", res.tags) + group("Creator", res.users);
      sugg.hidden = false;
      active = 0;
      highlight();
    };

    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) {
        seq++;
        hide();
        return;
      }
      timer = setTimeout(async () => {
        const mine = ++seq;
        if (sugg.hidden) {
          sugg.innerHTML = '<div class="ms-sug ms-none">Searching …</div>';
          sugg.hidden = false;
        }
        try {
          const raw = await rgSuggestRaw(q);
          if (mine === seq) showResults(rgRank(raw, q));
        } catch (e) {
          console.error("[MediaStorm] suggestions", e);
          if (mine === seq) {
            flat = [];
            sugg.innerHTML = `<div class="ms-sug ms-none">Error: ${esc(e.message)}</div>`;
            sugg.hidden = false;
          }
        }
      }, 300);
    });
    input.addEventListener("keydown", (e) => {
      if (sugg.hidden || !flat.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length;
        highlight();
      } else if (e.key === "Enter") {
        e.preventDefault();
        add(flat[Math.max(active, 0)]);
      }
    });
    input.addEventListener("blur", () => setTimeout(hide, 150));
    sugg.addEventListener("mousedown", (e) => {
      const row = e.target.closest("[data-i]");
      if (!row) return;
      e.preventDefault(); // keep the focus in the search field
      add(flat[Number(row.dataset.i)]);
    });
    chips.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]");
      if (!b) return;
      S.rgPicks = S.rgPicks.filter((_, i) => i !== Number(b.dataset.i));
      commit();
    });

    box._render = render;
    render();
  }

  // ---------- Presets ----------

  function renderPresets() {
    if (!panel) return;
    const presets = store.get(LS_PRESETS, {});
    const names = Object.keys(presets).sort();
    panel.el.querySelector("[data-preset]").innerHTML = names.length
      ? names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
      : '<option value="">– no presets –</option>';
    updateOutputs();
  }

  function presetAction(act) {
    const presets = store.get(LS_PRESETS, {});
    const selName = panel.el.querySelector("[data-preset]").value;
    const nameInput = panel.el.querySelector("[data-preset-name]");
    if (act === "preset-save") {
      const name = nameInput.value.trim() || selName || "Preset " + (Object.keys(presets).length + 1);
      presets[name] = clone(S);
      store.set(LS_PRESETS, presets);
      nameInput.value = "";
      renderPresets();
      panel.el.querySelector("[data-preset]").value = name;
      toast(`Preset “${name}” saved`);
    } else if (act === "preset-load") {
      if (!presets[selName]) return;
      S = normalizeSettings(presets[selName]);
      save();
      syncPanel();
      applyAll();
      toast(`Preset “${selName}” loaded`);
    } else if (act === "preset-del") {
      if (!presets[selName]) return;
      delete presets[selName];
      store.set(LS_PRESETS, presets);
      renderPresets();
      toast(`Preset “${selName}” deleted`);
    } else if (act === "song-pick") {
      panel.el.querySelector("[data-songfile]").click();
    } else if (act === "song-del") {
      songDb.del().catch(() => {});
      S.songName = "";
      setSetting("songId", Date.now());
      syncPanel();
    } else if (act === "clear-filters") {
      clearFilters();
    } else if (act === "reset") {
      S = normalizeSettings({});
      save();
      syncPanel();
      applyAll();
      toast("Settings reset");
    }
  }

  function openPanel() {
    ensurePanel();
    syncPanel();
    const fresh = !panelOpen();
    panel.el.classList.add("ms-open");
    if (emptyNotice || !panel.page) showPage("home");
    if (fresh) paintCover();
    renderEmpty();
  }
  function closePanel() {
    if (panel) panel.el.classList.remove("ms-open");
  }
  function togglePanel() {
    if (panel && panel.el.classList.contains("ms-open")) closePanel();
    else openPanel();
  }
  const panelOpen = () => !!(panel && panel.el.classList.contains("ms-open"));

  // ==========================================================================
  // Hotkeys
  // ==========================================================================

  function isTyping(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable) return true;
    if (t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
    if (t.tagName === "INPUT") return !/^(range|checkbox|radio|button|submit)$/i.test(t.type);
    return false;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        if (run.active) {
          e.preventDefault();
          e.stopImmediatePropagation();
          stop();
        } else if (panelOpen()) {
          e.stopImmediatePropagation();
          if (panel.page && panel.page !== "home") showPage("home");
          else closePanel();
        }
        return;
      }
      if (!run.active || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      let handled = true;
      switch (e.key.toLowerCase()) {
        case " ": togglePause(); break;
        case "n": wave(false); break;
        case "b": rerollBackground(false); break;
        case "l": cycleLayout(); break;
        case "v": cycleVibe(); break;
        case "c": clearItems(); break;
        case "f": toggleFullscreen(); break;
        case "h": setSetting("showHud", !S.showHud); syncPanel(); break;
        case "s": togglePanel(); break;
        case "d": {
          const target = run.focused || run.hovered;
          if (target && target.d.kind === "redgifs") downloadItem(target);
          else toast("Hover over a RedGifs clip, then press D", "dl");
          break;
        }
        case "arrowup": nudgeVolume(5); break;
        case "arrowdown": nudgeVolume(-5); break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!run.active) return;
      if (S.layout === "grid" || FLOW.has(S.layout)) relayoutAll(true);
      else if (!MOVING.has(S.layout)) run.items.forEach((it) => !(isFinite(it.w) && isFinite(it.x)) && placeItem(it, false));
    }, 200);
  });

  // ==========================================================================
  // Navbar-Button
  // ==========================================================================

  function injectNavButton() {
    if (document.querySelector(".ms-nav-btn")) return;
    const bar = document.querySelector(".navbar-buttons");
    if (!bar) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn nav-link d-flex align-items-center ms-nav-btn";
    b.title = "Media Storm";
    b.innerHTML = icon("bolt") + '<span class="d-none d-md-inline">Storm</span>';
    b.addEventListener("click", togglePanel);
    b.classList.toggle("ms-on", run.active);
    bar.insertBefore(b, bar.firstChild);
  }

  // If Random Backgrounds isn't installed, the storm tab provides a wallpaper layer itself
  // (same CSS, same image choice via the tag "background").
  function ensureBackgroundLayer() {
    if (document.getElementById("stash-background-style")) return;
    const style = document.createElement("style");
    style.id = "stash-background-style";
    style.textContent = `body::after { content: ""; position: fixed; inset: 0; z-index: -1;
      background-image: var(--stash-bg-image); background-size: cover; background-position: center;
      background-repeat: no-repeat; pointer-events: none; }`;
    document.head.appendChild(style);
    rerollBackground(true);
  }

  if (IS_STAGE) {
    window.addEventListener("pointerdown", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    window.addEventListener("pagehide", () => post({ status: { active: false } }));
    ensureBackgroundLayer();
    start();
  } else {
    let navQueued = false;
    new MutationObserver(() => {
      if (navQueued) return;
      navQueued = true;
      setTimeout(() => {
        navQueued = false;
        injectNavButton();
      }, 50);
    }).observe(document.body, { childList: true, subtree: true });
    injectNavButton();
    // Is a storm tab already running? Ask for the status and regularly drop stale status.
    post({ cmd: "ping" });
    let wasActive = false;
    setInterval(() => {
      const now = remoteActive();
      if (now !== wasActive) syncState();
      wasActive = now;
    }, 1000);
  }

  window.MediaStorm = { start: IS_STAGE ? start : openStage, stop, togglePause, rerollBackground, openPanel, settings: () => S };
})();
